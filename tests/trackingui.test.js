'use strict';
// Updating your progress on the anime page used to end in console.log(data), so a
// successful save and a failed one looked identical from the page: nothing at all.
// These checks drive the real page and assert you are actually told what happened.
process.env.SECRET_KEY = 'k'.repeat(64);
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const http = require('http');
const ejs = require('ejs');
const { launch } = require('./helpers/browser');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };
const ROOT = path.join(__dirname, '..');

(async () => {
  const user = { id: 7, username: 'ughdrag', display_name: 'Vasanth', is_admin: false };
  const html = await ejs.renderFile(path.join(ROOT, 'views', 'anime.ejs'),
    { animeId: 52991, userId: 7, currentUser: user, isLoggedIn: true, anime: null });

  // Serve the page, and stub the tracking endpoint with whatever reply we want.
  let reply = { status: 200, body: { success: true } };
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/update-user-anime-tracking')) {
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(reply.body));
    }
    if (req.url.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{}');
    }
    // Serve the real scripts and styles, or the page's JS never parses.
    const clean = req.url.split('?')[0];
    const file = path.join(ROOT, 'public', clean);
    if (clean !== '/' && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const type = clean.endsWith('.js') ? 'text/javascript'
        : clean.endsWith('.css') ? 'text/css'
        : clean.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await launch();
  if (!browser) { console.log('skipped — no browser'); server.close(); process.exit(0); }
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 900 });

  // The status line must exist at all.
  await page.goto(`http://127.0.0.1:${port}/anime/52991`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 500));
  ck('the tracking card has a status line', await page.evaluate(() => !!document.getElementById('trackStatus')));
  ck('the status line is announced to screen readers',
    await page.evaluate(() => {
      const el = document.getElementById('trackStatus');
      return el && el.getAttribute('role') === 'status' && el.getAttribute('aria-live') === 'polite';
    }));

  const press = async () => {
    await page.evaluate(() => {
      const b = document.querySelector('.status-button[data-status="watching"]');
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    return page.evaluate(() => {
      const el = document.getElementById('trackStatus');
      return { text: el.textContent.trim(), cls: el.className };
    });
  };

  // ---- a successful save says so ----
  reply = { status: 200, body: { success: true } };
  let st = await press();
  ck('a successful save reports back', st.text === 'Saved', st.text || '(nothing)');
  ck('and it is marked as a success', /is-good/.test(st.cls), st.cls);

  // ---- a server error is shown, not swallowed ----
  reply = { status: 500, body: { message: 'Database is unhappy' } };
  st = await press();
  ck('a failed save shows the reason', /Database is unhappy/.test(st.text), st.text || '(nothing)');
  ck('and it is marked as a failure', /is-bad/.test(st.cls), st.cls);

  // ---- a generic failure still says something ----
  reply = { status: 400, body: {} };
  st = await press();
  ck('a failure with no message still says something', st.text.length > 0, st.text || '(nothing)');

  // ---- not signed in is called out specifically ----
  reply = { status: 401, body: {} };
  st = await press();
  ck('being signed out is explained', /sign in/i.test(st.text), st.text || '(nothing)');

  // ---- and it does not throw ----
  ck('no uncaught JavaScript error', errors.length === 0, errors[0] || 'none');

  // ---- the request it sends is the shape the server expects ----
  const sent = await page.evaluate(async () => {
    let captured = null;
    const real = window.fetch;
    window.fetch = (url, opts) => { if (String(url).includes('update-user-anime-tracking')) captured = JSON.parse(opts.body); return real(url, opts); };
    document.querySelector('.status-button[data-status="completed"]')?.click();
    await new Promise((r) => setTimeout(r, 400));
    window.fetch = real;
    return captured;
  });
  ck('it posts the mal_id', sent && sent.mal_id === 52991, sent && sent.mal_id);
  ck('it posts the chosen status', sent && sent.status === 'completed', sent && sent.status);
  ck('it posts a numeric episode count', sent && typeof sent.current_episode === 'number', sent && typeof sent.current_episode);

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
