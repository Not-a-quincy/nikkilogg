'use strict';

/**
 * The rules for a login username.
 *
 * One source of truth, used by registration, the live availability check and the
 * CLI. If these two ever disagree the live check would say "available" and
 * registration would then refuse, which is worse than not checking at all.
 *
 * Usernames are stored lower-cased. That is deliberate: it makes the lookup a
 * plain indexed equality test (`WHERE username = ?`) rather than a function call
 * on the column, which would throw the index away and turn every keystroke into
 * a full table scan. The pretty version lives in `display_name`.
 */

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

// Lower-case, starts with a letter or digit, then letters/digits/_/-.
const FORMAT = /^[a-z0-9][a-z0-9_-]*$/;

// Names that would collide with a route, or that someone would impersonate.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'superuser', 'system', 'sysadmin',
  'api', 'health', 'robots', 'sitemap', 'static', 'assets', 'public', 'cdn',
  'login', 'logout', 'signin', 'signup', 'register', 'auth', 'password', 'reset',
  'profile', 'settings', 'account', 'me', 'you', 'user', 'users', 'guest', 'anonymous',
  'browse', 'anime', 'mood', 'moods', 'events', 'about', 'privacy', 'import', 'staff',
  'search', 'explore', 'discover', 'home', 'index', 'list', 'lists',
  'nikkilog', 'nikki', 'official', 'support', 'help', 'contact', 'info', 'mail',
  'null', 'undefined', 'true', 'false', 'nan',
]);

function normalise(raw) {
  return String(raw == null ? '' : raw).trim().toLowerCase();
}

/**
 * @returns {{ok: boolean, username: string, reason?: string, message?: string}}
 */
function validate(raw) {
  const username = normalise(raw);

  if (!username) {
    return { ok: false, username, reason: 'empty', message: 'Pick a username.' };
  }
  if (username.length < MIN_LENGTH) {
    return { ok: false, username, reason: 'short', message: `Usernames are at least ${MIN_LENGTH} characters.` };
  }
  if (username.length > MAX_LENGTH) {
    return { ok: false, username, reason: 'long', message: `Usernames are at most ${MAX_LENGTH} characters.` };
  }
  if (!FORMAT.test(username)) {
    return {
      ok: false,
      username,
      reason: 'charset',
      message: 'Use letters, numbers, hyphens and underscores, starting with a letter or number.',
    };
  }
  if (/[-_]$/.test(username)) {
    return { ok: false, username, reason: 'charset', message: 'A username cannot end with a hyphen or underscore.' };
  }
  if (RESERVED.has(username)) {
    return { ok: false, username, reason: 'reserved', message: 'That name is reserved. Please pick another.' };
  }
  return { ok: true, username };
}

/** A few names to offer when the one they wanted is taken. */
function suggestions(raw, count = 3) {
  const base = normalise(raw).replace(/[-_]+$/, '') || 'user';
  const trimmed = base.slice(0, MAX_LENGTH - 3);
  const out = [];
  for (let n = 2; out.length < count && n < 40; n += 1) {
    out.push(trimmed + n);
  }
  return out;
}

module.exports = { MIN_LENGTH, MAX_LENGTH, FORMAT, RESERVED, normalise, validate, suggestions };
