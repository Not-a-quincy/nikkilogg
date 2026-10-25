'use strict';

/**
 * Password hashing using Node's built-in scrypt (no native build needed).
 *
 * scrypt is a memory-hard key-derivation function — one of the algorithms
 * OWASP recommends for password storage. Each password gets its own random
 * salt, and the parameters are stored alongside the hash so they can be
 * raised later without invalidating existing passwords.
 *
 * Stored format:  scrypt$N$r$p$<saltHex>$<hashHex>
 */

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const N = 32768;          // CPU/memory cost (2^15)
const R = 8;              // block size
const P = 1;              // parallelisation
const KEYLEN = 64;        // derived key length in bytes
const MAXMEM = 64 * 1024 * 1024; // 64 MB (needed for N=32768, r=8)
const SALT_BYTES = 16;

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  if (!n || !r || !p) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'hex');
    expected = Buffer.from(parts[5], 'hex');
  } catch (e) {
    return false;
  }
  if (!salt.length || !expected.length) return false;

  try {
    const derived = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch (e) {
    return false;
  }
}

// A throwaway hash so that a login attempt for a non-existent account still
// costs roughly the same time as a real one (prevents user enumeration by timing).
let dummyHashPromise = null;
async function verifyAgainstDummy(password) {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(16).toString('hex'));
  try {
    await verifyPassword(password, await dummyHashPromise);
  } catch (e) { /* ignore */ }
}

/** Returns an error string, or null if the password is acceptable. */
function passwordProblem(password) {
  if (typeof password !== 'string' || !password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (password.length > 200) return 'Password must be 200 characters or fewer.';
  return null;
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy, passwordProblem };
