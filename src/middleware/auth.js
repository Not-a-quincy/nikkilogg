'use strict';

const { query } = require('../config/db');
const { userForToken } = require('../services/tokens');

/**
 * Load the logged-in user (if any) from the session, mirroring Flask-Login's
 * `current_user`. Attaches `req.user` and exposes `currentUser` / `isLoggedIn`
 * to every rendered view.
 */
async function attachUser(req, res, next) {
  req.user = null;
  if (req.session && req.session.userId) {
    try {
      const rows = await query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
      if (rows.length) {
        const u = rows[0];
        u.is_admin = !!u.is_admin;
        u.is_early_user = u.id != null && u.id <= 1000;
        req.user = u;
      } else {
        req.session.userId = null;
      }
    } catch (err) {
      // Treat a failed lookup as anonymous rather than crashing the request.
      console.error('attachUser: failed to load user', err.message);
    }
  }
  res.locals.currentUser = req.user;
  res.locals.isLoggedIn = !!req.user;
  next();
}

function wantsJson(req) {
  // NB: inside a router req.path is relative to the mount point, so use the
  // original URL — otherwise /api/* mounted routers are treated as browser requests.
  const url = req.originalUrl || req.url || '';
  if (url.startsWith('/api/')) return true;
  if (req.xhr) return true;
  const accept = req.headers.accept || '';
  return accept.includes('application/json');
}

/**
 * Equivalent of Flask-Login's @login_required.
 * JSON clients get a 401; browsers are redirected to /login.
 */
function requireLogin(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return res.redirect('/login');
}

/** Admin-only gate. */
function requireAdmin(req, res, next) {
  if (req.user && req.user.is_admin) return next();
  if (wantsJson(req)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  return res.status(403).send('Unauthorized');
}

/**
 * Accepts either a logged-in session or a personal API token
 * (`Authorization: Bearer nkl_...`). Used by the browser extension.
 */
async function requireAuth(req, res, next) {
  if (req.user) return next();

  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) {
    try {
      const user = await userForToken(match[1].trim());
      if (user) {
        req.user = user;
        req.authMethod = 'token';
        return next();
      }
    } catch (err) {
      return next(err);
    }
    return res.status(401).json({ error: 'Invalid or revoked API token.' });
  }

  return requireLogin(req, res, next);
}

module.exports = { attachUser, requireLogin, requireAdmin, requireAuth, wantsJson };
