#!/usr/bin/env node
'use strict';

/**
 * Import a MyAnimeList export from the command line.
 *
 *   npm run import-mal -- path/to/animelist.xml --username yourname
 *   npm run import-mal -- path/to/animelist.xml.gz --username yourname --apply
 *
 * On Windows, passing arguments through `npm run` is unreliable — PowerShell
 * reads a leading `--` as its decrement operator. Call node directly instead:
 *
 *   node scripts/import-mal.js "path/to/animelist.xml.gz" --username yourname
 *   node scripts/import-mal.js "path/to/animelist.xml.gz" --username yourname --apply
 *
 * Without --apply it only reports — it writes nothing. This exists so you can
 * check the database half of an import without going through the browser.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');

const importer = require('../src/services/malImport');

function parseArgs(argv) {
  const args = { file: '', username: '', apply: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--username') args.username = String(argv[++i] || '').trim();
    else if (a.startsWith('--username=')) args.username = a.slice(11).trim();
    else if (!a.startsWith('--')) rest.push(a);
  }
  args.file = rest[0] || '';
  return args;
}

function loadEnv() {
  const root = path.join(__dirname, '..');
  const file = fs.existsSync(path.join(root, '.env')) ? path.join(root, '.env') : path.join(root, 'login.env');
  require('dotenv').config({ path: file });
  return root;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function friendly(err) {
  const code = err && (err.code || err.errno);
  const map = {
    ECONNREFUSED: 'MySQL refused the connection — is the MySQL server running?',
    ER_ACCESS_DENIED_ERROR: 'Wrong database username or password in .env.',
    ER_BAD_DB_ERROR: 'That database does not exist on this server.',
    ENOTFOUND: 'That database host could not be found.',
  };
  return map[code] || (err && err.message) || String(err);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  if (!args.file) {
    console.log('');
    console.log('  Usage (works in any shell):');
    console.log('      node scripts/import-mal.js "path/to/animelist.xml" --username yourname');
    console.log('      node scripts/import-mal.js "path/to/animelist.xml" --username yourname --apply');
    console.log('');
    console.log('  On Windows, prefer that form: PowerShell misreads a leading -- when');
    console.log('  it is passed through npm run.');
    console.log('');
    process.exit(2);
  }
  if (!fs.existsSync(args.file)) {
    console.error('\n  File not found: ' + args.file + '\n');
    process.exit(1);
  }

  // parse first — it needs no database, so a bad file fails before we connect
  let parsed;
  try {
    // the service decompresses gzip, so hand it the raw bytes
    parsed = importer.parse(fs.readFileSync(args.file), args.file);
  } catch (err) {
    console.error('\n  Could not read that export: ' + err.message + '\n');
    process.exit(1);
  }
  const { entries, duplicates } = importer.dedupe(parsed.entries);
  if (!entries.length) {
    console.error('\n  No entries could be read from that file.\n');
    parsed.problems.slice(0, 10).forEach((p) => console.error('    - ' + p));
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // eslint-disable-next-line global-require
  const { pool } = require('../src/config/db');
  const runner = require('../src/services/importRunner');

  try {
    let username = args.username;
    if (!username) username = await ask('  Which account should these go to? (username): ');
    const [users] = await conn.execute('SELECT id, display_name FROM users WHERE username = ? LIMIT 1', [username.trim().toLowerCase()]);
    if (!users.length) {
      console.error('\n  No account with that username.\n');
      process.exit(1);
    }
    const user = users[0];

    const preview = await runner.buildPreview(user.id, entries);

    console.log('');
    console.log('  File          : ' + path.basename(args.file) + '  (' + parsed.format + ')');
    console.log('  Account       : ' + (user.display_name || email));
    console.log('');
    console.log('  Entries read  : ' + entries.length + (duplicates ? '  (' + duplicates + ' duplicate id(s) collapsed)' : ''));
    console.log('  Found here    : ' + preview.matched.length);
    console.log('  Not in the db : ' + preview.unmatched.length);
    console.log('  New to list   : ' + preview.newEntries);
    console.log('  Would update  : ' + preview.alreadyTracked);
    if (parsed.problems.length) console.log('  Unreadable    : ' + parsed.problems.length);
    console.log('');
    console.log('  By status     : ' + Object.entries(preview.byStatus).map(([s, n]) => s + '=' + n).join(', '));

    if (preview.unmatched.length) {
      console.log('');
      console.log('  Not in the catalogue (first 10):');
      preview.unmatched.slice(0, 10).forEach((e) => console.log('    - ' + (e.title || 'MAL #' + e.malId)));
      if (preview.unmatched.length > 10) console.log('    ...and ' + (preview.unmatched.length - 10) + ' more');
      console.log('');
      console.log('  These are on your list but not in the catalogue, so they cannot import.');
      console.log('  Add them, then run this again:');
      console.log('');
      console.log('      npm run add-anime ' + preview.unmatched.map((e) => e.malId).join(' '));
    }

    console.log('');
    console.log('  Not carried across: ' + importer.NOT_IMPORTED.join(', '));
    console.log('');

    if (!args.apply) {
      console.log('  This was a dry run. Nothing was written.');
      console.log('  Add --apply to write these ' + preview.matched.length + ' entries.\n');
      return;
    }
    if (!preview.matched.length) {
      console.log('  Nothing to write.\n');
      return;
    }

    const answer = await ask('  Write ' + preview.matched.length + ' entries to ' + (user.display_name || email) + '? (yes/no): ');
    if (!/^y(es)?$/i.test(answer)) {
      console.log('\n  Cancelled. Nothing was written.\n');
      return;
    }

    const result = await runner.applyImport(user.id, preview.matched);
    console.log('');
    console.log('  Imported ' + result.imported + ' entries (' + result.inserted + ' new, ' + result.updated + ' updated).');
    console.log('');
  } finally {
    await conn.end().catch(() => {});
    if (pool && typeof pool.end === 'function') await pool.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error('\n  ' + friendly(e) + '\n');
  process.exit(1);
});
