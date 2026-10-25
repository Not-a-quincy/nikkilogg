'use strict';
// Changing a password needs the current one, not just a session. And with no
// email on the account there is no reset — so the only safe reset policy is not
// to do one. Both are asserted here.
process.env.SECRET_KEY = 'p'.repeat(64);
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('../src/app');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function post(port, p, body, headers) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, headers || {}) },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ code: res.statusCode, json: j }); }); });
    req.on('error', () => resolve({ code: 0, json: null }));
    req.write(payload); req.end();
  });
}

(async () => {
  const auth = read('src/routes/auth.js');

  // ---- the endpoint exists and is guarded ----
  ck('there is a change-password endpoint', /'\/auth\/change-password'/.test(auth));
  ck('it requires a signed-in session', /'\/auth\/change-password',\n\s*requireLogin/.test(auth));
  ck('it is rate limited (it checks a password, so it is a guessing target)', /changePasswordLimiter/.test(auth));
  ck('the limiter is tighter than a normal page', /changePasswordLimiter = rateLimit\(\{ windowMs: 15 \* 60 \* 1000, max: 10 \}\)/.test(auth));

  // ---- it demands the current password ----
  ck('it verifies the current password', /verifyPassword\(current, user\.password_hash\)/.test(auth));
  ck('a wrong current password is refused', /That is not your current password/.test(auth));
  ck('a session alone is explicitly not enough', /knowing the session is not enough|knowing the session alone is not enough/i.test(auth + read('views/settings.ejs')));
  ck('it refuses the new password being the same as the old', /already your password/.test(auth));
  ck('it applies the shared password rules to the new one', /passwordProblem\(next\)/.test(auth));
  ck('it only ever writes the hash', /UPDATE users SET password_hash = \? WHERE id = \?/.test(auth));
  ck('it never writes a plain-text password', !/SET password = /.test(auth));
  ck('the session is regenerated after a change', /startSession\(req, user\.id/.test(auth));

  // ---- the gate, over HTTP ----
  const server = app.listen(5081);
  await new Promise((r) => server.once('listening', r));

  const anon = await post(5081, '/api/auth/change-password', { current_password: 'a', new_password: 'bbbbbbbb' });
  ck('without a session it is refused', anon.code === 401, anon.code);
  ck('and it says nothing about whether the account exists', !/exists/.test(JSON.stringify(anon.json)));

  const empty = await post(5081, '/api/auth/change-password', {});
  ck('an empty request is refused', empty.code === 401, empty.code);

  // ---- the UI ----
  const settings = read('views/settings.ejs');
  ck('the settings page has the form', /id="changePasswordForm"/.test(settings));
  ck('it asks for the current password', /id="current_password"/.test(settings));
  ck('it asks for the new password twice', /id="new_password"/.test(settings) && /id="confirm_new"/.test(settings));
  ck('it warns that there is no password reset', /there is no password reset/i.test(settings));
  ck('it says the session alone is not enough', /knowing the session is not enough/i.test(settings));

  const js = read('public/js/settings.js');
  ck('the form checks the two new passwords match', /next !== confirm/.test(js));
  ck('the form checks the new password length', /next\.length < 8/.test(js));
  ck('the form refuses reusing the current password', /next === current/.test(js));
  ck('the form posts to the endpoint', /\/api\/auth\/change-password/.test(js));
  ck('the button is disabled while it works', /btn\.disabled = true/.test(js));

  // ---- the reset policy, stated rather than implied ----
  ck('the README states there is no reset', /no password reset|there is no password reset/i.test(read('README.md')));
  const docs = read('DEPLOY.md') + read('README.md');
  ck('the docs say not to reset on request', /do not do one on request|never reset a password because someone asked/i.test(docs));
  ck('the docs explain WHY: nothing verifies who is asking', /nothing verifies who is asking|no way to verify/i.test(docs));
  ck('the docs say a signed-in user changes it themselves', /change it themselves|change their own password/i.test(docs));
  ck('the CLI is described as for your own account, not support', /not a support tool/i.test(docs));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
