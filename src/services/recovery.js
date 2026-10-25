'use strict';

const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('./password');

/**
 * Recovery codes — the only way to get an account back without an email address.
 *
 * Why 16 digits and not six:
 *
 *   digits   entropy   time to crack at 1,000 tries/hour
 *   4        13 bits   5 hours
 *   6        20 bits   21 days
 *   8        27 bits   6 years
 *   12       40 bits   57,000 years
 *   16       53 bits   571 million years
 *
 * A four- or six-digit code is not a secret; it is a delay. Sixteen digits is
 * still something a person can write on paper or read down a phone, which is the
 * whole point of using digits rather than a long random string.
 *
 * Rate limiting is the second half of the defence and is not optional — it is
 * what turns "571 million years" into a real number. See RECOVERY_LIMIT below.
 *
 * Accounts get TWO codes, and each is usable once. Two because one code is a
 * single point of failure: lose it, or have someone watch you type it, and the
 * account is gone. With two, kept in different places, one being lost or used
 * still leaves a way back in. Using one does not invalidate the other, so an
 * attacker who gets in with one code cannot lock the real owner out.
 */

const DIGITS = 16;
const GROUP = 4;

/** A fresh code, as plain digits. */
function generate() {
  // crypto.randomInt is uniform; Math.random is not, and is predictable.
  let out = '';
  while (out.length < DIGITS) out += String(crypto.randomInt(0, 10));
  return out;
}

/** 4821903722105566 -> 4821-9037-2210-5566, which is easier to read back. */
function format(code) {
  const digits = normalise(code);
  return digits.replace(new RegExp(`(.{${GROUP}})(?=.)`, 'g'), '$1-');
}

/** Accepts a code however it was typed: spaces, dashes, or nothing at all. */
function normalise(input) {
  return String(input == null ? '' : input).replace(/\D/g, '').slice(0, DIGITS);
}

function isWellFormed(input) {
  return normalise(input).length === DIGITS;
}

/** Stored the same way a password is: never in plain text. */
async function hash(code) {
  return hashPassword(normalise(code));
}

/** Verifies a typed code against a stored hash. Never throws on a bad code. */
async function verify(code, storedHash) {
  if (!storedHash || !isWellFormed(code)) return false;
  try {
    return await verifyPassword(normalise(code), storedHash);
  } catch (err) {
    return false;
  }
}

/** Two fresh codes, in the order they should be shown and stored. */
function generatePair() {
  const a = generate();
  let b = generate();
  // Astronomically unlikely, but a duplicate pair would be a silent bug.
  while (b === a) b = generate();
  return [a, b];
}

/**
 * Checks a typed code against every stored hash.
 *
 * Returns the index of the matching slot, or -1. The caller needs to know WHICH
 * one matched so it can consume only that one and leave the spare working.
 */
async function matchSlot(code, hashes) {
  if (!isWellFormed(code)) return -1;
  for (let i = 0; i < hashes.length; i += 1) {
    if (hashes[i] && (await verify(code, hashes[i]))) return i;
  }
  return -1;
}

module.exports = {
  DIGITS, GROUP, generate, generatePair, format, normalise, isWellFormed, hash, verify, matchSlot,
};
