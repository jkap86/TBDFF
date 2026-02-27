#!/usr/bin/env bash
# reset-test-passwords.sh
#
# Updates all test user passwords (test1-test12) to "password" in the database.
# Requires DATABASE_URL env var or .env file in apps/backend.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Resetting test user passwords ==="

cd "$ROOT_DIR/apps/backend"

node -e '
  require("dotenv").config();
  const bcrypt = require("bcrypt");
  const { Pool } = require("pg");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  (async () => {
    const hash = await bcrypt.hash("password", 10);
    const usernames = Array.from({ length: 12 }, (_, i) => "test" + (i + 1));

    const result = await pool.query(
      "UPDATE users SET password_hash = $1 WHERE username = ANY($2::text[])",
      [hash, usernames]
    );

    console.log("Updated " + result.rowCount + " user(s) to password: password");
    await pool.end();
  })().catch(err => { console.error(err); process.exit(1); });
'

echo "=== Done ==="
