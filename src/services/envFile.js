'use strict';

const fs = require('fs');

/**
 * Reading and writing single values in a `.env` file.
 *
 * Editing somebody's `.env` is a destructive operation if done carelessly — it
 * holds their database password — so this only ever touches the one line it was
 * asked to, and leaves everything else byte-for-byte alone.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

function assertKey(key) {
  if (!KEY_RE.test(String(key || ''))) throw new Error('Refusing to write a malformed env key: ' + key);
}

/** The current value of a key, or null. Comments and blanks are ignored. */
function readEnvVar(file, key) {
  assertKey(key);
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq).trim() === key) return trimmed.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Sets a key in place, preserving every other line, comment and blank line.
 * Creates the file if it does not exist. Returns what it did.
 */
function writeEnvVar(file, key, value) {
  assertKey(key);
  const line = key + '=' + value;
  const existed = fs.existsSync(file);
  let text = existed ? fs.readFileSync(file, 'utf8') : '';

  const re = new RegExp('^[ \\t]*' + key + '[ \\t]*=.*$', 'm');
  let action;
  if (re.test(text)) {
    text = text.replace(re, line);
    action = 'replaced';
  } else {
    // Append with no extra blank line: the promise of this function is that
    // nothing but the target line changes.
    if (text.length && !text.endsWith('\n')) text += '\n';
    text += line + '\n';
    action = existed ? 'appended' : 'created';
  }

  fs.writeFileSync(file, text);
  return action;
}

module.exports = { readEnvVar, writeEnvVar };
