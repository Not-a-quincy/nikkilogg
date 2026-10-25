'use strict';
process.env.SECRET_KEY = 'test-secret';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'x';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'x';

const http = require('http');
const { hashPassword, verifyPassword, passwordProblem } = require('../src/services/password');
const app = require('../src/app');

function req(method, path, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: '127.0.0.1', port: 5066, path, method,
        headers: Object.assign({ Accept: 'text/html' }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  cond ? pass++ : fail++;
}

async function main() {
  // ---- password hashing ----
  const h = await hashPassword('correct horse battery staple');
  check('hash has scrypt format', /^scrypt\$32768\$8\$1\$[0-9a-f]+\$[0-9a-f]+$/.test(h), h.slice(0, 24) + '…');
  check('correct password verifies', await verifyPassword('correct horse battery staple', h));
  check('wrong password rejected', !(await verifyPassword('wrong password', h)));
  const h2 = await hashPassword('correct horse battery staple');
  check('two hashes of same password differ (salted)', h !== h2);
  check('garbage stored hash rejected', !(await verifyPassword('x', 'not-a-hash')));
  check('null stored hash rejected', !(await verifyPassword('x', null)));
  check('short password rejected by policy', passwordProblem('abc') !== null);
  check('good password accepted by policy', passwordProblem('longenough1') === null);

  // ---- server ----
  const server = app.listen(5066);
  await new Promise((r) => server.once('listening', r));

  const login = await req('GET', '/login');
  check('GET /login -> 200', login.status === 200, String(login.status));
  check('login page has password field', login.body.includes('type="password"'));
  check('login page has NO google sign-in', !/continue with google|oauth2_authorize|callback\/google/i.test(login.body));
  check('login page loads tokens.css + auth.css', login.body.includes('/css/tokens.css') && login.body.includes('/css/auth.css'));

  const reg = await req('GET', '/register');
  check('GET /register -> 200', reg.status === 200, String(reg.status));
  check('register page has confirm field', reg.body.includes('id="confirm"'));

  const home = await req('GET', '/');
  check('GET / -> 200', home.status === 200, String(home.status));
  check('home still renders new hero', home.body.includes('omnisearch') && home.body.includes('Currently Watching'));

  const headers = await req('GET', '/login');
  check('X-Content-Type-Options set', headers.headers['x-content-type-options'] === 'nosniff');
  check('X-Frame-Options set', headers.headers['x-frame-options'] === 'SAMEORIGIN');
  check('Referrer-Policy set', !!headers.headers['referrer-policy']);

  // ---- auth endpoint validation (runs before any DB access) ----
  const noFields = await req('POST', '/api/auth/login', { body: {} });
  check('login with no fields -> 400', noFields.status === 400, String(noFields.status));

  const badEmail = await req('POST', '/api/auth/register', { body: { email: 'nope', password: 'longenough1' } });
  check('register with bad email -> 400', badEmail.status === 400, String(badEmail.status));

  const shortPw = await req('POST', '/api/auth/register', { body: { email: 'a@b.com', password: 'short' } });
  check('register with short password -> 400', shortPw.status === 400, String(shortPw.status));

  // ---- CSRF: foreign origin blocked ----
  const csrf = await req('POST', '/api/auth/login', { body: { email: 'a@b.com', password: 'longenough1' }, headers: { Origin: 'http://evil.example' } });
  check('cross-origin POST blocked -> 403', csrf.status === 403, String(csrf.status));

  // ---- rate limiting (11th login attempt in the window is blocked) ----
  let last = 0;
  for (let i = 0; i < 11; i++) {
    const r = await req('POST', '/api/auth/login', { body: { email: 'a@b.com', password: 'longenough1' } });
    last = r.status;
  }
  check('rate limiter returns 429 after 10 tries', last === 429, 'last=' + last);

  console.log(`\n${pass} passed, ${fail} failed`);
  server.close(() => process.exit(fail ? 1 : 0));
}
main().catch((e) => { console.error(e); process.exit(1); });
