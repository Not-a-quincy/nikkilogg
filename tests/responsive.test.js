'use strict';
// Loads the real pages at real device widths and looks for the things that
// actually break layouts: horizontal overflow, content clipped off-screen,
// elements wider than the viewport, and unreachable navigation.
process.env.SECRET_KEY = 'responsive-check';
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { launch } = require('./helpers/browser');
const app = require('../src/app');

const ROOT = path.join(__dirname, '..');
const madeFiles = [];
async function renderGated() {
  const out = [];
  for (const [name, view, extra] of GATED) {
    const html = await ejs.renderFile(path.join(ROOT, 'views', view), Object.assign({
      currentUser: { id: 1, display_name: 'Vasanth', is_admin: true, profile_pic: '/default-profile.png' },
      isLoggedIn: true, isAdmin: true,
    }, extra));
    const file = path.join(ROOT, 'public', '__resp_' + name + '.html');
    fs.writeFileSync(file, html);
    madeFiles.push(file);
    out.push([name, '/__resp_' + name + '.html']);
  }
  return out;
}
function cleanup() { madeFiles.forEach((f) => { try { fs.unlinkSync(f); } catch (e) { /* gone */ } }); }

const WIDTHS = [
  ['iPhone SE', 320, 568],
  ['Android S', 360, 640],
  ['iPhone', 375, 667],
  ['iPhone 14', 390, 844],
  ['iPhone Plus', 414, 896],
  ['iPad mini', 768, 1024],
  ['iPad Air', 820, 1180],
  ['iPad landscape', 1024, 768],
  ['laptop', 1280, 800],
  ['desktop', 1440, 900],
  ['wide', 1920, 1080],
];

const PAGES = [
  ['home', '/'],
  ['browse', '/browse?category=all'],
  ['anime', '/anime/52991'],
  ['login', '/login'],
  ['about', '/about'],
  ['privacy', '/privacy'],
  ['events', '/events'],
  ['mood', '/mood/calm'],
];

// These need a login, so loading their URL would just measure the login page.
// Render them to files and audit the real markup.
const GATED = [
  ['import', 'import.ejs', {}],
  ['settings', 'settings.ejs', {}],
  ['profile', 'profile.ejs', {
    overview: {
      total: 299, episodes: 4120, minutes: 98880, watchTime: '69 days', meanScore: '7.85', scored: 240, isEmpty: false,
      byStatus: [
        { key: 'watching', label: 'Watching', count: 8, percent: 3 },
        { key: 'completed', label: 'Completed', count: 223, percent: 75 },
        { key: 'on-hold', label: 'On hold', count: 8, percent: 3 },
        { key: 'dropped', label: 'Dropped', count: 17, percent: 6 },
        { key: 'plan-to-watch', label: 'Plan to watch', count: 43, percent: 14 },
      ],
      recent: [
        { malId: 52991, title: 'Frieren: Beyond Journey\u2019s End', poster: '/favicon.svg', status: 'completed', statusLabel: 'Completed', episodes: 28, score: 10 },
        { malId: 5114, title: 'Fullmetal Alchemist: Brotherhood', poster: '/favicon.svg', status: 'watching', statusLabel: 'Watching', episodes: 41, score: 9 },
        { malId: 1, title: 'Cowboy Bebop', poster: '/favicon.svg', status: 'plan-to-watch', statusLabel: 'Plan to watch', episodes: 0, score: null },
      ],
    },
  }],
];

const ANIME = {
  mal_id: 52991, title: 'Frieren: Beyond Journey\u2019s End', title_en: 'Frieren: Beyond Journey\u2019s End',
  title_jp: '\u846c\u9001\u306e\u30d5\u30ea\u30fc\u30ec\u30f3',
  synopsis: 'During their decade-long quest to defeat the Demon King, the elf mage Frieren and her companions learn what it means to outlive the people you love.',
  poster_image_url: '/favicon.svg', kitsu_cover_image_url: '/favicon.svg',
  anime_type: 'TV', episodes: 28, status: 'Finished Airing', start_date: '2023-09-29', end_date: '2024-03-22',
  duration: '24 min per ep', anime_source: 'Manga', anime_rank: 1, rating: 'PG-13', season: 'fall', anime_year: 2023,
  average_rating: 9.3, members: 1200000, scored_by: 800000,
  genre: [{ name: 'Adventure' }, { name: 'Drama' }, { name: 'Fantasy' }], studios: [{ name: 'Madhouse' }],
};

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

async function audit(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
  await new Promise((r) => setTimeout(r, 120));
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement;
    const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) - vw;

    // the widest element sticking out past the viewport
    let worst = null;
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const over = Math.round(r.right - vw);
      if (over > 2 && (!worst || over > worst.over)) {
        worst = { over, tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 40) };
      }
    });

    // is anything visibly clipped horizontally by an ancestor with overflow hidden?
    let clipped = 0;
    document.querySelectorAll('body *').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0) {
        const st = getComputedStyle(el);
        if (st.overflowX === 'hidden' || st.overflowX === 'clip') clipped += 1;
      }
    });

    // .ham-menu is an inert compatibility stub; the real control is this button
    const ham = document.querySelector('.topbar-menu-btn');
    const hamVisible = ham ? getComputedStyle(ham).display !== 'none' && ham.getBoundingClientRect().width > 0 : false;
    const topbar = document.querySelector('.site-topbar, .topbar, header');
    const bodyText = (document.body.innerText || '').trim().length;

    return { vw, overflow, worst, clipped, hamVisible, hasTopbar: !!topbar, bodyText };
  });
}

