'use strict';

const crypto = require('crypto');
const { query, execute } = require('../config/db');

/**
 * Personal API tokens.
 *
 * A token is shown to its owner exactly once, at creation. Only a SHA-256 hash
 * is stored, so a database leak does not hand anyone a working credential.
 * The first few characters are kept in the clear purely for display, so a user
 * can tell two tokens apart in the list.
 */

const PREFIX = 'nkl_';

function generate() {
  const secret = crypto.randomBytes(24).toString('base64url');
  const token = PREFIX + secret;
  return { token, hash: hash(token), prefix: token.slice(0, PREFIX.length + 6) };
}

function hash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Creates a token and returns the plaintext — the only time it is available. */
async function createToken(userId, name) {
  const { token, hash: h, prefix } = generate();
  const result = await execute(
    'INSERT INTO api_tokens (user_id, name, token_hash, prefix) VALUES (?, ?, ?, ?)',
    [userId, (name || 'Extension').toString().slice(0, 80), h, prefix]
  );
  return { id: result.insertId, token, prefix };
}

async function listTokens(userId) {
  return query(
    `SELECT id, name, prefix, last_used_at, created_at
       FROM api_tokens
      WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY id DESC`,
    [userId]
  );
}

async function revokeToken(userId, id) {
  const result = await execute(
    'UPDATE api_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    [id, userId]
  );
  return result.affectedRows > 0;
}

/** Resolves a bearer token to a user, or null. */
async function userForToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith(PREFIX)) return null;

  const rows = await query(
    `SELECT t.id AS token_id, u.id, u.username, u.display_name, u.is_admin, u.is_early_user,
            u.profile_pic, u.bg_image
       FROM api_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.revoked_at IS NULL
      LIMIT 1`,
    [hash(token)]
  );
  if (!rows.length) return null;

  // Best-effort usage stamp; never block a request on it.
  execute('UPDATE api_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = ?', [rows[0].token_id])
    .catch(() => {});

  return rows[0];
}

module.exports = { createToken, listTokens, revokeToken, userForToken, hash, PREFIX };
