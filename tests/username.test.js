'use strict';
// Usernames are the login key now, and the live availability check shares its
// rules with registration. If those two ever disagree the page says "available"
// and the server then refuses — worse than not checking at all.
process.env.SECRET_KEY = 'u'.repeat(64);
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const http = require('http');
const usernames = require('../src/services/username');
const app = require('../src/app');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  // ---- the format rules ----
  ['vasanth', 'nano', 'a1b2c3', 'ugh_drag', 'user-name', 'nikkilog_fan', 'x9'].forEach((u) => {
    const r = usernames.validate(u);
    if (u === 'x9') ck(`${u} is too short`, r.ok === false && r.reason === 'short', r.reason);
    else ck(`${u} is accepted`, r.ok === true, r.ok ? 'ok' : r.reason);
  });
  ck('one character is refused', usernames.validate('a').ok === false);
  ck('a 21-character name is refused', usernames.validate('a'.repeat(21)).ok === false, 'long');
  ck('exactly 20 is allowed', usernames.validate('a'.repeat(20)).ok === true);
  ck('exactly 3 is allowed', usernames.validate('abc').ok === true);

  // ---- characters ----
  ['has space', 'has.dot', 'has@at', 'has/slash', '-lead', '_lead', 'emoji😀'].forEach((u) => {
    ck(`"${u}" is refused on characters`, usernames.validate(u).ok === false, usernames.validate(u).reason);
  });
  ck('a trailing hyphen is refused', usernames.validate('trailing-').ok === false);
  ck('a trailing underscore is refused', usernames.validate('trailing_').ok === false);
  ck('an inner hyphen is fine', usernames.validate('a-b-c').ok === true);
  ck('an inner underscore is fine', usernames.validate('a_b_c').ok === true);

  // ---- case ----
  ck('"Nano" normalises to lower case', usernames.validate('Nano').username === 'nano', usernames.validate('Nano').username);
  ck('surrounding spaces are trimmed', usernames.normalise('  VaSanth  ') === 'vasanth');
  ck('"NANO" and "nano" are the same name', usernames.validate('NANO').username === usernames.validate('nano').username);

  // ---- reserved ----
  ['admin', 'root', 'api', 'login', 'register', 'profile', 'settings', 'browse', 'anime', 'nikkilog', 'ADMIN'].forEach((u) => {
    ck(`"${u}" is reserved`, usernames.validate(u).ok === false && usernames.validate(u).reason === 'reserved', usernames.validate(u).reason);
  });
  ck('"administrator" is reserved', usernames.validate('administrator').ok === false);
  ck('"myadmin" is NOT reserved (only exact matches)', usernames.validate('myadmin').ok === true);

  // ---- empty ----
  ck('an empty name is refused', usernames.validate('').ok === false);
  ck('null is refused', usernames.validate(null).ok === false);
  ck('undefined is refused', usernames.validate(undefined).ok === false);

  // ---- suggestions ----
  const s = usernames.suggestions('vasanth');
  ck('suggestions are offered', Array.isArray(s) && s.length === 3, s.join(', '));
  ck('suggestions are themselves valid', s.every((x) => usernames.validate(x).ok === true), s.join(', '));
  ck('suggestions differ from the taken name', s.every((x) => x !== 'vasanth'));
  ck('a very long name still yields valid suggestions', usernames.suggestions('a'.repeat(20)).every((x) => usernames.validate(x).ok === true));
  ck('an empty name still yields suggestions', usernames.suggestions('').every((x) => usernames.validate(x).ok === true));

  // ---- the endpoint refuses the impossible WITHOUT touching the database ----
  // (There is no database here, so a 200 proves it never queried.)
  const server = app.listen(5083);
  await new Promise((r) => server.once('listening', r));
  const get = (p) => new Promise((res) => {
    http.get({ host: '127.0.0.1', port: 5083, path: p }, (r) => {
      let b = ''; r.on('data', (d) => (b += d));
      r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ code: r.statusCode, json: j }); });
    }).on('error', () => res({ code: 0, json: null }));
  });

  const short = await get('/api/auth/username-available?username=ab');
  ck('the check endpoint answers', short.code === 200, short.code);
  ck('a too-short name is refused without a query', short.json && short.json.available === false && short.json.reason === 'short', JSON.stringify(short.json));

  const reserved = await get('/api/auth/username-available?username=admin');
  ck('a reserved name is refused without a query', reserved.json && reserved.json.reason === 'reserved', JSON.stringify(reserved.json));

  const bad = await get('/api/auth/username-available?username=has%20space');
  ck('a bad character is refused without a query', bad.json && bad.json.reason === 'charset', JSON.stringify(bad.json));

  const missing = await get('/api/auth/username-available');
  ck('a missing parameter is handled', missing.code === 200 && missing.json.available === false, JSON.stringify(missing.json));

  // ---- the routes actually use usernames ----
  const auth = read('src/routes/auth.js');
  ck('login looks up by username', /WHERE username = \?/.test(auth));
  ck('login no longer looks up by email', !/WHERE email = \?/.test(auth));
  ck('registration inserts a NULL email', /VALUES \(\?, NULL, \?, \?/.test(auth));
  ck('registration validates through the shared rules', /usernames\.validate\(body\.username\)/.test(auth));
  ck('the live check is rate limited', /usernameCheckLimiter/.test(auth));
  ck('the live check is cached', /cacheStore\.set\(key, payload/.test(auth));
  ck('registering clears the cached answer', /cacheStore\.del\('uname:'/.test(auth));

  // ---- the index, which is what makes it fast ----
  const schema = read('src/config/schema.js');
  ck('a unique index is added on username', /ADD UNIQUE KEY uniq_username \(username\)/.test(schema));
  ck('the index is only added when there are no duplicates', /HAVING c > 1/.test(schema));
  ck('duplicates are reported rather than silently merged', /duplicated username/.test(schema));
  ck('accounts with no username are given one', /SET username = \? WHERE id = \?/.test(schema));
  ck('email is made nullable so the insert cannot fail', /MODIFY email VARCHAR\(255\) NULL/.test(schema));

  // ---- the client ----
  const client = read('public/js/username-check.js');
  ck('the client waits before asking', /PAUSE_MS = 300/.test(client));
  ck('the client cancels a stale request', /AbortController/.test(client) && /\.abort\(\)/.test(client));
  ck('the client ignores a reply for an old value', /input\.value\.trim\(\)\.toLowerCase\(\) !== value/.test(client));
  ck('the client does not block signup if the check fails', /settled = 'idle'/.test(client));
  ck('the register page loads the checker', /username-check\.js/.test(read('views/register.ejs')));
  ck('the login form asks for a username', /name="username"/.test(read('views/login.ejs')));
  ck('the register form asks for a username', /name="username"/.test(read('views/register.ejs')));
  ck('neither form asks for an email any more', !/type="email"/.test(read('views/login.ejs')) && !/type="email"/.test(read('views/register.ejs')));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
