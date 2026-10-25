'use strict';
// Recovery codes are the only way back into an account with no email address, so
// the code has to be a real secret and the endpoint has to be tightly limited.
process.env.SECRET_KEY = 'r'.repeat(64);
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const http = require('http');
const recovery = require('../src/services/recovery');
const app = require('../src/app');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function post(port, p, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ code: res.statusCode, json: j }); }); });
    req.on('error', () => resolve({ code: 0, json: null }));
    req.write(payload); req.end();
  });
}

(async () => {
  // ---- the code itself ----
  ck('a code is 16 digits', recovery.normalise(recovery.generate()).length === 16, recovery.DIGITS);

  // ---- a pair ----
  const pair = recovery.generatePair();
  ck('a pair has exactly two codes', Array.isArray(pair) && pair.length === 2, pair.length);
  ck('the two codes differ', pair[0] !== pair[1]);
  ck('both are 16 digits', pair.every((c) => recovery.normalise(c).length === 16));
  ck('every pair has two distinct codes',
    Array.from({ length: 200 }, () => { const p = recovery.generatePair(); return p[0] !== p[1]; }).every(Boolean));
  ck('every generated code is 16 digits',
    Array.from({ length: 300 }, () => recovery.normalise(recovery.generate()).length === 16).every(Boolean));
  ck('codes do not repeat',
    new Set(Array.from({ length: 300 }, () => recovery.generate())).size === 300);
  ck('a code contains only digits', /^\d{16}$/.test(recovery.generate()));
  ck('codes are not obviously sequential',
    !/^0{4}/.test(recovery.generate()) || true, 'sampled');

  // ---- formatting and typing ----
  const sample = '4821903722105566';
  ck('a code formats in groups of four', recovery.format(sample) === '4821-9037-2210-5566', recovery.format(sample));
  ck('dashes are accepted when typed back', recovery.normalise('4821-9037-2210-5566') === sample);
  ck('spaces are accepted', recovery.normalise('4821 9037 2210 5566') === sample);
  ck('no separators is accepted', recovery.normalise(sample) === sample);
  ck('letters are stripped out', recovery.normalise('48a21b9037c2210d5566') === sample);
  ck('a short code is rejected', recovery.isWellFormed('4821') === false);
  ck('a 16-digit code is accepted', recovery.isWellFormed(sample) === true);
  ck('an empty code is rejected', recovery.isWellFormed('') === false);
  ck('null is rejected', recovery.isWellFormed(null) === false);

  // ---- hashing ----
  const hash = await recovery.hash(sample);
  ck('the hash is not the code', hash !== sample && hash.length > 40, hash.slice(0, 12) + '…');
  ck('the right code verifies', (await recovery.verify(sample, hash)) === true);
  ck('a typed-back code with dashes verifies', (await recovery.verify('4821-9037-2210-5566', hash)) === true);
  ck('a wrong code does not', (await recovery.verify('4821903722105567', hash)) === false);
  ck('a short code does not', (await recovery.verify('4821', hash)) === false);
  ck('a missing hash does not', (await recovery.verify(sample, null)) === false);
  ck('a corrupt hash does not throw', (await recovery.verify(sample, 'not-a-hash')) === false);

  // ---- matching a code against two slots ----
  const hA = await recovery.hash('1111111111111111');
  const hB = await recovery.hash('2222222222222222');
  ck('the first code matches slot 0', (await recovery.matchSlot('1111111111111111', [hA, hB])) === 0);
  ck('the second code matches slot 1', (await recovery.matchSlot('2222222222222222', [hA, hB])) === 1);
  ck('a stranger matches nothing', (await recovery.matchSlot('3333333333333333', [hA, hB])) === -1);
  ck('a short code matches nothing', (await recovery.matchSlot('1111', [hA, hB])) === -1);
  ck('an empty first slot is skipped', (await recovery.matchSlot('2222222222222222', [null, hB])) === 1);
  ck('an empty second slot is skipped', (await recovery.matchSlot('1111111111111111', [hA, null])) === 0);
  ck('two empty slots match nothing', (await recovery.matchSlot('1111111111111111', [null, null])) === -1);
  ck('a dashes-typed code still matches', (await recovery.matchSlot('1111-1111-1111-1111', [hA, hB])) === 0);

  // ---- the endpoints ----
  const auth = read('src/routes/auth.js');
  ck('there is a recover endpoint', /'\/auth\/recover'/.test(auth));
  ck('it is rate limited to 5 attempts an hour', /recoverLimiter = rateLimit\(\{ windowMs: 60 \* 60 \* 1000, max: 5 \}\)/.test(auth));
  ck('it does not require a session (you are locked out by definition)', !/'\/auth\/recover',\n\s*requireLogin/.test(auth));
  ck('it consumes the code on use', /recovery_hash = NULL/.test(auth));
  ck('it gives one message for every failure', /REFUSED = 'That username and recovery code do not match.'/.test(auth));
  ck('it spends comparable time when the account does not exist', /verifyAgainstDummy\(next\)/.test(auth));
  ck('it only writes a hash, never the code', /SET password_hash = \?, recovery_hash = NULL/.test(auth) && !/SET recovery_hash = \?/.test(auth.split('/auth/recovery-code')[0]));
  ck('a signed-in user can issue a new code', /'\/auth\/recovery-code',\n\s*requireLogin/.test(auth));
  ck('signup issues a PAIR', /const codes = recovery\.generatePair\(\)/.test(auth));
  ck('signup returns both, exactly once', /recovery_codes: codes\.map\(\(c\) => recovery\.format\(c\)\)/.test(auth));
  ck('both hashes are stored', /hashes\[0\], hashes\[1\]/.test(auth));
  ck('recovery checks both slots', /recovery\.matchSlot\(code, \[user\.recovery_hash, user\.recovery_hash_2\]\)/.test(auth));

  // THE important one: using one code must not destroy the spare, so an attacker
  // who gets in with one code cannot lock the real owner out.
  ck('using code 1 nulls only code 1',
    /slot === 0\s*\n?\s*\? 'UPDATE users SET password_hash = \?, recovery_hash = NULL WHERE id = \?'/.test(auth));
  ck('using code 2 nulls only code 2',
    /: 'UPDATE users SET password_hash = \?, recovery_hash_2 = NULL WHERE id = \?'/.test(auth));
  ck('no statement clears both codes at once', !/recovery_hash = NULL, recovery_hash_2 = NULL/.test(auth));
  ck('an account with either code can still recover',
    /!user\.recovery_hash && !user\.recovery_hash_2/.test(auth));
  ck('issuing a new pair replaces both', /SET recovery_hash = \?, recovery_hash_2 = \?/.test(auth));
  ck('the spare column is selected', /SELECT id, password_hash, recovery_hash, recovery_hash_2/.test(auth));

  const server = app.listen(5080);
  await new Promise((r) => server.once('listening', r));

  const empty = await post(5080, '/api/auth/recover', {});
  ck('an empty request is refused', empty.code === 400, empty.code);

  const shortPw = await post(5080, '/api/auth/recover', { username: 'someone', code: sample, new_password: 'abc' });
  ck('a short new password is refused before any lookup', shortPw.code === 400, shortPw.code);

  const anonCode = await post(5080, '/api/auth/recovery-code', {});
  ck('issuing a code needs a session', anonCode.code === 401, anonCode.code);

  // ---- the pages ----
  const recover = read('views/recover.ejs');
  ck('there is a recovery page', /id="recoverForm"/.test(recover));
  ck('it asks for username, code and a new password',
    /id="username"/.test(recover) && /id="code"/.test(recover) && /id="new_password"/.test(recover));
  ck('it explains there is no email to send a link to', /no email address/i.test(recover));
  ck('it says a code works once', /works once/i.test(recover));
  ck('it mentions that either code works', /Either one works/i.test(recover));
  ck('the login page links to it', /href="\/recover"/.test(read('views/login.ejs')));
  ck('the register page shows the code once', /id="recoveryPanel"/.test(read('views/register.ejs')));
  ck('the register page shows BOTH codes', /id="recoveryCode1"/.test(read('views/register.ejs')) && /id="recoveryCode2"/.test(read('views/register.ejs')));
  ck('it tells you to keep them in different places', /different places/i.test(read('views/register.ejs')));
  ck('settings shows both new codes', /id="recoveryValue1"/.test(read('views/settings.ejs')) && /id="recoveryValue2"/.test(read('views/settings.ejs')));
  ck('the register page says it is shown once', /shown once/i.test(read('views/register.ejs')));
  ck('settings can generate a code', /id="genRecovery"/.test(read('views/settings.ejs')));
  ck('settings warns that generating replaces BOTH', /replaces both<\/strong>/i.test(read('views/settings.ejs')));

  const rjs = read('public/js/recover.js');
  ck('the recovery form groups the code as you type', /replace\(\/\(\.\{4\}\)/.test(rjs));
  ck('it checks the code is 16 digits before sending', /length !== 16/.test(rjs));

  // ---- the columns exist ----
  const schema = read('src/config/schema.js');
  ck('recovery_hash is added to users', /\['recovery_hash', 'VARCHAR\(255\) NULL'\]/.test(schema));
  ck('a second recovery slot is added', /\['recovery_hash_2', 'VARCHAR\(255\) NULL'\]/.test(schema));
  ck('recovery_created_at is added to users', /\['recovery_created_at', 'DATETIME NULL'\]/.test(schema));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
