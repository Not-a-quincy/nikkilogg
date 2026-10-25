'use strict';

const express = require('express');
const { query, execute } = require('../config/db');
const { asyncHandler } = require('../services/util');
const { hashPassword, verifyPassword, verifyAgainstDummy, passwordProblem } = require('../services/password');
const { rateLimit } = require('../middleware/security');
const { requireLogin } = require('../middleware/auth');
const usernames = require('../services/username');
const recovery = require('../services/recovery');
const { store: cacheStore } = require('../services/cache');

const router = express.Router();

// Slow down brute-force attempts. Per IP.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });
// The live check fires while someone types, so it needs far more headroom than a
// login attempt — but it is still a public endpoint, so it is still bounded.
const usernameCheckLimiter = rateLimit({ windowMs: 60 * 1000, max: 90 });
// Changing a password checks the current one, so this is a password-guessing
// target even though it needs a session.
const changePasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
// The recovery code is the one secret that can take over an account, so guessing
// it is rate limited hard. This is what makes a 16-digit code safe rather than
// merely long: a handful of tries an hour turns brute force into centuries.
const recoverLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });


/**
 * Establish a logged-in session. Regenerating the session id on login prevents
 * session fixation (an attacker cannot pre-set a session id and reuse it).
 */
function startSession(req, userId, done) {
  req.session.regenerate((err) => {
    if (err) return done(err);
    req.session.userId = userId;
    req.session.save((err2) => done(err2));
  });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/auth/username-available — the live check while typing
// ---------------------------------------------------------------------------
router.get(
  '/auth/username-available',
  usernameCheckLimiter,
  asyncHandler(async (req, res) => {
    const check = usernames.validate(req.query.username);

    // Reject the impossible without touching the database at all.
    if (!check.ok) {
      return res.json({ username: check.username, available: false, reason: check.reason, message: check.message });
    }

    const key = 'uname:' + check.username;
    const cached = cacheStore.get(key);
    if (cached) return res.json(cached);

    const rows = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [check.username]);
    const payload = rows.length
      ? {
          username: check.username,
          available: false,
          reason: 'taken',
          message: 'That username is taken.',
          suggestions: usernames.suggestions(check.username),
        }
      : { username: check.username, available: true };

    // Short cache: absorbs the repeats from a fast typist without going stale.
    cacheStore.set(key, payload, 30);
    return res.json(payload);
  })
);

