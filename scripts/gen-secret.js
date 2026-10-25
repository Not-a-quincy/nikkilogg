#!/usr/bin/env node
'use strict';

/**
 * Generate the session secret and write it into `.env`.
 *
 *   npm run gen-secret            # create or replace SECRET_KEY in .env
 *   npm run gen-secret -- --print # just print one, change nothing
 *
 * SECRET_KEY signs session cookies, so the app refuses to start without it.
 * This exists so that "generate a long random string and paste it in" is not a
 * step anybody has to get right by hand.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readEnvVar, writeEnvVar } = require('../src/services/envFile');

function main() {
  const printOnly = process.argv.slice(2).includes('--print');
  const secret = crypto.randomBytes(32).toString('hex');

  if (printOnly) {
    console.log(secret);
    return;
  }

  const root = path.join(__dirname, '..');
  const envFile = fs.existsSync(path.join(root, '.env'))
    ? path.join(root, '.env')
    : path.join(root, 'login.env');
  const target = fs.existsSync(envFile) ? envFile : path.join(root, '.env');

  const existing = readEnvVar(target, 'SECRET_KEY');
  const action = writeEnvVar(target, 'SECRET_KEY', secret);

  console.log('');
  console.log('  ' + path.basename(target) + ': SECRET_KEY ' + action + '.');
  if (existing) {
    console.log('  (the previous secret was replaced — anyone logged in will need to log in again)');
  }
  console.log('  Restart the server for it to take effect.');
  console.log('');
}

main();
