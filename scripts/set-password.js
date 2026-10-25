#!/usr/bin/env node
'use strict';

/**
 * Set (or reset) the password for an existing account.
 *
 *   npm run set-password -- --username yourname
 *
 * Useful when you bring over an older database: accounts created through the
 * old Google sign-in have no password, so they can't log in until you set one.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { hashPassword, passwordProblem } = require('../src/services/password');

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

function friendly(err) {
  const code = err && (err.code || err.errno);
  const map = {
    ECONNREFUSED: 'MySQL refused the connection — is the MySQL server running?',
    ER_ACCESS_DENIED_ERROR: 'Wrong database username or password in .env.',
    ER_BAD_DB_ERROR: 'That database does not exist on this server.',
    ENOTFOUND: 'That database host could not be found.',
    ETIMEDOUT: 'Timed out reaching the database host.',
  };
  return map[code] || (err && err.message) || String(err);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const b = a.slice(2);
    const eq = b.indexOf('=');
    if (eq !== -1) out[b.slice(0, eq)] = b.slice(eq + 1);
    else out[b] = argv[++i];
  }
  return out;
}

function ask(q) {
  const readline = require('readline');
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q + ': ', (a) => { rl.close(); resolve(a || ''); });
  });
}

function askHidden(q) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve('');
    process.stdout.write(q + ': ');
    const stdin = process.stdin;
    stdin.resume(); stdin.setRawMode(true); stdin.setEncoding('utf8');
    let v = '';
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', on); process.stdout.write('\n'); resolve(v); };
    const on = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') return done();
      if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1); }
      if (ch === '\u007f' || ch === '\b') { if (v) { v = v.slice(0, -1); process.stdout.write('\b \b'); } return; }
      v += ch; process.stdout.write('*');
    };
    stdin.on('data', on);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv(ENV);
  const wanted = (args.username || '').trim().toLowerCase();

  // No username given? List the accounts in the database so you can find yours.
  if (!wanted) {
    const conn = await mysql.createConnection({
      host: env.DB_HOST || '127.0.0.1', port: parseInt(env.DB_PORT || '3306', 10),
      user: env.DB_USER, password: env.DB_PASSWORD || '', database: env.DB_NAME,
    });
    let rows;
    try {
      [rows] = await conn.query(
        'SELECT id, username, display_name, (password_hash IS NOT NULL) AS has_password FROM users ORDER BY id'
      );
    } catch (e) {
      console.error('\n  Could not read the users table: ' + (e.code || e.message));
      console.error('  Check DB_NAME / DB_USER / DB_PASSWORD in .env (or run: npm run setup-db)\n');
      await conn.end();
      process.exit(1);
    }
    await conn.end();

    if (!rows.length) {
      console.log('\n  No accounts found in "' + (env.DB_NAME || '?') + '".');
      console.log('  That may not be the database holding your old data.\n');
      process.exit(0);
    }
    console.log('\n  Accounts in "' + (env.DB_NAME || '?') + '":\n');
    console.log('    id   username            name                 password');
    console.log('    ---  ------------------  -------------------  --------');
    for (const r of rows) {
      console.log(
        '    ' + String(r.id).padEnd(4) +
        ' ' + String(r.username || '').padEnd(18) +
        ' ' + String(r.display_name || '').slice(0, 19).padEnd(21) +
        ' ' + (r.has_password ? 'set' : 'NONE')
      );
    }
    // If we're in a terminal, just ask which one instead of making them retype
    // the whole command.
    if (process.stdin.isTTY) {
      const picked = (await ask('\n  Username to set a password for (or press Enter to cancel)')).trim().toLowerCase();
      if (!picked) { console.log('\n  Cancelled — nothing changed.\n'); process.exit(0); }
      const match = rows.find((r) => String(r.username || '').toLowerCase() === picked);
      if (!match) {
        console.error('\n  No account with that username. Copy it exactly from the list above.\n');
        process.exit(1);
      }
      const pw = await askHidden('  New password (min 8 characters)');
      const problem = passwordProblem(pw);
      if (problem) { console.error('\n  ' + problem + '\n'); process.exit(1); }
      const c2 = await mysql.createConnection({
        host: env.DB_HOST || '127.0.0.1', port: parseInt(env.DB_PORT || '3306', 10),
        user: env.DB_USER, password: env.DB_PASSWORD || '', database: env.DB_NAME,
      });
      await c2.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(pw), match.id]);
      await c2.end();
      console.log(`\n  Done — password set for ${match.username}.`);
      console.log('  Log in at http://127.0.0.1:5000/login with that username.\n');
      process.exit(0);
    }

    console.log('\n  Give one a password with:');
    console.log('    npm run set-password -- --username <name>\n');
    process.exit(0);
  }

  let password = args.password;
  if (password === undefined) {
    password = await askHidden('New password (min 8 characters)');
  }
  const problem = passwordProblem(password);
  if (problem) { console.error('  ' + problem); process.exit(1); }

  const conn = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1', port: parseInt(env.DB_PORT || '3306', 10),
    user: env.DB_USER, password: env.DB_PASSWORD || '', database: env.DB_NAME,
  });

  const [rows] = await conn.query('SELECT id, display_name FROM users WHERE username = ? LIMIT 1', [wanted]);
  if (!rows.length) {
    console.error('  No account found with that username.');
    await conn.end();
    process.exit(1);
  }

  const hash = await hashPassword(password);
  await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, rows[0].id]);
  await conn.end();

  console.log(`\n  Password set for ${wanted} (${rows[0].display_name || 'no display name'}).`);
  console.log('  You can now log in at /login.\n');
}

main().catch((e) => {
  console.error('\n  ' + friendly(e));
  console.error('  Check DB_NAME / DB_USER / DB_PASSWORD in .env, or run: npm run setup-db\n');
  process.exit(1);
});
