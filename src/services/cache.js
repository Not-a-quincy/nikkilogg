'use strict';

const NodeCache = require('node-cache');

// In-memory cache — replaces flask_caching's `simple` backend.
// For production, swap this for Redis (mirrors the original comment in app.py).
const store = new NodeCache({ stdTTL: 0, checkperiod: 120 });

/**
 * Express middleware that caches JSON responses for `ttlSeconds`.
 * Mirrors `@cache.cached(timeout=..., query_string=True)`.
 */
function cacheJson(ttlSeconds) {
  return function (req, res, next) {
    const key = `json:${req.method}:${req.originalUrl}`;
    const hit = store.get(key);
    if (hit !== undefined) {
      return res.type('application/json').send(hit);
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, body, ttlSeconds);
      }
      return originalJson(body);
    };
    next();
  };
}

/**
 * Caches a raw string response (used for the ANN RSS proxy).
 */
async function cachedText(key, ttlSeconds, producer) {
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  const value = await producer();
  store.set(key, value, ttlSeconds);
  return value;
}

/**
 * Drop everything in the cache. Called after an admin write so the public
 * endpoints pick up the change immediately.
 */
function invalidate() {
  store.flushAll();
}

module.exports = { cacheJson, cachedText, invalidate, store };