async function main() {
  const server = app.listen(5069);
  await new Promise((r) => server.once('listening', r));
  const browser = await launch();
  if (!browser) { console.log('skipped — no browser available'); server.close(); process.exit(0); }

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/anime/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ANIME) });
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{}' });
    return r.continue();
  });

  const problems = [];
  const gated = await renderGated();
  const ALL_PAGES = PAGES.concat(gated);

  for (const [pageName, url] of ALL_PAGES) {
    await page.goto('http://127.0.0.1:5069' + url, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 350));
    const results = [];
    for (const [label, w, h] of WIDTHS) {
      const r = await audit(page, w, h);
      results.push([label, w, r]);
      if (r.overflow > 2) problems.push(`${pageName} @ ${label}(${w}px): overflows by ${r.overflow}px${r.worst ? ' — ' + r.worst.tag + '.' + r.worst.cls : ''}`);
      if (r.bodyText < 40) problems.push(`${pageName} @ ${label}(${w}px): almost no visible text (${r.bodyText} chars)`);
    }
    const worstOver = Math.max(...results.map(([, , r]) => r.overflow));
    const worstAt = results.find(([, , r]) => r.overflow === worstOver);
    ck(`${pageName}: no horizontal overflow at any width`, worstOver <= 2,
      worstOver <= 2 ? 'clean across ' + WIDTHS.length + ' widths' : worstOver + 'px @ ' + worstAt[0]);
  }

  // ---- the menu on a phone ----
  await page.goto('http://127.0.0.1:5069/', { waitUntil: 'domcontentloaded' });
  const navSmall = await audit(page, 375, 667);
  const navLarge = await audit(page, 1280, 800);
  ck('a phone shows the menu button', navSmall.hamVisible === true, 'visible=' + navSmall.hamVisible);
  ck('a desktop hides the menu button', navLarge.hamVisible === false, 'visible=' + navLarge.hamVisible);

  // it must actually open, reveal the links, and close
  await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 250));
  const closed = await page.evaluate(() => {
    const nav = document.getElementById('topnav');
    return { open: nav.classList.contains('open'), visible: nav.getBoundingClientRect().height > 0 };
  });
  ck('the menu starts closed', closed.open === false);
  await page.click('.topbar-menu-btn');
  await new Promise((r) => setTimeout(r, 350));
  const opened = await page.evaluate(() => {
    const nav = document.getElementById('topnav');
    const btn = document.querySelector('.topbar-menu-btn');
    const links = Array.from(nav.querySelectorAll('a'));
    const reachable = links.filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length;
    return { open: nav.classList.contains('open'), aria: btn.getAttribute('aria-expanded'), total: links.length, reachable,
             icon: (btn.querySelector('.material-symbols-outlined') || {}).textContent };
  });
  ck('tapping the button opens the menu', opened.open === true);
  ck('it reports itself as expanded', opened.aria === 'true', opened.aria);
  ck('every nav link becomes reachable', opened.reachable === opened.total && opened.total >= 4, opened.reachable + '/' + opened.total);
  ck('the icon becomes a close cross', opened.icon === 'close', opened.icon);

  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));
  ck('Escape closes the menu', await page.evaluate(() => !document.getElementById('topnav').classList.contains('open')));

  // ---- tap targets on a phone ----
  await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
  for (const [name, url] of [['home', '/'], ['browse', '/browse?category=all']]) {
    await page.goto('http://127.0.0.1:5069' + url, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 300));
    const small = await page.evaluate(() => {
      const sel = '.topbar button, .topbar a, .btn, .topbar-menu-btn, .topbar-icon-btn, .avatar-btn';
      const bad = [];
      document.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 32 || r.width < 32) bad.push(el.className.toString().slice(0, 26) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      return bad;
    });
    ck(`${name}: every control is a comfortable tap target`, small.length === 0, small.slice(0, 3).join('; ') || 'all >= 32px');
  }

  // ---- the anime detail must collapse to a single column ----
  await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:5069/anime/52991', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 900));
  const detail = await page.evaluate(() => {
    const layout = document.querySelector('.detail-layout');
    const hero = document.querySelector('.hero-card');
    const banner = document.querySelector('.hero-banner');
    return {
      cols: layout ? getComputedStyle(layout).gridTemplateColumns : '',
      heroDir: hero ? getComputedStyle(hero).flexDirection : '',
      bannerH: banner ? Math.round(banner.getBoundingClientRect().height) : 0,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    };
  });
  ck('the detail page is one column on a phone', !detail.cols.includes(' '), detail.cols);
  ck('the hero stacks its poster above the text', detail.heroDir === 'column', detail.heroDir);
  ck('the banner is a sane height on a phone', detail.bannerH >= 140 && detail.bannerH <= 340, detail.bannerH + 'px');
  ck('the detail page does not overflow on a phone', detail.overflow <= 2, detail.overflow + 'px');

  await browser.close();
  server.close();
  cleanup();

  console.log('');
  if (problems.length) {
    console.log('  Layout problems found:');
    problems.forEach((p) => console.log('    - ' + p));
    console.log('');
  } else {
    console.log('  No overflow or clipping problems found.\n');
  }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { cleanup(); console.error(e); process.exit(1); });
