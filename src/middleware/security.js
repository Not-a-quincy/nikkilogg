'use strict';

/**
 * Small, dependency-free security helpers.
 */

/** Sensible security response headers. */
function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-XSS-Protection', '0');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Only meaningful over HTTPS: tell browsers to stay on HTTPS from now on.
  if (req.secure) {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/**
 * Lightweight CSRF defence for state-changing requests: if the browser sends an
 * Origin (or Referer), it must match this host. Combined with the SameSite=Lax
 * session cookie this blocks cross-site form posts without needing tokens.
 */
function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const source = req.get('origin') || req.get('referer');
  if (!source) return next(); // non-browser client; still needs a valid session cookie
  try {
    if (new URL(source).host === req.get('host')) return next();
  } catch (e) { /* fall through to reject */ }
  return res.status(403).json({ error: 'Cross-site request blocked.' });
}

/**
 * Simple in-memory rate limiter (per IP). Good enough for a single process;
 * use a shared store (Redis) if you run several instances.
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, keyFn } = {}) {
  const hits = new Map();
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs);
  if (sweeper.unref) sweeper.unref();

  return function (req, res, next) {
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    res.set('X-RateLimit-Limit', String(max));
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    return next();
  };
}

module.exports = { securityHeaders, sameOrigin, rateLimit };
