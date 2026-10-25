'use strict';
// Editing a .env is destructive if done carelessly — it holds a database
// password. These tests exist to make sure nothing but the target line moves.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readEnvVar, writeEnvVar } = require('../src/services/envFile');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envfile-'));
const file = path.join(dir, '.env');

const SAMPLE = [
  '# my config',
  'CONTACT_TWITTER=ughdrag',
  'PORT=5000',
  'SECRET_KEY=',
  'DB_USER=vasanth',
  'DB_PASSWORD=Sup3rSecret!Passw0rd=with=equals',
  'DB_NAME=anime_tracker_db',
  '',
  '# SECRET_KEY=commented_out_value',
  'UPLOADS_DIR=',
].join('\n') + '\n';

fs.writeFileSync(file, SAMPLE);
const before = SAMPLE;

// ---- reading ----
ck('reads a value', readEnvVar(file, 'PORT') === '5000');
ck('reads the twitter handle', readEnvVar(file, 'CONTACT_TWITTER') === 'ughdrag');
ck('reads an empty value as empty', readEnvVar(file, 'SECRET_KEY') === '');
ck('a value containing = survives', readEnvVar(file, 'DB_PASSWORD') === 'Sup3rSecret!Passw0rd=with=equals', readEnvVar(file, 'DB_PASSWORD'));
ck('a commented-out key is not read', readEnvVar(file, 'SECRET_KEY') !== 'commented_out_value');
ck('a missing key is null', readEnvVar(file, 'NOT_THERE') === null);
ck('a missing file is null', readEnvVar(path.join(dir, 'nope.env'), 'PORT') === null);

// ---- writing: replace ----
const action1 = writeEnvVar(file, 'SECRET_KEY', 'a'.repeat(64));
ck('an empty value is replaced, not appended', action1 === 'replaced', action1);
ck('the new value is readable', readEnvVar(file, 'SECRET_KEY') === 'a'.repeat(64));
ck('the password is untouched', readEnvVar(file, 'DB_PASSWORD') === 'Sup3rSecret!Passw0rd=with=equals');

// ---- writing: append ----
const action2 = writeEnvVar(file, 'NODE_ENV', 'development');
ck('a missing key is appended', action2 === 'appended', action2);
ck('the appended value is readable', readEnvVar(file, 'NODE_ENV') === 'development');

// ---- writing: create ----
const fresh = path.join(dir, 'fresh.env');
const action3 = writeEnvVar(fresh, 'SECRET_KEY', 'b'.repeat(64));
ck('a missing file is created', action3 === 'created', action3);
ck('the created file reads back', readEnvVar(fresh, 'SECRET_KEY') === 'b'.repeat(64));

// ---- the whole point: nothing else moved ----
const after = fs.readFileSync(file, 'utf8');
const strip = (t) => t.split('\n').filter((l) => !/^\s*(SECRET_KEY|NODE_ENV)\s*=/.test(l)).join('\n');
ck('every other line is byte-identical', strip(after) === strip(before), 'diff-free');
ck('the comment is preserved', after.includes('# my config'));
ck('the commented-out SECRET_KEY is preserved', after.includes('# SECRET_KEY=commented_out_value'));
ck('blank lines are preserved', after.includes('DB_NAME=anime_tracker_db\n\n'));
ck('no duplicate SECRET_KEY was added', (after.match(/^SECRET_KEY=/gm) || []).length === 1, (after.match(/^SECRET_KEY=/gm) || []).length + ' line(s)');

// ---- a malformed key must be refused, not written ----
const badKeys = ['../etc/passwd', 'foo bar', 'LOWER=case', '', null, 'A-B'];
badKeys.forEach((k) => {
  let threw = false;
  try { writeEnvVar(file, k, 'x'); } catch (e) { threw = true; }
  ck(`refuses the malformed key ${JSON.stringify(k)}`, threw === true);
});
ck('the file is still intact after the refusals', readEnvVar(file, 'DB_PASSWORD') === 'Sup3rSecret!Passw0rd=with=equals');

// ---- CRLF files (a Windows .env) ----
const crlf = path.join(dir, 'crlf.env');
fs.writeFileSync(crlf, 'PORT=5000\r\nSECRET_KEY=\r\nDB_PASSWORD=pw\r\n');
writeEnvVar(crlf, 'SECRET_KEY', 'c'.repeat(64));
ck('a CRLF .env is edited correctly', readEnvVar(crlf, 'SECRET_KEY') === 'c'.repeat(64));
ck('its other values survive', readEnvVar(crlf, 'DB_PASSWORD') === 'pw');
ck('no CRLF line endings are lost', fs.readFileSync(crlf, 'utf8').includes('\r\n'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
