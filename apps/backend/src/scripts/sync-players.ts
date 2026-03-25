import { createContainer } from '../container';

async function main() {
  const container = createContainer();
  console.log('Starting one-time player sync from Sleeper API...');
  try {
    const result = await container.jobs.playerSyncJob.runNow();
    console.log(`Done: ${result.created} created, ${result.updated} updated`);
  } finally {
    await container.pool.end();
  }
}

main().catch((err) => {
  console.error('Player sync failed:', err);
  process.exit(1);
});
