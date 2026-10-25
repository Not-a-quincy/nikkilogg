'use strict';
process.env.SECRET_KEY = 'anime-check';
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { launch } = require('./helpers/browser');
const app = require('../src/app');

const { ROOT, OUTPUT } = require('./helpers/paths');
const OUT = OUTPUT;;
const ph = (t, c, w, h) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/><text x="${w / 2}" y="${h / 2}" fill="#ffffff" font-size="34" font-family="sans-serif" text-anchor="middle">${t}</text></svg>`);

const user = { id: 7, display_name: 'Vasanth', is_admin: true, is_early_user: true, profile_pic: '/default-profile.png', bg_image: '/default-bg.jpg' };

const ANIME = {
  mal_id: 52991, title: "Frieren: Beyond Journey's End", title_en: "Frieren: Beyond Journey's End",
  title_jp: '葬送のフリーレン', anime_type: 'TV', episodes: 28, status: 'Finished Airing',
  // exactly the column names from populate_anime_db.py — a key mismatch must fail here
  start_date: '2023-09-29', end_date: '2024-03-22',
  duration: '24 min per ep', anime_source: 'Manga', anime_rank: 1,
  rating: 'PG-13 - Teens 13 or older', season: 'fall', anime_year: 2023,
  average_rating: 9.31, popularity: 118, members: 1024331,
  synopsis: 'During their decade-long quest to defeat the Demon King, the elf mage Frieren and her companions learn that time passes differently for those who live for centuries. The adventure has ended, but life goes on for an elf mage just beginning to understand what it means to feel human.',
  poster_image_url: ph('Poster', '#1D90F3', 300, 450),
  kitsu_cover_image_url: ph('Cover', '#3a5a8a', 1200, 500),
  studios: [{ studio_name: 'Madhouse', mal_id: 11 }],
  producers: [{ producer_name: 'Aniplex', mal_id: 17 }],
  licensors: [{ licensor_name: 'Crunchyroll', mal_id: 1 }],
  genres: [{ genre_name: 'Adventure' }, { genre_name: 'Drama' }, { genre_name: 'Fantasy' }],
  themes: [{ theme_name: 'Time Travel' }, { theme_name: 'Magic' }],
  demographics: [{ demographics_name: 'Shounen' }],
};
const STATS = {
  score_counts: { 10: 120, 9: 340, 8: 260, 7: 90, 6: 30, 5: 10 },
  status_counts: { completed: 680, watching: 240, 'plan to watch': 150, dropped: 40 },
  all_scores: [10, 9, 9, 8, 9, 10, 8, 7],
};

function routeFor(url) {
  const u = url.replace('http://127.0.0.1:5091', '');
  if (/\/api\/anime-statistics\//.test(u)) return STATS;
  if (/\/api\/anime\/\d+\/relations/.test(u)) return { relations: [] };
  if (/\/api\/anime\/\d+\/characters\/full/.test(u)) return { characters: [] };
  if (/\/api\/anime\/\d+\/comments/.test(u)) return [];
  if (/\/api\/anime\/\d+/.test(u)) return ANIME;
  return {};
}

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const html = await ejs.renderFile(path.join(ROOT, 'views', 'anime.ejs'), { animeId: 52991, userId: 7, currentUser: user, isLoggedIn: true, anime: null });
  fs.writeFileSync(path.join(ROOT, 'public', '__pv_anime.html'), html);

  const server = app.listen(5091);
  await new Promise((r) => server.once('listening', r));
  const browser = await launch();
  if (!browser) { console.log('skipped — no browser available'); process.exit(0); }
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/')) {
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(routeFor(url)) });
    }
    if (url.includes('/api/news')) return req.abort();
    return req.continue();
  });
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5091/__pv_anime.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null);
  await new Promise((r) => setTimeout(r, 1200));

  const st = await page.evaluate(() => ({
    banner: getComputedStyle(document.querySelector('.hero-banner')).backgroundImage.slice(0, 20),
    title: document.querySelector('.title-text').textContent.trim(),
    studio: (document.getElementById('heroStudio') || {}).textContent,
    excerpt: (document.getElementById('heroExcerpt') || {}).textContent.slice(0, 30),
    badge: !document.getElementById('heroBadge').hidden,
    infoRows: document.querySelectorAll('.main-details .info-row').length,
    infoText: (document.querySelector('.main-details') || {}).textContent || '',
    scoreRows: document.querySelectorAll('#scoreBars .score-row').length,
    chips: document.querySelectorAll('#engageChips .engage-chip').length,
    layoutCols: getComputedStyle(document.querySelector('.detail-layout')).gridTemplateColumns,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
  }));

  ck('hero banner uses the cover image', st.banner.includes('url('), st.banner);
  ck('title rendered', st.title.startsWith('Frieren'), st.title.slice(0, 24));
  ck('studio in hero meta', st.studio === 'Madhouse', st.studio);
  ck('synopsis excerpt in hero', st.excerpt.length > 10, st.excerpt);
  ck('status badge shown', st.badge === true);
  // --- the banner carries a dark, blurred layer ---
  const banner = await page.evaluate(() => {
    const b = document.querySelector('.hero-banner');
    if (!b) return null;
    const before = getComputedStyle(b, '::before');
    const after = getComputedStyle(b, '::after');
    const badge = document.querySelector('.hero-badge');
    return {
      filter: before.filter || '',
      beforeZ: before.zIndex,
      beforeInset: before.inset || before.top,
      overlay: after.backgroundImage || '',
      afterZ: after.zIndex,
      badgeZ: badge ? getComputedStyle(badge).zIndex : null,
      overflow: getComputedStyle(b).overflow,
    };
  });
  ck('the banner exists', banner !== null);
  ck('the banner artwork is blurred', /blur\(/.test(banner.filter), banner.filter);
  ck('the blur layer sits behind the overlay', Number(banner.beforeZ) < Number(banner.afterZ), banner.beforeZ + ' < ' + banner.afterZ);
  ck('the banner has a dark layer over it', /gradient|rgba/.test(banner.overlay), banner.overlay.slice(0, 46));
  ck('the overlay stays inside the banner (no bleed)', banner.overflow === 'hidden', banner.overflow);
  ck('the badge stays above both layers', Number(banner.badgeZ) > Number(banner.afterZ), banner.badgeZ + ' > ' + banner.afterZ);
  ck('the blurred layer is oversized so the blur has no hard edge', /-/.test(String(banner.beforeInset)), String(banner.beforeInset));

  ck('Information Matrix populated', st.infoRows >= 14, st.infoRows + ' rows');
  ck('the Aired row renders from start_date/end_date', st.infoText.includes('Aired') && st.infoText.includes('2023-09-29'), (st.infoText.match(/Aired[^A-Za-z]*[^|]{0,26}/) || [])[0]);
  ck('the Source row renders from anime_source', st.infoText.includes('Source') && st.infoText.includes('Manga'));
  ck('no placeholder 0000-00-00 date is shown', !st.infoText.includes('0000-00-00'));
  ck('score distribution bars', st.scoreRows >= 5, st.scoreRows + ' bars');
  ck('viewer engagement chips', st.chips >= 3, st.chips + ' chips');
  ck('two-column body layout', /\d+px \d+px/.test(st.layoutCols), st.layoutCols);
  ck('no horizontal overflow', st.overflowX <= 1, st.overflowX + 'px');
  ck('no JS errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, 'anime-fixed.png'), fullPage: true });

  await browser.close();
  server.close();
  try { fs.unlinkSync(path.join(ROOT, 'public', '__pv_anime.html')); } catch (e) {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
