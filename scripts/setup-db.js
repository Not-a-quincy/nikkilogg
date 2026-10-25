#!/usr/bin/env node
'use strict';

/**
 * Nikkilog — database setup helper
 *
 * Finds which MySQL database holds your Nikkilog tables and writes the
 * connection details into .env for you.
 *
 *   npm run setup-db
 *
 * It asks for your MySQL password, then looks for a database containing an
 * "anime" table. Non-interactive use is also supported:
 *
 *   npm run setup-db -- --user root --password secret --db nikkilog
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = fs.existsSync(path.join(ROOT, '.env'))
  ? path.join(ROOT, '.env')
  : path.join(ROOT, 'login.env');
const ENV_WRITE = path.join(ROOT, '.env');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const body = a.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) out[body.slice(0, eq)] = body.slice(eq + 1);
    else out[body] = argv[++i];
  }
  return out;
}

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const map = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

function quoteIfNeeded(value) {
  if (value === undefined || value === null) return '';
  const v = String(value);
  if (v === '' || /[\s#"'=]/.test(v)) return `"${v.replace(/"/g, '\\"')}"`;
  return v;
}

function writeEnv(map, file = ENV_WRITE) {
  const order = ['SECRET_KEY', 'BASE_URL', 'PORT', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const lines = [];
  const seen = new Set();
  for (const k of order) {
    if (map[k] !== undefined && map[k] !== '') { lines.push(`${k}=${quoteIfNeeded(map[k])}`); seen.add(k); }
  }
  for (const k of Object.keys(map)) {
    if (!seen.has(k) && map[k] !== undefined && map[k] !== '') lines.push(`${k}=${quoteIfNeeded(map[k])}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

function ask(question, def) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question}${def ? ` [${def}]` : ''}: `, (ans) => {
      rl.close();
      resolve((ans || '').trim() || def || '');
    });
  });
}

function askHidden(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      ask(question).then(resolve);
      return;
    }
    process.stdout.write(`${question}: `);
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    let input = '';
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(input);
    };
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish();
      if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1); }
      if (ch === '\u007f' || ch === '\b') {
        if (input) { input = input.slice(0, -1); process.stdout.write('\b \b'); }
        return;
      }
      input += ch;
      process.stdout.write('*');
    };
    stdin.on('data', onData);
  });
}

function friendly(err) {
  const code = err && (err.code || err.errno);
  const map = {
    ECONNREFUSED: 'MySQL refused the connection — is the MySQL server running?',
    ER_ACCESS_DENIED_ERROR: 'Wrong username or password.',
    ENOTFOUND: 'That host name could not be found.',
    ETIMEDOUT: 'Timed out reaching the host.',
  };
  return map[code] || (err && err.message) || String(err);
}

async function main() {
  const args = parseArgs(process.argv);
  const existing = readEnv(ENV_PATH);
  const interactive = process.stdin.isTTY;

  console.log('\nNikkilog — database setup\n');

  if (!interactive && (!args.user || args.password === undefined)) {
    console.log('Usage: npm run setup-db -- --user root --password <pw> [--db <name>] [--host 127.0.0.1] [--port 3306]');
    process.exit(2);
  }

  const host = args.host || existing.DB_HOST || (interactive ? await ask('MySQL host', '127.0.0.1') : '127.0.0.1');
  const port = parseInt(args.port || existing.DB_PORT || (interactive ? await ask('MySQL port', '3306') : '3306'), 10);
  const user = args.user || existing.DB_USER || (interactive ? await ask('MySQL username', 'root') : 'root');
  const password = args.password !== undefined
    ? args.password
    : (interactive ? await askHidden('MySQL password (press Enter if none)') : '');

  console.log(`\nConnecting to ${user}@${host}:${port} …`);

  let conn;
  try {
    conn = await mysql.createConnection({ host, port, user, password });
  } catch (err) {
    console.error(`\n  Could not connect: ${friendly(err)}`);
    console.error('  Nothing was changed. Fix the details and try again.\n');
    process.exit(1);
  }

  console.log('Connected.');

  let dbName = args.db || existing.DB_NAME || '';
  try {
    const [rows] = await conn.query(
      "SELECT table_schema AS s FROM information_schema.tables WHERE table_name = 'anime' GROUP BY table_schema"
    );
    const candidates = rows.map((r) => r.s);

    if (candidates.length === 1) {
      dbName = candidates[0];
      console.log(`Found your anime database: "${dbName}"`);
    } else if (candidates.length > 1) {
      console.log('\nSeveral databases contain an "anime" table:');
      candidates.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
      if (interactive) {
        const pick = await ask('Which one is Nikkilog? (number or name)', candidates[0]);
        const idx = parseInt(pick, 10);
        dbName = Number.isInteger(idx) && idx >= 1 && idx <= candidates.length ? candidates[idx - 1] : pick;
      } else {
        dbName = dbName || candidates[0];
      }
      console.log(`Using "${dbName}"`);
    } else {
      console.log('\n  No database on this server contains an "anime" table.');
      console.log('  Your Nikkilog data may not be on this MySQL server.');
      if (!dbName) {
        await conn.end();
        process.exit(1);
      }
    }

    // sanity check the chosen database
    if (dbName) {
      const [check] = await conn.query(
        'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [dbName, 'anime']
      );
      if (!check[0].n) {
        console.warn(`  Warning: "${dbName}" does not contain an "anime" table.`);
      }
    }
  } finally {
    await conn.end().catch(() => {});
  }

  const merged = Object.assign({}, existing, {
    DB_HOST: host,
    DB_PORT: String(port),
    DB_USER: user,
    DB_PASSWORD: password,
    DB_NAME: dbName,
  });
  if (!merged.SECRET_KEY) {
    merged.SECRET_KEY = require('crypto').randomBytes(32).toString('hex');
  }
  if (!merged.PORT) merged.PORT = '5000';
  if (!merged.BASE_URL) merged.BASE_URL = `http://127.0.0.1:${merged.PORT}`;

  writeEnv(merged);

  console.log('\n  Wrote your database settings to:');
  console.log(`    ${ENV_WRITE}`);
  console.log(`  Database : ${dbName}`);
  console.log(`  User     : ${user}@${host}:${port}`);
  console.log('\n  Now run:  npm start');
  console.log('  Then open: http://127.0.0.1:5000/api/health\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nUnexpected error:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = { readEnv, writeEnv, quoteIfNeeded, parseArgs, friendly };
