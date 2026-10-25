'use strict';

const https = require('https');

/**
 * A small client for the anime metadata API.
 *
 * It speaks the **Jikan v4 schema** but points at **Tenrai**
 * (`https://api.tenrai.org/v1`) by default. That matters: Jikan's public API was
 * discontinued on 1 October 2026 — `api.jikan.moe` no longer answers — and
 * Tenrai is its drop-in successor, matching the same paths, the same
 * `{ pagination, data }` envelope and the same `mal_id` field names.
 *
 * The base URL is configurable (`ANIME_API_BASE_URL`) so you can point at a
 * self-hosted instance or anything else that speaks the same schema without
 * touching code.
 *
 * Uses node:https rather than global fetch on purpose: it works on every Node
 * version this project supports, and avoids the undici/WebAssembly crash that
 * global fetch hits in some sandboxes.
 */

const DEFAULT_BASE = 'https://api.tenrai.org/v1';

// Tenrai allows 4 requests/second and 120/minute. Stay under both.
const MIN_INTERVAL_MS = 400;

let lastCallAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseUrl() {
  const configured = String(process.env.ANIME_API_BASE_URL || '').trim();
  const base = (configured || DEFAULT_BASE).replace(/\/+$/, '');
  return base;
}

/** Builds a full URL, skipping empty params. Pure, so it can be tested. */
function buildUrl(base, path, params) {
  const root = String(base || DEFAULT_BASE).replace(/\/+$/, '');
  const clean = String(path || '').replace(/^\/+/, '');
  const query = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  return root + '/' + clean + (query ? '?' + query : '');
}

/** 429 responses carry Retry-After in seconds. Pure, so it can be tested. */
function parseRetryAfter(value) {
  if (value === undefined || value === null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
  const when = Date.parse(value);
  if (Number.isFinite(when)) return Math.min(Math.max(when - Date.now(), 0), 30000);
  return null;
}

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
              reject(new Error('The API returned something that is not JSON.'));
            }
          } else {
            const err = new Error('The API responded ' + res.statusCode);
            err.statusCode = res.statusCode;
            err.retryAfterMs = parseRetryAfter(res.headers && res.headers['retry-after']);
            err.url = url;
            reject(err);
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('The API did not respond in time.')));
    req.on('error', reject);
  });
}

async function getJson(pathOrUrl, params, options) {
  const opts = options || {};
  const attempts = opts.attempts || 4;
  const timeoutMs = opts.timeoutMs || 20000;
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : buildUrl(baseUrl(), pathOrUrl, params);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const since = Date.now() - lastCallAt;
    if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);
    lastCallAt = Date.now();

    try {
      return await request(url, timeoutMs);
    } catch (err) {
      lastError = err;
      err.url = err.url || url;
      // A DNS failure or a refused connection will not fix itself by waiting.
      const fatal = /EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET/.test(String(err.code || '') + ' ' + String(err.message || ''));
      const throttled = err.statusCode === 429;
      const serverError = err.statusCode >= 500 && err.statusCode < 600;
      if (fatal || (!throttled && !serverError) || attempt === attempts) break;
      // honour Retry-After when the server sends one, else back off 1s, 2s, 4s
      const wait = err.retryAfterMs != null ? err.retryAfterMs : 1000 * Math.pow(2, attempt - 1);
      await sleep(wait);
    }
  }
  throw lastError;
}

/** One page of a list endpoint, following pagination. */
async function paged(path, params, onPage, maxPages) {
  const out = [];
  let page = 1;
  for (;;) {
    const data = await getJson(path, { ...(params || {}), page, limit: 25 });
    const items = Array.isArray(data.data) ? data.data : [];
    out.push(...items);
    if (onPage) onPage(page, items.length, out.length);
    const more = data.pagination && (data.pagination.has_next_page || data.pagination.hasNextPage);
    if (!more || !items.length) break;
    page += 1;
    if (page > (maxPages || 40)) break;
  }
  return out;
}

/** Production staff for one title. */
async function animeStaff(malId) {
  const data = await getJson('/anime/' + encodeURIComponent(malId) + '/staff', undefined, { attempts: 3 });
  return data && Array.isArray(data.data) ? data.data : [];
}

/** One title by its MAL id. Throws with statusCode 404 when it does not exist. */
async function animeById(malId) {
  const data = await getJson('/anime/' + encodeURIComponent(malId), undefined, { attempts: 3 });
  return data && data.data ? data.data : null;
}

const seasonNow = (onPage) => paged('/seasons/now', { sfw: 'true' }, onPage);
const seasonUpcoming = (onPage) => paged('/seasons/upcoming', { sfw: 'true' }, onPage);
const season = (year, name, onPage) => paged(`/seasons/${year}/${name}`, { sfw: 'true' }, onPage);

/** Is the configured source reachable, and what did it say? For `--check`. */
async function diagnose() {
  const steps = [];
  const base = baseUrl();
  steps.push({ step: 'source', ok: true, detail: base });

  const dns = require('dns').promises;
  let host;
  try {
    host = new URL(base).hostname;
  } catch (e) {
    steps.push({ step: 'base url', ok: false, detail: 'ANIME_API_BASE_URL is not a valid URL: ' + base });
    return steps;
  }

  try {
    const addr = await dns.lookup(host);
    steps.push({ step: 'DNS', ok: true, detail: host + ' -> ' + addr.address });
  } catch (e) {
    steps.push({ step: 'DNS', ok: false, detail: host + ' could not be resolved (' + (e.code || e.message) + ')' });
    return steps;
  }

  try {
    const data = await getJson('/seasons/now', { limit: 1, sfw: 'true' }, { attempts: 1, timeoutMs: 15000 });
    const n = Array.isArray(data.data) ? data.data.length : 0;
    steps.push({ step: 'HTTPS', ok: true, detail: 'reached the API, ' + n + ' title(s) in the test response' });
  } catch (e) {
    steps.push({ step: 'HTTPS', ok: false, detail: (e.statusCode ? 'HTTP ' + e.statusCode + ' — ' : '') + (e.message || e.code || 'failed') });
  }
  return steps;
}

module.exports = {
  getJson,
  animeById,
  animeStaff,
  paged,
  season,
  seasonNow,
  seasonUpcoming,
  diagnose,
  buildUrl,
  parseRetryAfter,
  baseUrl,
  DEFAULT_BASE,
  MIN_INTERVAL_MS,
};
