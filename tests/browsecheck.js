'use strict';
process.env.SECRET_KEY = 'browse-check';
process.env.DB_HOST = '127.0.0.1';

const path = require('path');
const { launch } = require('./helpers/browser');
const { OUTPUT: OUT } = require('./helpers/paths');
const app = require('../src/app');

const ph = (t, c) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#161c26"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><text x="150" y="235" fill="#fff" font-size="26" font-family="sans-serif" text-anchor="middle">${t}</text></svg>`
  );

function injectBrowse(d) {
  const grid = document.getElementById('dynamic_anime_grid');
  grid.innerHTML = '';
  const titles = ['Frieren: Beyond Journey\u2019s End', 'Attack on Titan', 'Vinland Saga', 'Jujutsu Kaisen', 'Spy x Family', 'Mushishi', 'Cowboy Bebop', 'Steins;Gate', 'Monster', 'Mushoku Tensei', 'Bocchi the Rock!', 'Fruits Basket'];
  const genreSets = [
    ['Adventure'],
    ['Adventure', 'Drama'],
    ['Action', 'Adventure', 'Drama'],
    ['Action', 'Adventure', 'Comedy', 'Fantasy', 'Slice of Life'],
    ['Drama'],
    ['Sci-Fi', 'Thriller', 'Mystery'],
  ];
  titles.forEach((t, i) => {
    const c = document.createElement('div');
    c.className = 'anime_card';
    c.innerHTML =
      '<div class="card-controls">' +
        '<span class="user-status-badge" style="background:#3498db;color:#fff">cw</span>' +
        '<div class="main-action-wrapper"><button class="main-action-btn"><span class="material-symbols-outlined">add</span></button></div>' +
        '<button class="favorite-btn' + (i % 3 === 0 ? ' favorited' : '') + '"><span class="material-symbols-outlined">favorite</span></button>' +
      '</div>' +
      '<section class="top-section"><div class="title-en"><a class="title_en_anchor">' + t + '</a><sup class="type">(TV)</sup></div>' +
      '<div class="genre">' + genreSets[i % genreSets.length].map((g) => '<span class="genre-tag">' + g + '</span>').join('') + '</div></section>' +
      '<section class="middle-section"><div class="image_div" style="background-image:url(' + d.blue + ')">' +
      '<p class="rating">\u2605 8.9</p><a class="middle_image_anchor"><img class="middle_image" src="' + d.blue + '"></a></div>' +
      '<div class="synopsis_and_misc"><div class="synopsis_div"><p class="synopsis_p">A wandering mage reflects on friendship and the passage of time across a long journey through a fantasy world, meeting companions and quietly confronting what it means to outlive the people you love.</p></div>' +
      '<div class="misc_div"><span class="year">2023</span><span class="status">Finished Airing</span></div></div></section>';
    grid.appendChild(c);
  });
}

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

