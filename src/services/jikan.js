'use strict';

const https = require('https');

/**
 * A very small Jikan client.
 *
 * Uses node:https rather than global fetch on purpose: it works on every Node
 * version this project supports, and it avoids the undici/WebAssembly crash that
 * global fetch hits in some sandboxes.
 *
 * Jikan asks for gentle use — roughly 3 requests a second, 60 a minute — so every
 * call is throttled and retried on 429/5xx with a growing delay.
 */

const MIN_INTERVAL_MS = 400; // ~2.5 requests/second
let lastCallAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function request(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'nikkilog-anime-updater/1.0', Accept: 'application/json' } },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(new Error('Jikan returned something that is not JSON.'));
            }
          } else {
            const err = new Error('Jikan responded ' + res.statusCode);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Jikan did not respond in time.')));
    req.on('error', reject);
  });
}

async function getJson(url, options) {
  const opts = options || {};
  const attempts = opts.attempts || 4;
  const timeoutMs = opts.timeoutMs || 20000;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const since = Date.now() - lastCallAt;
    if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);
    lastCallAt = Date.now();

    try {
      return await request(url, timeoutMs);
    } catch (err) {
      lastError = err;
      // A DNS failure or a refused connection will not fix itself by waiting.
      const fatal = /EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET/.test(String(err.code || '') + String(err.message || ''));
      const retryable = !fatal && (err.statusCode === 429 || (err.statusCode >= 500 && err.statusCode < 600));
      if (!retryable || attempt === attempts) break;
      // back off: 1s, 2s, 4s
      await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }
  throw lastError;
}

const BASE = 'https://api.jikan.moe/v4';

/** Every anime in one Jikan season, following pagination. */
async function season(year, name, onPage) {
  const out = [];
  let page = 1;
  for (;;) {
    const url = `${BASE}/seasons/${year}/${name}?page=${page}&limit=25&sfw=true`;
    const data = await getJson(url);
    const items = Array.isArray(data.data) ? data.data : [];
    out.push(...items);
    if (onPage) onPage(page, items.length, out.length);
    const more = data.pagination && data.pagination.has_next_page;
    if (!more || !items.length) break;
    page += 1;
    if (page > 40) break; // a season never runs past ~1000 titles
  }
  return out;
}

async function seasonNow(onPage) {
  const out = [];
  let page = 1;
  for (;;) {
    const data = await getJson(`${BASE}/seasons/now?page=${page}&limit=25&sfw=true`);
    const items = Array.isArray(data.data) ? data.data : [];
    out.push(...items);
    if (onPage) onPage(page, items.length, out.length);
    if (!(data.pagination && data.pagination.has_next_page) || !items.length) break;
    page += 1;
    if (page > 40) break;
  }
  return out;
}

async function seasonUpcoming(onPage) {
  const out = [];
  let page = 1;
  for (;;) {
    const data = await getJson(`${BASE}/seasons/upcoming?page=${page}&limit=25&sfw=true`);
    const items = Array.isArray(data.data) ? data.data : [];
    out.push(...items);
    if (onPage) onPage(page, items.length, out.length);
    if (!(data.pagination && data.pagination.has_next_page) || !items.length) break;
    page += 1;
    if (page > 40) break;
  }
  return out;
}

module.exports = { getJson, season, seasonNow, seasonUpcoming, BASE, MIN_INTERVAL_MS };
