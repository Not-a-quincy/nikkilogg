#!/usr/bin/env node
'use strict';

/**
 * Runs every test suite and reports a summary.
 *
 *   npm test
 *
 * The UI suites need a browser; if none is found they print SKIP and count as
 * passing, so the suite is still useful on a machine without Chrome.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { OUTPUT } = require('./helpers/paths');

fs.mkdirSync(OUTPUT, { recursive: true });

const SUITES = [
  'username',
  'password',
  'recovery',
  'smoke',
  'proxy',
  'seo',
  'moods',
  'import',
  'envfile',
  'animefetch',
  'animeupdate',
  'animeapi',
  'safewrite',
  'overview',
  'cards',
  'responsive',
  'staff',
  'contact',
  'upload',
  'sessiontest',
  'tokens',
  'matcher',
  'extension',
  'extensionrun',
  'content',
  'match',
  'dbtest',
  'authtest',
  'csscheck',
  'browsecheck',
  'animecheck',
  'trackingui',
  'recoveryui',
  'pagecheck',
  'searchcheck',
  'profilecheck',
];

const UI_SUITES = ['browsecheck', 'animecheck', 'pagecheck', 'searchcheck', 'profilecheck'];
const FAST = process.argv.includes('--fast');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));

let toRun = SUITES;
if (only) toRun = SUITES.filter((s) => s.includes(only));
else if (FAST) toRun = SUITES.filter((s) => !UI_SUITES.includes(s));
if (!toRun.length) {
  console.error(`No suite matches "${only}". Available: ${SUITES.join(', ')}`);
  process.exit(2);
}

const failed = [];

for (const suite of toRun) {
  const line = `── ${suite} `;
  console.log('\n' + line + '─'.repeat(Math.max(0, 58 - line.length)));
  const file = [`${suite}.js`, `${suite}.test.js`]
    .map((f) => path.join(__dirname, f))
    .find((f) => fs.existsSync(f));
  if (!file) {
    console.log(`  (no file for suite "${suite}")`);
    failed.push(suite);
    continue;
  }
  const result = spawnSync(process.execPath, [file], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) failed.push(suite);
}

console.log('\n' + '='.repeat(60));
if (failed.length) {
  console.log(`FAILED: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`All ${toRun.length} suites passed.`);