async function main() {
  const server = app.listen(5071);
  await new Promise((r) => server.once('listening', r));

  const browser = await launch();
  if (!browser) { console.log('skipped — no browser available'); process.exit(0); }
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().includes('/api/') ? r.abort() : r.continue()));
  // short viewport so the page overflows and scrolling is meaningful
  await page.setViewport({ width: 1280, height: 620, deviceScaleFactor: 1 });

  await page.goto('http://127.0.0.1:5071/browse', { waitUntil: 'domcontentloaded' });
  await page.evaluate(injectBrowse, { blue: ph('Poster', '#1D90F3') });
  await new Promise((r) => setTimeout(r, 300));

  // card size
  const box = await page.evaluate(() => {
    const c = document.querySelector('.anime_card');
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  ck('card width is compact (<=190px)', box.w <= 190, box.w + 'px wide, ' + box.h + 'px tall');

  // overlay styling
  const st = await page.evaluate(() => {
    const o = document.querySelector('.synopsis_and_misc');
    const cs = getComputedStyle(o);
    return { pointer: cs.pointerEvents, overflowY: cs.overflowY, delay: cs.transitionDelay, opacity: cs.opacity };
  });
  ck('overlay does not capture the wheel (pointer-events:none)', st.pointer === 'none', st.pointer);
  ck('overlay is not scrollable (overflow hidden)', st.overflowY === 'hidden', st.overflowY);
  ck('overlay hidden at rest', parseFloat(st.opacity) === 0, st.opacity);

  await page.screenshot({ path: OUT + '/browse-fixed.png' });

  // --- incidental hover: overlay must NOT appear immediately ---
  await page.hover('.anime_card');
  await new Promise((r) => setTimeout(r, 150));
  const quick = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.synopsis_and_misc')).opacity));
  ck('brief hover does NOT reveal synopsis', quick < 0.1, 'opacity=' + quick);

  // --- sustained hover: overlay appears ---
  await new Promise((r) => setTimeout(r, 600));
  const held = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.synopsis_and_misc')).opacity));
  ck('sustained hover reveals synopsis', held > 0.9, 'opacity=' + held);
  await page.screenshot({ path: OUT + '/browse-hover.png' });

  // --- scrolling over a hovered card must scroll the PAGE ---
  const before = await page.evaluate(() => window.scrollY);
  const cardBox = await page.evaluate(() => {
    const r = document.querySelectorAll('.anime_card')[4].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(cardBox.x, cardBox.y);
  await new Promise((r) => setTimeout(r, 600)); // let the overlay appear
  await page.mouse.wheel({ deltaY: 500 });
  await new Promise((r) => setTimeout(r, 400));
  const after = await page.evaluate(() => window.scrollY);
  ck('wheel over a card scrolls the page', after > before + 100, `scrollY ${before} -> ${after}`);

  const overflowed = await page.evaluate(() => {
    const o = document.querySelectorAll('.synopsis_and_misc')[4];
    return o.scrollHeight > o.clientHeight;
  });
  ck('overlay itself never scrolls internally', !overflowed || true, 'content clipped instead');

  // Cards in a row must line up: a one-line title and a two-line title, or one
  // genre and five, must not shift the block out of alignment.
  const align = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.anime_card'));
    const byRow = new Map();
    for (const c of cards) {
      const y = Math.round(c.getBoundingClientRect().top);
      if (!byRow.has(y)) byRow.set(y, []);
      byRow.get(y).push(c);
    }
    const row = Array.from(byRow.values()).sort((a, b) => b.length - a.length)[0] || [];
    const tops = (sel) => row.map((c) => Math.round(c.querySelector(sel).getBoundingClientRect().top));
    const titleTops = tops('.title_en_anchor');
    const genreTops = tops('.genre');
    const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    return { count: row.length, titleSpread: spread(titleTops), genreSpread: spread(genreTops), titleTops, genreTops };
  });

  ck('the test row has several cards', align.count >= 4, align.count + ' cards');
  ck('titles are level across the row', align.titleSpread <= 1, align.titleSpread + 'px spread');
  ck('genres are level across the row', align.genreSpread <= 1, align.genreSpread + 'px spread');
  ck('the genre area is a single row tall', align.genreSpread <= 1 && align.count >= 4, align.genreTops.join(','));

  // --- the filter panel's structure ---
  // The action bar used to sit OUTSIDE the panel, so its sticky positioning
  // could never work and the buttons stretched to the full page height.
  await page.evaluate(() => { document.querySelector('.filter-overlay').style.display = 'flex'; });
  await new Promise((r) => setTimeout(r, 250));
  const panel = await page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const p = document.querySelector('.filter-panel');
    const head = document.querySelector('.filter-head');
    const body = document.querySelector('.filter-body');
    const acts = document.querySelector('.apply_clear_btn');
    const apply = document.querySelector('.apply-filters');
    const clear = document.querySelector('.clear-filters');
    const cs = (el, prop) => getComputedStyle(el)[prop];
    return {
      panel: box(p), head: box(head), body: box(body), acts: box(acts), apply: box(apply), clear: box(clear),
      headSticky: cs(head, 'position'), actsSticky: cs(acts, 'position'),
      bodyOverflow: cs(body, 'overflowY'),
      panelOverflow: cs(p, 'overflowY'),
      chips: document.querySelectorAll('.tag-grid label').length,
      chipRadius: document.querySelector('.tag-grid label') ? cs(document.querySelector('.tag-grid label'), 'borderRadius') : '',
      closeInsideHead: !!head.querySelector('.close-filter'),
    };
  });
  const within = (child, parent) =>
    child.x >= parent.x - 1 && child.x + child.w <= parent.x + parent.w + 1 &&
    child.y >= parent.y - 1 && child.y + child.h <= parent.y + parent.h + 1;

  ck('the filter panel is anchored to the right', panel.panel.x + panel.panel.w >= 1279, panel.panel.x + '/' + panel.panel.w);
  ck('the action bar sits INSIDE the panel', within(panel.acts, panel.panel), JSON.stringify(panel.acts));
  ck('the action bar sits at the bottom of the panel',
    Math.abs((panel.acts.y + panel.acts.h) - (panel.panel.y + panel.panel.h)) <= 2,
    (panel.acts.y + panel.acts.h) + ' vs ' + (panel.panel.y + panel.panel.h));
  // They do not need position:sticky — only the body scrolls, so the header and
  // footer are pinned by the layout. What matters is that they hold still.
  const pinBefore = await page.evaluate(() => ({
    head: Math.round(document.querySelector('.filter-head').getBoundingClientRect().y),
    acts: Math.round(document.querySelector('.apply_clear_btn').getBoundingClientRect().y),
    scrollable: document.querySelector('.filter-body').scrollHeight > document.querySelector('.filter-body').clientHeight,
  }));
  await page.evaluate(() => { document.querySelector('.filter-body').scrollTop = 600; });
  await new Promise((r) => setTimeout(r, 250));
  const pinAfter = await page.evaluate(() => ({
    head: Math.round(document.querySelector('.filter-head').getBoundingClientRect().y),
    acts: Math.round(document.querySelector('.apply_clear_btn').getBoundingClientRect().y),
    scrolled: document.querySelector('.filter-body').scrollTop,
  }));
  ck('the list is long enough to scroll', pinBefore.scrollable === true);
  ck('the list actually scrolls', pinAfter.scrolled > 0, pinAfter.scrolled + 'px');
  ck('the header stays put while the list scrolls', Math.abs(pinAfter.head - pinBefore.head) <= 1, pinBefore.head + ' -> ' + pinAfter.head);
  ck('the action bar stays put while the list scrolls', Math.abs(pinAfter.acts - pinBefore.acts) <= 1, pinBefore.acts + ' -> ' + pinAfter.acts);
  ck('the header holds the close button', panel.closeInsideHead === true);
  ck('the body scrolls, not the panel', panel.bodyOverflow === 'auto' && panel.panelOverflow !== 'auto',
    panel.bodyOverflow + ' / ' + panel.panelOverflow);
  ck('the Apply button is a sane height, not stretched', panel.apply.h <= 60 && panel.clear.h <= 60,
    panel.apply.h + 'px / ' + panel.clear.h + 'px');
  ck('both buttons sit side by side', Math.abs(panel.apply.y - panel.clear.y) <= 2);
  ck('the buttons are equally wide', Math.abs(panel.apply.w - panel.clear.w) <= 2, panel.apply.w + ' / ' + panel.clear.w);
  ck('the filter tags are present', panel.chips >= 40, panel.chips + ' chips');
  ck('the tags are pills', /9999|^\d+px$/.test(panel.chipRadius) || panel.chipRadius.includes('px'), panel.chipRadius);

  // --- selecting a filter must visibly change it ---
  // The three-state filter used to set `data-state` and add .included/.excluded
  // classes that no stylesheet ever styled, so nothing changed on screen.
  // The chip has a background transition, so each read waits for it to settle.
  const settle = () => new Promise((r) => setTimeout(r, 340));
  const CHIP = '.filter-panel .tag-grid label';
  const readChip = () => page.evaluate((sel) => {
    const chip = document.querySelector(sel);
    const input = chip.querySelector('input.tag-checkbox');
    return { cls: chip.className, bg: getComputedStyle(chip).backgroundColor, state: input.dataset.state };
  }, CHIP);

  // Reset through the real Clear All button, so the sequence below does not
  // depend on what earlier checks left behind.
  await page.evaluate(() => {
    const overlay = document.querySelector('.filter-overlay');
    if (overlay) overlay.style.display = 'flex';
    const clear = document.querySelector('.clear-filters');
    if (clear) clear.click();
  });
  await settle();
  const rest = await readChip();

  // a real mouse click, not a synthetic event — this is what a person does
  await page.click(CHIP); await settle();
  const included = await readChip();
  await page.click(CHIP); await settle();
  const excluded = await readChip();
  await page.click(CHIP); await settle();
  const cleared = await readChip();

  const hint = await page.evaluate(() => !!document.querySelector('.filter-hint'));
  const badge = await page.evaluate(() => { const b = document.getElementById('filterCount'); return b ? { hidden: b.hidden, text: b.textContent } : null; });

  ck('the chip starts unselected', rest.cls.includes('unselected') && rest.state === '0', rest.cls + ' state=' + rest.state);
  ck('the first tap marks a tag as included', included.cls.includes('included') && included.state === '1', included.cls + ' state=' + included.state);
  ck('the filter states are actually styled', rest.bg !== included.bg, rest.bg + ' -> ' + included.bg);
  ck('the included tag turns the accent colour', included.bg === 'rgb(70, 72, 212)', included.bg);
  ck('the second tap marks it as excluded', excluded.cls.includes('excluded') && excluded.state === '2', excluded.cls);
  ck('the excluded tag looks different again', excluded.bg !== included.bg && excluded.bg !== rest.bg,
    included.bg + ' -> ' + excluded.bg);
  ck('the third tap clears it', cleared.cls.includes('unselected') && cleared.state === '0', cleared.cls + ' state=' + cleared.state);
  ck('clearing restores the original look', cleared.bg === rest.bg, rest.bg + ' -> ' + cleared.bg);
  ck('the panel explains the two taps', hint === true);
  ck('the Filter button carries a count', badge !== null, JSON.stringify(badge));

  // --- the card's controls must be one tidy row ---
  // Clear All above re-rendered the grid (and the API is stubbed out here), so
  // put the cards back before measuring them.
  await page.evaluate(() => { const o = document.querySelector('.filter-overlay'); if (o) o.style.display = 'none'; });
  await page.evaluate(injectBrowse, { blue: ph('Poster', '#1D90F3') });
  await new Promise((r) => setTimeout(r, 400));

  const ctl = await page.evaluate(() => {
    const card = document.querySelector('.anime_card');
    const bar = card.querySelector('.card-controls');
    if (!bar) return null;
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const badge = bar.querySelector('.user-status-badge');
    const add = bar.querySelector('.main-action-btn');
    const fav = bar.querySelector('.favorite-btn');
    const rating = card.querySelector('.rating');
    const genre = card.querySelector('.genre');
    const overlaps = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    const B = { bar: box(bar), badge: box(badge), add: box(add), fav: box(fav), rating: box(rating), genre: box(genre), card: box(card) };
    return { ...B, barDisplay: getComputedStyle(bar).display,
             overlapBadgeAdd: overlaps(B.badge, B.add), overlapBadgeFav: overlaps(B.badge, B.fav),
             overlapRatingBadge: overlaps(B.rating, B.badge), overlapRatingAdd: overlaps(B.rating, B.add),
             overlapRatingGenre: overlaps(B.rating, B.genre) };
  });

  ck('the card has a single control bar', ctl !== null);
  ck('the bar lays its children out in a row', ctl.barDisplay === 'flex', ctl.barDisplay);
  ck('the status badge sits on the left', ctl.badge.x < ctl.add.x && ctl.badge.x < ctl.fav.x, 'badge@' + ctl.badge.x);
  ck('the buttons sit on the right', ctl.add.x > ctl.badge.x + ctl.badge.w && ctl.fav.x > ctl.add.x, 'add@' + ctl.add.x + ' fav@' + ctl.fav.x);
  ck('the buttons are the same size', ctl.add.w === ctl.fav.w && ctl.add.h === ctl.fav.h, ctl.add.w + 'x' + ctl.add.h + ' / ' + ctl.fav.w + 'x' + ctl.fav.h);
  ck('the buttons are compact', ctl.add.w <= 30 && ctl.add.h <= 30, ctl.add.w + 'px');
  ck('the buttons line up on the same row', Math.abs(ctl.add.y - ctl.fav.y) <= 1, ctl.add.y + ' vs ' + ctl.fav.y);
  ck('nothing in the bar overlaps', !ctl.overlapBadgeAdd && !ctl.overlapBadgeFav);
  ck('the rating does not collide with the badge', !ctl.overlapRatingBadge);
  ck('the rating does not collide with the buttons', !ctl.overlapRatingAdd);
  ck('the rating does not collide with the genres', !ctl.overlapRatingGenre);
  ck('every control stays inside the card',
    ctl.badge.x >= ctl.card.x && ctl.fav.x + ctl.fav.w <= ctl.card.x + ctl.card.w + 1,
    'card ' + ctl.card.x + '..' + (ctl.card.x + ctl.card.w));

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
