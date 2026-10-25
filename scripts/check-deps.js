#!/usr/bin/env node
'use strict';

/**
 * Runs before `npm start` / `npm run dev`.
 *
 * If any package listed in package.json is missing from node_modules (which
 * happens after extracting an update that added a dependency), it installs
 * them automatically instead of crashing with "Cannot find module".
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});

function missingDeps() {
  return deps.filter((d) => {
    try {
      require.resolve(d, { paths: [ROOT] });
      return false;
    } catch (e) {
      return true;
    }
  });
}

const missing = missingDeps();
if (!missing.length) process.exit(0);

console.log('\n  Missing packages: ' + missing.join(', '));
console.log('  Installing dependencies (this only takes a moment)…\n');

const res = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32', // npm is a .cmd on Windows
});

if (res.status !== 0 || missingDeps().length) {
  console.error('\n  Could not install the dependencies automatically.');
  console.error('  Please open a terminal in this folder and run:  npm install\n');
  process.exit(1);
}

console.log('  Dependencies ready.\n');
