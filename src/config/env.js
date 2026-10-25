'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables. Prefer `.env`; fall back to the original
// Flask file name `login.env` so an existing setup keeps working.
const rootDir = path.join(__dirname, '..', '..');
const envFile = fs.existsSync(path.join(rootDir, '.env'))
  ? path.join(rootDir, '.env')
  : path.join(rootDir, 'login.env');
dotenv.config({ path: envFile });

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  rootDir,
  publicDir: path.join(rootDir, 'public'),
  viewsDir: path.join(rootDir, 'views'),
  port: parseInt(process.env.PORT || '5000', 10),
  baseUrl: (process.env.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, ''),
  secretKey: process.env.SECRET_KEY,
  // Shown on /about and /privacy. Twitter only — no email address is published
  // anywhere. Defaults to the site owner's handle; override in .env if it moves.
  contactTwitter: process.env.CONTACT_TWITTER || 'ughdrag',
  isProduction,

  // Behind a reverse proxy (nginx, a PaaS router) Express must trust the
  // X-Forwarded-* headers, otherwise rate limiting sees every visitor as the
  // proxy and "secure" cookies never get set.
  trustProxy: process.env.TRUST_PROXY || (isProduction ? '1' : ''),

  // Cookies are marked Secure (HTTPS-only) in production by default.
  cookieSecure:
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : isProduction,

  // Where profile pictures and banners are written.
  uploadsDir: process.env.UPLOADS_DIR || path.join(rootDir, 'public', 'uploads'),

  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306', 10),
  },
};

if (!config.secretKey) {
  // Mirror the Flask app: refuse to start without a session secret.
  throw new Error(
    'No SECRET_KEY found.\n' +
    '  It signs your session cookies, so the app will not start without one.\n' +
    '\n' +
    '  Fix it with:\n' +
    '      npm run gen-secret\n' +
    '\n' +
    '  That writes a fresh one into .env for you. (Or set SECRET_KEY yourself\n' +
    '  to a long random string — at least 32 characters in production.)'
  );
}

if (isProduction) {
  const problems = [];
  if (config.secretKey.length < 32) {
    problems.push('SECRET_KEY must be at least 32 characters in production (generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")');
  }
  if (!/^https:\/\//.test(config.baseUrl)) {
    problems.push('BASE_URL must start with https:// in production (e.g. https://yourdomain.com)');
  }
  if (!config.cookieSecure) {
    problems.push('COOKIE_SECURE is false — session cookies would travel over plain HTTP');
  }
  if (!config.db.host || !config.db.user || !config.db.database) {
    problems.push('DB_HOST, DB_USER and DB_NAME must all be set in production');
  }
  if (problems.length) {
    throw new Error('Refusing to start with an insecure production setup:\n  - ' + problems.join('\n  - '));
  }
}

/**
 * Express reads a *string* `trust proxy` value as a comma-separated list of IP
 * addresses or subnets — so the string "1" matches no address and the proxy is
 * silently never trusted, which disables HSTS and makes rate limiting treat
 * every visitor as the proxy. A bare number is a hop count and must stay a number.
 */
function parseTrustProxy(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10); // hop count
  if (value === 'true') return true;                    // trust everything
  return value;                                          // "loopback", or an IP list
}

// Exported alongside the config so the parsing is testable on its own.
config.parseTrustProxy = parseTrustProxy;

module.exports = config;
