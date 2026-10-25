'use strict';
// Two halves:
//  - the browser half proves the click helper behaves (navigates on a card
//    click, does NOT hijack the controls inside a card, works by keyboard)
//  - the static half proves every card renderer actually uses it, which is the
//    part a browser test cannot see because these suites inject their own HTML
process.env.SECRET_KEY = 'cards-check';
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const { launch } = require('./helpers/browser');
const app = require('../src/app');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

async function main() {
  // ---- static: the wiring ----
  const browse = read('public/js/browse.js');
  const index = read('public/js/index.js');
  const profile = read('public/js/profile.js');

  ck('browse.js makes its card clickable', /NikkilogCards\.makeClickable\(anime_card/.test(browse));
  ck('index.js makes the watch card clickable', /NikkilogCards\.makeClickable\(el, '\/anime\/'/.test(index));
  ck('index.js makes both home cards clickable', (index.match(/NikkilogCards\.makeClickable/g) || []).length === 2,
    (index.match(/NikkilogCards\.makeClickable/g) || []).length + ' call(s)');
  ck('profile.js makes the search card clickable', /NikkilogCards\.makeClickable\(searchResult/.test(profile));
  ck('profile.js makes the recommendation card clickable', /NikkilogCards\.makeClickable\(recCard/.test(profile));
  ck('profile.js makes the track card clickable, only when it has an anime',
    /NikkilogCards && theme\.anime_mal_id/.test(profile) && /makeClickable\(card, '\/anime\/' \+ theme\.anime_mal_id\)/.test(profile));

  ['views/browse.ejs', 'views/profile.ejs', 'views/index.ejs'].forEach((v) => {
    ck(v + ' loads cards.js', read(v).includes('/js/cards.js'));
  });

  ck('the browse poster no longer opens a new tab', !/middle_image_anchor\.target/.test(browse));

  // ---- browser: the behaviour ----
  const server = app.listen(5072);
  await new Promise((r) => server.once('listening', r));
  const browser = await launch();
  if (!browser) { console.log('skipped the browser half — no browser available'); server.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().includes('/api/') ? r.abort() : r.continue()));
  // The browse page rewrites its own query string from its filter state once it
  // loads, so reading location.search afterwards shows the rewritten URL. Catch
  // the URL at the moment of navigation instead.
  const navigations = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5072/browse', { waitUntil: 'domcontentloaded' });

  // a card with a control inside it, wired the way the app wires it
  // An empty page with one card of a sane size: the browse page's own grid
  // styling would otherwise stretch a bare card to full height and push it
  // off-screen, so a real click would never land on it.
  await page.evaluate(() => {
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    const card = document.createElement('div');
    card.className = 'anime_card';
    card.style.cssText = 'width:220px;height:300px;padding:12px;box-sizing:border-box;';
    card.innerHTML = '<div class="genre" style="padding:8px"><span class="genre-tag">Adventure</span></div>' +
      '<button class="favorite-btn" type="button" style="padding:8px">fav</button>';
    document.body.appendChild(card);
    window.NikkilogCards.makeClickable(card, '/browse?category=all&from=card');
    window.__btnClicks = 0;
    card.querySelector('.favorite-btn').addEventListener('click', () => { window.__btnClicks += 1; });
  });

  const attrs = await page.evaluate(() => {
    const card = document.querySelector('.anime_card');
    return {
      role: card.getAttribute('role'),
      tab: card.getAttribute('tabindex'),
      clickable: card.classList.contains('is-clickable'),
      href: card.dataset.cardHref,
      cursor: getComputedStyle(card).cursor,
    };
  });
  ck('the card is exposed as a link', attrs.role === 'link', attrs.role);
  ck('the card is keyboard reachable', attrs.tab === '0', attrs.tab);
  ck('the card is marked clickable', attrs.clickable === true);
  ck('it shows a pointer cursor', attrs.cursor === 'pointer', attrs.cursor);
  ck('it remembers where it goes', attrs.href === '/browse?category=all&from=card', attrs.href);

  // clicking the control inside must NOT navigate
  await page.click('.anime_card .favorite-btn');
  await new Promise((r) => setTimeout(r, 250));
  const afterButton = await page.evaluate(() => ({ path: location.search, clicks: window.__btnClicks }));
  ck('clicking a control inside the card does not navigate', !afterButton.path.includes('from=card'), afterButton.path || '(unchanged)');
  ck('the control still received its own click', afterButton.clicks === 1, afterButton.clicks);

  // clicking a plain part of the card must navigate
  navigations.length = 0;
  await page.click('.anime_card .genre-tag');
  await new Promise((r) => setTimeout(r, 900));
  const wentTo = navigations.find((u) => u.includes('from=card'));
  ck('clicking the card navigates to the info page', !!wentTo, wentTo || navigations.join(' | ') || '(no navigation)');

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
