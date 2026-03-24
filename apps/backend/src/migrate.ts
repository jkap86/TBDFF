import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Arbitrary but fixed lock ID for migration advisory lock.
// Using two int4 args keeps it unlikely to collide with app-level locks.
const MIGRATION_LOCK_ID1 = 123456;
const MIGRATION_LOCK_ID2 = 789012;

async function acquireLock(client: PoolClient): Promise<void> {
  // pg_advisory_lock blocks until the lock is available.
  await client.query('SELECT pg_advisory_lock($1, $2)', [MIGRATION_LOCK_ID1, MIGRATION_LOCK_ID2]);
}

async function releaseLock(client: PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_unlock($1, $2)', [MIGRATION_LOCK_ID1, MIGRATION_LOCK_ID2]);
}

async function migrate() {
  const ssl = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === '1';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(ssl && { ssl: { rejectUnauthorized: false } }),
  });
  const lockClient = await pool.connect();

  try {
    await acquireLock(lockClient);
    console.log('Migration lock acquired.');

    // Create tracking table if it doesn't exist
    await lockClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already-executed migrations
    const { rows: executed } = await lockClient.query('SELECT name FROM schema_migrations');
    const executedSet = new Set(executed.map((r) => r.name));

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !executedSet.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Running ${pending.length} migration(s)...`);

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      // Each migration runs in its own transaction using a separate client so
      // the advisory lock (session-level) on lockClient stays held throughout.
      const migrationClient = await pool.connect();
      try {
        await migrationClient.query('BEGIN');
        await migrationClient.query(sql);
        await migrationClient.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await migrationClient.query('COMMIT');
        console.log(`  -> ${file}`);
      } catch (err) {
        await migrationClient.query('ROLLBACK');
        throw err;
      } finally {
        migrationClient.release();
      }
    }

    console.log('Migrations complete.');
  } finally {
    // Always release the advisory lock and clean up, even on error or process exit.
    // releaseLock uses pg_advisory_unlock to explicitly free the session-level lock.
    // The .catch(() => {}) prevents unlock errors from masking the original error.
    // lockClient.release() also implicitly frees all session-level advisory locks
    // held by this connection as a safety net.
    await releaseLock(lockClient).catch(() => {});
    console.log('Migration lock released.');
    lockClient.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
