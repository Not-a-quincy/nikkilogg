'use strict';
// Checks the extension package is well formed — the failures a user hits first
// are a bad manifest or a missing file, and both are cheap to catch here.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..', 'extension');
let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

// ---- manifest ----
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  ck('manifest.json parses', true);
} catch (e) {
  ck('manifest.json parses', false, e.message);
}

if (manifest) {
  ck('manifest is v3', manifest.manifest_version === 3, manifest.manifest_version);
  ck('has a name and version', !!manifest.name && !!manifest.version, manifest.name + ' ' + manifest.version);
  ck('declares a background service worker', !!(manifest.background && manifest.background.service_worker), manifest.background && manifest.background.service_worker);
  ck('declares content scripts', Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0);
  ck('has a popup', !!(manifest.action && manifest.action.default_popup), manifest.action && manifest.action.default_popup);
}

// ---- every referenced file exists ----
const referenced = [];
if (manifest) {
  if (manifest.background && manifest.background.service_worker) referenced.push(manifest.background.service_worker);
  if (manifest.action && manifest.action.default_popup) referenced.push(manifest.action.default_popup);
  for (const cs of manifest.content_scripts || []) for (const js of cs.js || []) referenced.push(js);
  for (const size of Object.values(manifest.icons || {})) referenced.push(size);
}
for (const rel of referenced) {
  ck('referenced file exists: ' + rel, fs.existsSync(path.join(EXT, rel)));
}
ck('the popup loads a script', referenced.length > 3, referenced.length + ' files referenced');

// ---- every JS file is syntactically valid ----
const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) jsFiles.push(full);
  }
})(EXT);

for (const file of jsFiles) {
  const rel = path.relative(EXT, file);
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: rel });
    ck('valid JS: ' + rel, true);
  } catch (e) {
    ck('valid JS: ' + rel, false, e.message);
  }
}
ck('found the expected scripts', jsFiles.length >= 4, jsFiles.length + ' scripts');

// ---- the matcher must work as a plain browser script (UMD) ----
const matcherSrc = fs.readFileSync(path.join(EXT, 'lib', 'matcher.js'), 'utf8');
const sandbox = { self: {} };
sandbox.window = sandbox.self;
vm.createContext(sandbox);
try {
  new vm.Script(matcherSrc).runInContext(sandbox);
  ck('matcher attaches itself to the global (browser mode)', typeof sandbox.self.NikkilogMatcher === 'object' && typeof sandbox.self.NikkilogMatcher.parse === 'function');
  const r = sandbox.self.NikkilogMatcher.parse({ title: 'Frieren Episode 5' });
  ck('matcher works when loaded as a script', r.series === 'Frieren' && r.episode === 5, r.series + ' / ' + r.episode);
} catch (e) {
  ck('matcher loads in browser mode', false, e.message);
}

// ---- the content script must not run before the matcher ----
if (manifest && manifest.content_scripts && manifest.content_scripts[0]) {
  const js = manifest.content_scripts[0].js || [];
  ck('matcher is loaded before the content script', js.indexOf('lib/matcher.js') === 0 && js.indexOf('content.js') > 0, js.join(', '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