// ---------------------------------------------------------------------------
// POST /api/auth/register — username + password. No email is collected.
// ---------------------------------------------------------------------------
router.post(
  '/auth/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const check = usernames.validate(body.username);
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName = String(body.display_name || '').trim();

    if (!check.ok) return res.status(400).json({ error: check.message, reason: check.reason });

    const pwProblem = passwordProblem(password);
    if (pwProblem) return res.status(400).json({ error: pwProblem });
    if (displayName && displayName.length > 20) {
      return res.status(400).json({ error: 'Display name must be 20 characters or fewer.' });
    }

    const existing = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [check.username]);
    if (existing.length) {
      return res.status(409).json({
        error: 'That username is taken. Try another.',
        reason: 'taken',
        suggestions: usernames.suggestions(check.username),
      });
    }

    const passwordHash = await hashPassword(password);
    const name = displayName || check.username;

    // Two codes, issued now and shown exactly once. They are the only way back in
    // if the password is ever forgotten, because there is no email on the account.
    const codes = recovery.generatePair();
    const hashes = await Promise.all(codes.map((c) => recovery.hash(c)));

    const result = await execute(
      `INSERT INTO users (username, email, display_name, password_hash, recovery_hash, recovery_hash_2, recovery_created_at, created_at, last_login_at)
       VALUES (?, NULL, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [check.username, name, passwordHash, hashes[0], hashes[1]]
    );

    // The cached "available" answer is wrong as of now.
    cacheStore.del('uname:' + check.username);

    startSession(req, result.insertId, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Account created, but the session could not start. Please log in.' });
      }
      return res.status(201).json({
        success: true,
        user: { id: result.insertId, username: check.username, display_name: name },
        // Shown once and never retrievable again — only the hashes are kept.
        recovery_codes: codes.map((c) => recovery.format(c)),
      });
    });
  })
);

// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post(
  '/auth/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const username = usernames.normalise(body.username);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // A plain indexed equality test — usernames are stored lower-cased so the
    // index is usable, rather than wrapping the column in LOWER().
    const rows = await query(
      'SELECT id, username, display_name, password_hash FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    const user = rows[0];

    // Same response and similar timing whether or not the account exists.
    if (!user || !user.password_hash) {
      await verifyAgainstDummy(password);
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    await execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);

    startSession(req, user.id, (err) => {
      if (err) return res.status(500).json({ error: 'Could not start your session. Please try again.' });
      return res.json({
        success: true,
        user: { id: user.id, username: user.username, display_name: user.display_name },
      });
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POST /api/auth/recover — username + recovery code + a new password
//
// The code is the only secret that can take over an account, so this endpoint is
// rate limited to a handful of attempts an hour. That is what makes a 16-digit
// code safe rather than merely long.
// ---------------------------------------------------------------------------
router.post(
  '/auth/recover',
  recoverLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const username = usernames.normalise(body.username);
    const code = recovery.normalise(body.code);
    const next = typeof body.new_password === 'string' ? body.new_password : '';

    // One message for every failure, so this cannot be used to discover which
    // usernames exist or which codes are close.
    const REFUSED = 'That username and recovery code do not match.';

    if (!username || !next) {
      return res.status(400).json({ error: 'Enter your username, your recovery code and a new password.' });
    }
    const problem = passwordProblem(next);
    if (problem) return res.status(400).json({ error: problem });

    const rows = await query(
      'SELECT id, password_hash, recovery_hash, recovery_hash_2 FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    const user = rows[0];

    if (!user || (!user.recovery_hash && !user.recovery_hash_2)) {
      // Spend comparable time so a missing account is not obvious from the clock.
      await verifyAgainstDummy(next);
      return res.status(401).json({ error: REFUSED });
    }

    // Which of the two codes was offered? The spare must survive.
    const slot = await recovery.matchSlot(code, [user.recovery_hash, user.recovery_hash_2]);
    if (slot === -1) return res.status(401).json({ error: REFUSED });

    // Consumed on use: a code that leaked, or that someone watched you type, is
    // worthless the second time it is offered. The OTHER code keeps working, so
    // someone who gets in with one cannot lock the real owner out.
    await execute(
      slot === 0
        ? 'UPDATE users SET password_hash = ?, recovery_hash = NULL WHERE id = ?'
        : 'UPDATE users SET password_hash = ?, recovery_hash_2 = NULL WHERE id = ?',
      [await hashPassword(next), user.id]
    );

    startSession(req, user.id, (err) => {
      if (err) return res.json({ success: true, warning: 'Password changed. Please log in with it.' });
      return res.json({ success: true });
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/auth/recovery-code — issue a new code for the signed-in account
// ---------------------------------------------------------------------------
router.post(
  '/auth/recovery-code',
  requireLogin,
  changePasswordLimiter,
  asyncHandler(async (req, res) => {
    const codes = recovery.generatePair();
    const hashes = await Promise.all(codes.map((c) => recovery.hash(c)));
    await execute(
      'UPDATE users SET recovery_hash = ?, recovery_hash_2 = ?, recovery_created_at = UTC_TIMESTAMP() WHERE id = ?',
      [hashes[0], hashes[1], req.user.id]
    );
    // The only time these values are ever visible.
    return res.json({ success: true, recovery_codes: codes.map((c) => recovery.format(c)) });
  })
);

// ---------------------------------------------------------------------------
// POST /api/auth/change-password — you must already be signed in AND know the
// current password. Knowing the session alone is not enough: otherwise anyone
// at an unlocked laptop could take the account.
// ---------------------------------------------------------------------------
router.post(
  '/auth/change-password',
  requireLogin,
  changePasswordLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const current = typeof body.current_password === 'string' ? body.current_password : '';
    const next = typeof body.new_password === 'string' ? body.new_password : '';

    if (!current || !next) {
      return res.status(400).json({ error: 'Enter your current password and a new one.' });
    }

    const rows = await query('SELECT id, password_hash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const user = rows[0];
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: 'This account has no password set yet. Use the server to set one.' });
    }

    const ok = await verifyPassword(current, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'That is not your current password.' });
    }

    const problem = passwordProblem(next);
    if (problem) return res.status(400).json({ error: problem });

    if (await verifyPassword(next, user.password_hash)) {
      return res.status(400).json({ error: 'That is already your password. Choose a different one.' });
    }

    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(next), user.id]);

    // A new session id, so a session fixed before the change cannot be reused.
    startSession(req, user.id, (err) => {
      if (err) return res.status(200).json({ success: true, warning: 'Password changed. Please log in again.' });
      return res.json({ success: true });
    });
  })
);

// GET /api/auth/me
// ---------------------------------------------------------------------------
router.get('/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  return res.json({
    id: req.user.id,
    username: req.user.username,
    display_name: req.user.display_name,
    is_admin: !!req.user.is_admin,
  });
});

module.exports = router;
