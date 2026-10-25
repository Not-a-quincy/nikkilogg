'use strict';

/**
 * Shared browser launcher for the UI tests.
 *
 * Uses whatever Chrome/Chromium is already installed (set PUPPETEER_EXECUTABLE_PATH
 * to override). If none is found the UI tests skip instead of failing, so
 * `npm test` still works on a machine without a browser.
 */

const fs = require('fs');
const path = require('path');

let puppeteerCore = null;
try {
  puppeteerCore = require('puppeteer-core');
} catch (e) {
  /* optional — the UI tests will skip */
}

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (e) {
      /* keep looking */
    }
  }
  try {
    return require('puppeteer').executablePath();
  } catch (e) {
    return null;
  }
}

/** Launches a browser, or returns null (printing why) when it cannot. */
async function launch() {
  if (!puppeteerCore) {
    console.log('SKIP  browser tests — run: npm install --include=dev');
    return null;
  }
  const executablePath = findChrome();
  if (!executablePath) {
    console.log('SKIP  browser tests — no Chrome found. Set PUPPETEER_EXECUTABLE_PATH to your browser.');
    return null;
  }
  return puppeteerCore.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

module.exports = { launch, findChrome };
