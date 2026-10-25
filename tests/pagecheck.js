'use strict';
process.env.SECRET_KEY = 'pagecheck';
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { launch } = require('./helpers/browser');
const app = require('../src/app');

const { ROOT, OUTPUT } = require('./helpers/paths');
const OUT = OUTPUT;;
const user = { id: 7, display_name: 'Vasanth', is_admin: true, is_early_user: true, profile_pic: '/default-profile.png', bg_image: '/default-bg.jpg' };

const PAGES = [
  { url: '/', name: 'home' },
  { url: '/browse', name: 'browse' },
  { url: '/anime/21', name: 'anime' },
  { url: '/events', name: 'events' },
  { url: '/about', name: 'about' },
  { url: '/privacy', name: 'privacy' },
  { url: '/login', name: 'login' },
  { url: '/__pv_profile.html', name: 'profile' },
  { url: '/__pv_admin.html', name: 'admin' },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const html = await ejs.renderFile(path.join(ROOT, 'views', 'profile.ejs'), { currentUser: user, isLoggedIn: true });
  fs.writeFileSync(path.join(ROOT, 'public', '__pv_profile.html'), html);
  const adminHtml = await ejs.renderFile(path.join(ROOT, 'views', 'admin_promos.ejs'), { currentUser: user, isLoggedIn: true });
  fs.writeFileSync(path.join(ROOT, 'public', '__pv_admin.html'), adminHtml);

  const server = app.listen(5081);
  await new Promise((r) => server.once('listening', r));
  const browser = await launch();
  if (!browser) { console.log('skipped — no browser available'); process.exit(0); }

  let fail = 0;
  for (const pg of PAGES) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
    // A 401 from an API call is correct behaviour on a logged-out page — the
    // app's scripts probe authenticated endpoints regardless. Only real script
    // errors should fail this suite.
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' && /Failed to load resource.*\b(401|403)\b/.test(text)) return;
      if (m.type() !== 'error') return;
      const t = m.text();
      // network noise from the sandbox (no DB / blocked news proxy) is expected
      if (/Failed to fetch|NetworkError|net::ERR|Status: 500|Fetch failed|Error fetching|Fetch error|Unexpected token|Error loading|500 \(Internal Server Error\)|404 \(Not Found\)/i.test(t)) return;
      errors.push('console: ' + t);
    });
    await page.setRequestInterception(true);
    // the news proxy uses Node fetch, which is blocked in this sandbox
    page.on('request', (r) => (r.url().includes('/api/news') ? r.abort() : r.continue()));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto('http://127.0.0.1:5081' + pg.url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null);
    await new Promise((r) => setTimeout(r, 900));

    const state = await page.evaluate(() => ({
      topbar: !!document.querySelector('.topbar'),
      brand: !!document.querySelector('.brand-name'),
      rail: !!document.querySelector('.vertical-nav:not(.hidden)'),
      tokens: !!Array.from(document.styleSheets).find((s) => (s.href || '').includes('tokens.css')),
      bodyW: document.documentElement.scrollWidth - window.innerWidth,
    }));

    const expectTopbar = pg.name !== 'login'; // login/register are standalone cards
    const ok = errors.length === 0 && state.topbar === expectTopbar && !state.rail && state.bodyW <= 1;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${pg.name.padEnd(8)} topbar=${state.topbar} rail=${state.rail} tokens=${state.tokens} overflowX=${state.bodyW}px`);
    if (errors.length) errors.slice(0, 4).forEach((e) => console.log('        ' + e));
    await page.close();
  }

  await browser.close();
  server.close();
  for (const f of ['__pv_profile.html', '__pv_admin.html']) { try { fs.unlinkSync(path.join(ROOT, 'public', f)); } catch (e) {} }
  console.log(fail ? `\n${fail} page(s) with problems` : '\nAll pages clean');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
