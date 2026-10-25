#!/usr/bin/env node
'use strict';

/**
 * Import a .sql dump into the database named in .env.
 *
 *   npm run import-db -- path/to/old-backup.sql
 *
 * Uses the mysql/mariadb command-line client (the most reliable way to run a
 * dump). If it isn't on your PATH the script prints the exact command to run
 * yourself.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV = fs.existsSync(path.join(ROOT, '.env')) ? path.join(ROOT, '.env') : path.join(ROOT, 'login.env');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

const file = process.argv[2];
if (!file) {
  console.log('Usage: npm run import-db -- path/to/backup.sql');
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error('  File not found: ' + file);
  process.exit(1);
}

const env = loadEnv(ENV);
const host = env.DB_HOST || '127.0.0.1';
const port = env.DB_PORT || '3306';
const user = env.DB_USER || 'root';
const db = env.DB_NAME;
if (!db) { console.error('  DB_NAME is not set in .env'); process.exit(1); }

const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['mysql'], { encoding: 'utf8' });
const hasClient = which.status === 0 && which.stdout.trim();

if (!hasClient) {
  console.log('\n  The mysql command-line client was not found on your PATH.');
  console.log('  Run this yourself (it will ask for your password):\n');
  console.log(`    mysql -h ${host} -P ${port} -u ${user} ${db} < "${file}"\n`);
  process.exit(1);
}

console.log(`\n  Importing ${path.basename(file)} into "${db}" on ${host}:${port} …\n`);
const res = spawnSync('mysql', ['-h', host, '-P', port, '-u', user, db], {
  input: fs.readFileSync(file),
  env: Object.assign({}, process.env, { MYSQL_PWD: env.DB_PASSWORD || '' }),
  stdio: ['pipe', 'inherit', 'inherit'],
});

if (res.status === 0) {
  console.log('\n  Import finished. Run "npm start" and open /api/health to confirm.\n');
} else {
  console.error('\n  Import failed (exit ' + res.status + ').');
  console.error('  Tip: if the dump creates its own database, drop the DB_NAME argument and run the printed command by hand.\n');
  process.exit(1);
}
