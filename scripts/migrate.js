#!/usr/bin/env node
'use strict';

/**
 * Update the database schema.
 *
 *   npm run migrate
 *
 * The server already does this on every boot, but running it on its own prints
 * exactly what changed without starting anything else — useful the first time
 * you point the app at an older database.
 *
 * Safe to run as often as you like: it only ever adds what is missing, and it
 * never touches existing rows.
 */

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const envFile = fs.existsSync(path.join(root, '.env')) ? path.join(root, '.env') : path.join(root, 'login.env');
require('dotenv').config({ path: envFile });

const { query, describeDbError, pool } = require('../src/config/db');
const { ensureSchema } = require('../src/config/schema');

async function main() {
  const where = [process.env.DB_USER, '@', process.env.DB_HOST || '127.0.0.1', ':', process.env.DB_PORT || '3306', '/', process.env.DB_NAME].join('');
  console.log('\n  Database: ' + where + '\n');

  await query('SELECT 1');
  const changes = await ensureSchema();

  if (!changes.length) {
    console.log('  Already up to date. Nothing to change.\n');
  } else {
    console.log('  Applied ' + changes.length + ' change' + (changes.length === 1 ? '' : 's') + ':');
    changes.forEach((c) => console.log('    - ' + c));
    console.log('');
  }

  const [{ tables }] = [await query(
    `SELECT COUNT(*) AS tables FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
  )];
  console.log('  Tables in this database: ' + tables + '\n');
}

main()
  .catch((err) => {
    const d = describeDbError(err);
    console.error('\n  Could not update the database.');
    console.error('  ' + d.message);
    console.error('  ' + d.hint + '\n');
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
