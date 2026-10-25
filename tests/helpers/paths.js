'use strict';

const fs = require('fs');
const path = require('path');

/** Repository root (the folder holding package.json). */
const ROOT = path.join(__dirname, '..', '..');

/** Scratch folder for screenshots produced by the UI tests (git-ignored). */
const OUTPUT = path.join(__dirname, '..', '.output');

// The UI suites write screenshots here; make sure it exists even when a single
// suite is run directly rather than through the runner.
fs.mkdirSync(OUTPUT, { recursive: true });

module.exports = { ROOT, OUTPUT };
