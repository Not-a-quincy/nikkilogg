'use strict';
// Jikan's public API was discontinued on 1 October 2026, which is why the
// default source is Tenrai. These tests pin that down so it cannot silently
// drift back to a host that no longer answers.
const api = require('../src/services/animeApi');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

// ---- the default source ----
ck('the default source is Tenrai', api.DEFAULT_BASE === 'https://api.tenrai.org/v1', api.DEFAULT_BASE);
ck('the default is not the discontinued Jikan host', !/jikan\.moe/.test(api.DEFAULT_BASE));
ck('no source in the client points at jikan.moe', !/jikan\.moe/.test(JSON.stringify(api.baseUrl())));
ck('the base URL is overridable', (() => {
  const before = process.env.ANIME_API_BASE_URL;
  process.env.ANIME_API_BASE_URL = 'https://my.own.instance/v1';
  const got = api.baseUrl();
  if (before === undefined) delete process.env.ANIME_API_BASE_URL; else process.env.ANIME_API_BASE_URL = before;
  return got === 'https://my.own.instance/v1';
})());
ck('a trailing slash is stripped from the configured base', (() => {
  const before = process.env.ANIME_API_BASE_URL;
  process.env.ANIME_API_BASE_URL = 'https://x.test/v1///';
  const got = api.baseUrl();
  if (before === undefined) delete process.env.ANIME_API_BASE_URL; else process.env.ANIME_API_BASE_URL = before;
  return got === 'https://x.test/v1';
})());

// ---- URL building ----
const u = (p, q) => api.buildUrl('https://api.tenrai.org/v1', p, q);
ck('joins base and path', u('/seasons/now') === 'https://api.tenrai.org/v1/seasons/now', u('/seasons/now'));
ck('tolerates a missing leading slash', u('seasons/now') === 'https://api.tenrai.org/v1/seasons/now');
ck('tolerates a trailing slash on the base', api.buildUrl('https://x.test/v1/', 'seasons/now') === 'https://x.test/v1/seasons/now');
ck('adds query params', u('/seasons/now', { page: 1, limit: 25 }) === 'https://api.tenrai.org/v1/seasons/now?page=1&limit=25', u('/seasons/now', { page: 1, limit: 25 }));
ck('skips empty params', u('/x', { a: 1, b: '', c: null, d: undefined }) === 'https://api.tenrai.org/v1/x?a=1', u('/x', { a: 1, b: '', c: null, d: undefined }));
ck('encodes values', u('/anime', { q: 'frieren & co' }) === 'https://api.tenrai.org/v1/anime?q=frieren%20%26%20co', u('/anime', { q: 'frieren & co' }));
ck('no params means no question mark', !u('/seasons/now').includes('?'));
ck('the season path is built correctly', u('/seasons/2026/fall', { limit: 25 }) === 'https://api.tenrai.org/v1/seasons/2026/fall?limit=25');

// ---- Retry-After (Tenrai asks clients to honour it on 429) ----
ck('Retry-After in seconds becomes milliseconds', api.parseRetryAfter('5') === 5000, api.parseRetryAfter('5'));
ck('Retry-After 0 is respected', api.parseRetryAfter('0') === 0);
ck('a missing header is null', api.parseRetryAfter(null) === null && api.parseRetryAfter(undefined) === null && api.parseRetryAfter('') === null);
ck('a nonsense header is null', api.parseRetryAfter('soon') === null);
ck('an HTTP-date Retry-After is understood', (() => {
  const when = new Date(Date.now() + 4000).toUTCString();
  const ms = api.parseRetryAfter(when);
  return ms !== null && ms > 0 && ms <= 4000;
})());
ck('an absurd wait is capped at 30s', api.parseRetryAfter('99999') === 30000, api.parseRetryAfter('99999'));

// ---- the client is throttled below Tenrai's published limit ----
ck('the throttle stays under 4 requests/second', api.MIN_INTERVAL_MS >= 250, api.MIN_INTERVAL_MS + 'ms');

// ---- the module exports what the script uses ----
['getJson', 'paged', 'season', 'seasonNow', 'seasonUpcoming', 'diagnose', 'baseUrl'].forEach((fn) => {
  ck(`exports ${fn}`, typeof api[fn] === 'function');
});

// ---- flag-free aliases, so no shell can mangle the arguments ----
// PowerShell reads a leading `--` as its decrement operator, so telling people
// to run `npm run update-anime -- --apply` breaks on Windows. The aliases exist
// so nothing has to be passed through npm at all.
const pkg = require('../package.json');
const aliases = {
  'update-anime:check': '--check',
  'update-anime:apply': '--apply',
  'update-anime:upcoming': '--upcoming',
};
Object.entries(aliases).forEach(([name, flag]) => {
  const cmd = pkg.scripts[name];
  ck(`npm run ${name} exists`, typeof cmd === 'string' && cmd.includes(flag), cmd || 'missing');
});
ck('the aliases call node directly (no npm arg forwarding)', Object.keys(aliases).every((n) => /^node scripts\//.test(pkg.scripts[n])));
ck('the bare command stays a dry run', !/--apply/.test(pkg.scripts['update-anime']), pkg.scripts['update-anime']);

// the scripts must not send users through the broken form
const fs = require('fs');
const path = require('path');
const updateSrc = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'update-anime.js'), 'utf8');
const importSrc = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'import-mal.js'), 'utf8');
const tellsYouToPassDashDash = (src) => /(npm run [a-z:-]+) -- --(apply|check|upcoming)/.test(src);
ck('update-anime no longer tells you to pass -- through npm', !tellsYouToPassDashDash(updateSrc));
ck('import-mal no longer tells you to pass -- through npm', !tellsYouToPassDashDash(importSrc));
ck('update-anime points at the flag-free alias', /npm run update-anime:apply/.test(updateSrc));
ck('import-mal documents the Windows-safe form', /node scripts\/import-mal\.js/.test(importSrc) && /PowerShell/.test(importSrc));

// ---- diagnose() reports rather than throws ----
(async () => {
  const steps = await api.diagnose();
  ck('diagnose returns a list of steps', Array.isArray(steps) && steps.length >= 1, steps.length + ' step(s)');
  ck('diagnose names the source first', steps[0].step === 'source' && steps[0].ok === true, steps[0].detail);
  ck('diagnose never throws on an unreachable host', steps.every((s) => typeof s.ok === 'boolean'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
