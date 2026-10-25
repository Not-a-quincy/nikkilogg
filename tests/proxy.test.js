'use strict';
// A production-only trap: Express reads a *string* trust-proxy value as a list
// of IPs, so "1" trusted nothing and HSTS silently never fired. This boots the
// app in production mode to prove it now does.
process.env.NODE_ENV = 'production';
process.env.BASE_URL = 'https://nikkilog.site';
process.env.SECRET_KEY = 'f'.repeat(64);
process.env.COOKIE_SECURE = 'true';
process.env.TRUST_PROXY = '1';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'vasanth';
process.env.DB_NAME = 'anime_tracker_db';
process.env.DB_PASSWORD = 'placeholder';

const http = require('http');
const { parseTrustProxy } = require('../src/config/env');
const app = require('../src/app');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

(async () => {
  // ---- the value is typed correctly ----
  ck('a hop count becomes a NUMBER, not a string', parseTrustProxy('1') === 1 && typeof parseTrustProxy('1') === 'number', typeof parseTrustProxy('1'));
  ck('a two-hop count works too', parseTrustProxy('2') === 2);
  ck('"true" becomes a boolean', parseTrustProxy('true') === true);
  ck('a named range stays a string', parseTrustProxy('loopback') === 'loopback');
  ck('an IP list stays a string', parseTrustProxy('10.0.0.1,10.0.0.2') === '10.0.0.1,10.0.0.2');
  ck('blank means "do not trust a proxy"', parseTrustProxy('') === null && parseTrustProxy(undefined) === null && parseTrustProxy(null) === null);
  ck('whitespace is trimmed', parseTrustProxy('  1  ') === 1);

  // ---- and it reaches Express as a number ----
  ck('the app is in production mode', process.env.NODE_ENV === 'production');
  ck('Express received a numeric hop count', app.get('trust proxy') === 1 && typeof app.get('trust proxy') === 'number', typeof app.get('trust proxy'));

  // ---- HSTS fires behind an HTTPS proxy, and only there ----
  const server = app.listen(5086);
  await new Promise((r) => server.once('listening', r));
  const headers = (extra) => new Promise((res) => {
    http.get({ host: '127.0.0.1', port: 5086, path: '/', headers: extra }, (r) => res(r.headers)).on('error', () => res({}));
  });

  const plain = await headers({});
  const proxied = await headers({ 'X-Forwarded-Proto': 'https' });
  ck('HSTS is NOT sent over plain http (browsers ignore it there)', !plain['strict-transport-security'], plain['strict-transport-security'] || 'absent');
  ck('HSTS IS sent behind an https proxy', !!proxied['strict-transport-security'], proxied['strict-transport-security'] || 'absent');
  ck('the HSTS policy is long-lived and covers subdomains', /max-age=\d{7,}/.test(proxied['strict-transport-security'] || '') && /includeSubDomains/.test(proxied['strict-transport-security'] || ''), proxied['strict-transport-security']);
  ck('the site loads in production mode', (await new Promise((res) => http.get({ host: '127.0.0.1', port: 5086, path: '/' }, (r) => { r.resume(); res(r.statusCode); }).on('error', () => res(0)))) === 200);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
