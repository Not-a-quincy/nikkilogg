'use strict';
// The extension has never been loaded into a real browser here, so its behaviour
// was only ever checked structurally: does the manifest parse, is the JS valid.
// That says nothing about whether it reads a page correctly.
//
// This runs the REAL content script and matcher against synthetic streaming pages,
// with a stubbed `chrome.runtime.sendMessage`, and asserts what it actually sends.
// It is not a substitute for loading the extension in Chrome — it cannot test the
// background worker, the popup, or permissions — but it does test the part that
// decides "is this an episode, which show, and should I log it".
process.env.SECRET_KEY = 'e'.repeat(64);
process.env.DB_HOST = '127.0.0.1';

const http = require('http');
const path = require('path');
const { launch } = require('./helpers/browser');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

const ROOT = path.join(__dirname, '..');
const MATCHER = path.join(ROOT, 'extension', 'lib', 'matcher.js');
const CONTENT = path.join(ROOT, 'extension', 'content.js');

// A synthetic streaming page. `episode: true` gives it the shape of an episode
// page (title + heading + og:title + a video); otherwise it looks like a homepage.
function pageHtml({ title, heading, og, video }) {
  return `<!DOCTYPE html><html><head><title>${title}</title>
    ${og ? `<meta property="og:title" content="${og}">` : ''}
    </head><body>
    ${heading ? `<h1>${heading}</h1>` : ''}
    ${video ? '<video id="v"></video>' : ''}
    </body></html>`;
}

const ROUTES = {
  '/watch/frieren-episode-3': pageHtml({
    title: 'Frieren: Beyond Journey\u2019s End Episode 3 - Watch Online',
    heading: 'Frieren: Beyond Journey\u2019s End',
    og: 'Frieren: Beyond Journey\u2019s End Episode 3',
    video: true,
  }),
  '/': pageHtml({ title: 'Home \u2014 AnimeStream', heading: 'Latest releases', video: false }),
  '/watch/unknown-show-episode-2': pageHtml({
    title: 'Some Show Episode 2 - Watch Online',
    heading: 'Some Show',
    og: 'Some Show Episode 2',
    video: true,
  }),
};

/**
 * Loads a synthetic page, stubs the extension messaging, injects the real
 * matcher and content script, and returns everything it sent.
 */
async function runPage(browser, port, route, replies) {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'domcontentloaded' });

  // Fake a playable video: duration/currentTime cannot be set on an empty <video>.
  await page.evaluate(() => {
    const v = document.querySelector('video');
    if (v) {
      Object.defineProperty(v, 'duration', { get: () => 100 });
      Object.defineProperty(v, 'currentTime', { get: () => 90, set: () => {} });
      Object.defineProperty(v, 'readyState', { get: () => 4 });
    }
    window.__msgs = [];
    window.chrome = {
      runtime: {
        sendMessage(message, cb) {
          window.__msgs.push(message);
          const reply = (window.__replies || {})[message.type] || { ok: false, error: 'no stub' };
          setTimeout(() => cb(reply), 0);
        },
      },
    };
    window.__replies = null;
  });
  await page.evaluate((r) => { window.__replies = r; }, replies);

  await page.addScriptTag({ path: MATCHER });
  await page.addScriptTag({ path: CONTENT });
  await new Promise((r) => setTimeout(r, 400));

  // Nudge playback so the 85% threshold fires, if a video is present.
  await page.evaluate(() => {
    const v = document.querySelector('video');
    if (v) v.dispatchEvent(new Event('timeupdate'));
  });
  await new Promise((r) => setTimeout(r, 500));

  const out = await page.evaluate(() => ({ msgs: window.__msgs, hasChip: !!document.querySelector('button') }));
  await page.close();
  return out;
}

(async () => {
  const server = http.createServer((req, res) => {
    const body = ROUTES[req.url.split('?')[0]];
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html' });
    res.end(body || 'not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await launch();
  if (!browser) { console.log('skipped — no browser'); server.close(); process.exit(0); }

  const CONFIDENT = { settings: { ok: true, data: { enabled: true, token: 'tok', autoLog: true, threshold: 85, idleMinutes: 8 } } };
  const lookup = (extra) => Object.assign({ lookup: { ok: true, data: Object.assign({ confident: true, best: { mal_id: 52991, title: 'Sousou no Frieren' } }, extra) } }, CONFIDENT);

  // ---- 1. a real episode page, confident, auto-log on ----
  let r = await runPage(browser, port, '/watch/frieren-episode-3', Object.assign({ progress: { ok: true } }, lookup()));
  const types = r.msgs.map((m) => m.type);
  ck('it asks for its settings first', types[0] === 'settings', types.join(','));
  ck('it looks up the show it parsed', types.includes('lookup'), types.join(','));
  const lk = r.msgs.find((m) => m.type === 'lookup');
  ck('the parsed show name is right', lk && /frieren/i.test(lk.title), lk && lk.title);
  ck('it does NOT leak the episode into the search', lk && !/episode\s*3/i.test(lk.title), lk && lk.title);
  const pr = r.msgs.find((m) => m.type === 'progress');
  ck('it logs the episode after playback passes the threshold', !!pr, types.join(','));
  ck('it logs the right episode number', pr && pr.payload.episode === 3, pr && pr.payload.episode);
  ck('it logs against the matched show', pr && pr.payload.mal_id === 52991, pr && pr.payload.mal_id);
  ck('it marks it as watching', pr && pr.payload.status === 'watching', pr && pr.payload.status);

  // ---- 2. a page that is not an episode: total silence ----
  r = await runPage(browser, port, '/', CONFIDENT);
  ck('on a non-episode page it sends nothing but settings',
    r.msgs.length === 1 && r.msgs[0].type === 'settings', r.msgs.map((m) => m.type).join(',') || 'nothing');

  // ---- 3. not connected (no token): silent ----
  r = await runPage(browser, port, '/watch/frieren-episode-3', { settings: { ok: true, data: { enabled: false } } });
  ck('with no token it stops after settings', r.msgs.length === 1, r.msgs.map((m) => m.type).join(','));

  // ---- 4. not confident: it asks, and does not log on its own ----
  r = await runPage(browser, port, '/watch/unknown-show-episode-2',
    Object.assign({ progress: { ok: true } }, lookup({ confident: false })));
  ck('an unsure match still looks the show up', r.msgs.some((m) => m.type === 'lookup'));
  ck('an unsure match does NOT auto-log', !r.msgs.some((m) => m.type === 'progress'),
    r.msgs.map((m) => m.type).join(','));

  // ---- 5. already logged: says nothing, logs nothing ----
  r = await runPage(browser, port, '/watch/frieren-episode-3',
    Object.assign({ progress: { ok: true } }, lookup({ best: { mal_id: 52991, title: 'Sousou no Frieren', tracking: { current_episode: 5 } } })));
  ck('if the episode is already logged it does not log again',
    !r.msgs.some((m) => m.type === 'progress'), r.msgs.map((m) => m.type).join(','));

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
