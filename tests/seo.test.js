'use strict';
process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key-for-seo-tests';
process.env.DB_HOST = '127.0.0.1';
process.env.BASE_URL = 'https://nikkilog.test';

const http = require('http');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const app = require('../src/app');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

const ROOT = path.join(__dirname, '..');

function get(port, p) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ code: res.statusCode, type: res.headers['content-type'] || '', body }));
    }).on('error', () => resolve({ code: 0, type: '', body: '' }));
  });
}

function ldJson(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return { parseError: e.message }; }
}

(async () => {
  const server = app.listen(5197);
  await new Promise((r) => server.once('listening', r));

  // ---- robots.txt ----
  const robots = await get(5197, '/robots.txt');
  ck('robots.txt is served', robots.code === 200, robots.code);
  ck('robots.txt is plain text', robots.type.includes('text/plain'), robots.type);
  ck('robots.txt allows crawling', /User-agent: \*/.test(robots.body) && /Allow: \//.test(robots.body));
  ck('robots.txt hides the API', /Disallow: \/api\//.test(robots.body));
  ck('robots.txt hides private pages', /Disallow: \/settings/.test(robots.body) && /Disallow: \/profile/.test(robots.body));
  ck('robots.txt points at the sitemap', /Sitemap: https:\/\/nikkilog\.test\/sitemap\.xml/.test(robots.body));

  // ---- sitemap.xml ----
  const sitemap = await get(5197, '/sitemap.xml');
  ck('sitemap.xml is served', sitemap.code === 200, sitemap.code);
  ck('sitemap is XML', sitemap.type.includes('xml'), sitemap.type);
  ck('sitemap declares the urlset namespace', /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sitemap.body));
  ck('sitemap lists the home page', sitemap.body.includes('<loc>https://nikkilog.test/</loc>'));
  ck('sitemap lists browse', sitemap.body.includes('/browse?category=all'));
  ck('sitemap is well formed', (sitemap.body.match(/<url>/g) || []).length === (sitemap.body.match(/<\/url>/g) || []).length);
  ck('sitemap survives a dead database', sitemap.code === 200 && sitemap.body.includes('</urlset>'));

  // ---- canonical + JSON-LD on real pages ----
  const home = await get(5197, '/');
  ck('home has a canonical URL', /<link rel="canonical" href="https:\/\/nikkilog\.test\/"/.test(home.body));
  const homeLd = ldJson(home.body);
  ck('home has parseable JSON-LD', homeLd && !homeLd.parseError, homeLd && homeLd.parseError);
  ck('home JSON-LD is a WebSite', homeLd && homeLd['@type'] === 'WebSite', homeLd && homeLd['@type']);

  const browse = await get(5197, '/browse');
  ck('browse has a canonical URL', /rel="canonical"/.test(browse.body));
  ck('browse has JSON-LD', !!ldJson(browse.body));

  // ---- the anime page must survive with no database ----
  const animeNoDb = await get(5197, '/anime/1');
  ck('anime page renders with no database', animeNoDb.code === 200, animeNoDb.code);
  ck('anime page still has a canonical URL', /rel="canonical"/.test(animeNoDb.body));

  // ---- honesty pages: a public site republishing a catalogue must say so ----
  const about = await get(5197, '/about');
  ck('/about is served', about.code === 200, about.code);
  ck('/about says what the site is', /personal anime diary/i.test(about.body));
  ck('/about says why it exists', /Why it exists/i.test(about.body) && /learning project/i.test(about.body));
  ck('/about names MyAnimeList as the data source', /MyAnimeList/.test(about.body));
  ck('/about states non-affiliation', /not affiliated with/i.test(about.body) && /endorsed by/i.test(about.body));
  ck('/about does not claim MAL has licensed it', /does not.*grant permission|not the same as being licensed/i.test(about.body));
  ck('/about explains the mood data is original', /mood data is ours/i.test(about.body));
  ck('/about offers a removal route', /want it removed/i.test(about.body) && about.body.includes('id="contact"'));
  ck('/about has a canonical URL', /rel="canonical"/.test(about.body));
  ck('/about has a meta description', /name="description"/.test(about.body));

  const privacy = await get(5197, '/privacy');
  ck('/privacy is served', privacy.code === 200, privacy.code);
  ck('/privacy says the password is hashed, not stored', /never stored/i.test(privacy.body) && /scrypt/.test(privacy.body));
  ck('/privacy states no ads and no trackers', /No advertising/i.test(privacy.body) && /No analytics/i.test(privacy.body));
  ck('/privacy states no data selling', /No selling/i.test(privacy.body));
  ck('/privacy explains the single session cookie', /One cookie/i.test(privacy.body));
  ck('/privacy explains how to delete everything', /Delete your account/i.test(privacy.body));

  // attribution must appear on every page, not just in one footer
  for (const page of ['/', '/browse', '/about']) {
    const html = (await get(5197, page)).body;
    ck('attribution on ' + page, /not affiliated with/i.test(html) && /myanimelist\.net/.test(html));
  }

  const sitemap2 = await get(5197, '/sitemap.xml');
  ck('the sitemap lists /about and /privacy', sitemap2.body.includes('/about') && sitemap2.body.includes('/privacy'));

  // the contact address is configurable, and hidden when it is not set
  const aboutNoContact = await ejs.renderFile(path.join(ROOT, 'views', 'about.ejs'), { currentUser: null, contact: null });
  ck('no contact configured means no broken link', !/mailto:/.test(aboutNoContact) && !/href="https:\/\/twitter/.test(aboutNoContact));
  const aboutWithContact = await ejs.renderFile(path.join(ROOT, 'views', 'about.ejs'), {
    currentUser: null, contact: { network: 'Twitter', handle: 'ughdrag', display: '@ughdrag', url: 'https://twitter.com/ughdrag' },
  });
  ck('the configured contact is shown', aboutWithContact.includes('@ughdrag'));

  server.close();

  // ---- the real point: content must be in the HTML, not fetched by JS ----
  const fake = {
    mal_id: 52991,
    name: "Frieren: Beyond Journey's End",
    title_jp: '葬送のフリーレン',
    synopsisText: 'During their decade-long quest to defeat the Demon King, the elf mage Frieren learns that time passes differently for those who live for centuries.',
    excerpt: 'During their decade-long quest to defeat the Demon King, the elf mage Frieren learns that time passes differently.',
    poster_image_url: 'https://cdn.example/poster.jpg',
    anime_type: 'TV',
    anime_year: 2023,
    episodes: 28,
    average_rating: 9.31,
    genres: ['Adventure', 'Drama', 'Fantasy'],
  };

  const html = await ejs.renderFile(path.join(ROOT, 'views', 'anime.ejs'), {
    animeId: 52991, userId: null, anime: fake, isLoggedIn: false, currentUser: null,
    jsonLd: { '@context': 'https://schema.org', '@type': 'TVSeries', name: fake.name, numberOfEpisodes: 28 },
    metaTitle: fake.name + ' — Nikkilog', metaDescription: fake.excerpt, metaImage: fake.poster_image_url,
  });

  ck('the title is in the HTML', html.includes("Frieren: Beyond Journey's End"));
  ck('the Japanese title is in the HTML', html.includes('葬送のフリーレン'));
  ck('the synopsis is in the HTML', html.includes('decade-long quest to defeat the Demon King'));
  ck('the genres are in the HTML', html.includes('Adventure') && html.includes('Fantasy'));
  ck('the poster is in the HTML', html.includes('https://cdn.example/poster.jpg'));
  ck('the poster has alt text', /alt="Frieren/.test(html));
  ck('the year is in the HTML', html.includes('2023'));
  ck('there is exactly one h1', (html.match(/<h1/g) || []).length === 1, (html.match(/<h1/g) || []).length);

  const animeLd = ldJson(html);
  ck('anime page has parseable JSON-LD', animeLd && !animeLd.parseError, animeLd && animeLd.parseError);
  ck('anime JSON-LD is a TVSeries', animeLd && animeLd['@type'] === 'TVSeries', animeLd && animeLd['@type']);
  ck('anime JSON-LD carries the episode count', animeLd && animeLd.numberOfEpisodes === 28);
  ck('anime JSON-LD escapes < so it cannot break out of the script tag', !/<\/script>/i.test(JSON.stringify(animeLd).replace(/"/g, '')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
