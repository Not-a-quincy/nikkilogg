'use strict';
process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key-for-mood-tests';
process.env.DB_HOST = '127.0.0.1';
process.env.BASE_URL = 'https://nikkilog.test';

const http = require('http');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const app = require('../src/app');
const moods = require('../src/services/moods');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

const get = (port, p) => new Promise((resolve) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    let body = ''; res.on('data', (d) => (body += d));
    res.on('end', () => resolve({ code: res.statusCode, type: res.headers['content-type'] || '', body }));
  }).on('error', () => resolve({ code: 0, type: '', body: '' }));
});

const post = (port, p, payload) => new Promise((resolve) => {
  const data = JSON.stringify(payload || {});
  const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    (res) => { let body = ''; res.on('data', (d) => (body += d)); res.on('end', () => resolve({ code: res.statusCode, body })); });
  req.on('error', () => resolve({ code: 0, body: '' }));
  req.write(data); req.end();
});

function ldJson(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return { parseError: e.message }; }
}

(async () => {
  // ---- the vocabulary ----
  ck('there is a mood vocabulary', Array.isArray(moods.MOODS) && moods.MOODS.length >= 10, moods.MOODS.length + ' moods');
  const slugs = moods.MOODS.map((m) => m.slug);
  ck('mood slugs are unique', new Set(slugs).size === slugs.length);
  ck('every mood has a label and a blurb', moods.MOODS.every((m) => m.label && m.blurb));
  ck('slugs are URL-safe', slugs.every((s) => /^[a-z]+$/.test(s)), slugs.slice(0, 3).join(','));
  ck('the vocabulary matches the app\'s existing moods', slugs.includes('calm') && slugs.includes('emotional') && slugs.includes('nostalgic'));
  ck('isValid accepts a real mood', moods.isValid('calm') === true);
  ck('isValid rejects nonsense', moods.isValid('purple') === false && moods.isValid('') === false && moods.isValid(null) === false);
  ck('get returns the mood record', moods.get('calm').label === 'Calm');
  ck('get is case-insensitive', moods.get('CALM').slug === 'calm');

  const server = app.listen(5196);
  await new Promise((r) => server.once('listening', r));

  // ---- the API ----
  const vocab = await get(5196, '/api/mood');
  ck('GET /api/mood returns the vocabulary', vocab.code === 200 && JSON.parse(vocab.body).moods.length === moods.MOODS.length, vocab.code);

  const one = await get(5196, '/api/mood/52991');
  ck('GET /api/mood/:id returns a shape', one.code === 200, one.code);
  const shape = JSON.parse(one.body);
  ck('the shape has total, distribution and mine', 'total' in shape && Array.isArray(shape.distribution) && 'mine' in shape);

  const anonVote = await post(5196, '/api/mood/vote', { mal_id: 52991, mood: 'calm' });
  ck('voting requires a login', anonVote.code === 401, anonVote.code);

  const badVote = await post(5196, '/api/mood/vote', { mal_id: 'x', mood: 'calm' });
  ck('voting with no anime id is rejected', badVote.code === 401 || badVote.code === 400, badVote.code);

  // ---- the mood pages: the SEO asset ----
  for (const slug of ['calm', 'emotional']) {
    const page = await get(5196, '/mood/' + slug);
    ck('/mood/' + slug + ' is served', page.code === 200, page.code);
    const mood = moods.get(slug);
    ck('/mood/' + slug + ' names the mood in the h1', page.body.includes('<h1') && page.body.includes(mood.label + ' anime'));
    const ld = ldJson(page.body);
    ck('/mood/' + slug + ' has parseable JSON-LD', ld && !ld.parseError, ld && ld.parseError);
    ck('/mood/' + slug + ' JSON-LD is a CollectionPage', ld && ld['@type'] === 'CollectionPage', ld && ld['@type']);
    ck('/mood/' + slug + ' has a canonical URL', page.body.includes('rel="canonical"'));
    ck('/mood/' + slug + ' links to the other moods', page.body.includes('/mood/nostalgic'));
  }

  const missing = await get(5196, '/mood/purple');
  ck('an unknown mood is a 404, not a crash', missing.code === 404, missing.code);

  // ---- the sitemap advertises them ----
  const sitemap = await get(5196, '/sitemap.xml');
  ck('the sitemap lists the mood pages', sitemap.body.includes('/mood/calm') && sitemap.body.includes('/mood/nostalgic'));
  ck('the sitemap gives mood pages high priority', /<loc>https:\/\/nikkilog\.test\/mood\/calm<\/loc><changefreq>daily<\/changefreq><priority>0\.9<\/priority>/.test(sitemap.body));

  // ---- the seeding flow ----
  const seedPage = await get(5196, '/mood-seed');
  ck('/mood-seed redirects a logged-out visitor', seedPage.code === 302, seedPage.code);

  const seedApi = await get(5196, '/api/mood/queue');
  ck('the queue API returns 401, not a redirect', seedApi.code === 401, seedApi.code);
  ck('the 401 is JSON, not HTML', seedApi.type.includes('json') || seedApi.body.includes('error'), seedApi.type);

  server.close();

  // the seeding page renders for a logged-in owner
  const seedHtml = await ejs.renderFile(path.join(__dirname, '..', 'views', 'mood_seed.ejs'), {
    currentUser: { id: 1, display_name: 'Tester', is_admin: true, profile_pic: '/default-profile.png' },
    isLoggedIn: true,
  });
  ck('the seeding page renders', seedHtml.includes('How did these feel?'));
  ck('the seeding page loads its script', seedHtml.includes('/js/seed.js'));
  ck('the seeding page is noindex', seedHtml.includes('name="robots" content="noindex"'));

  const seedJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'seed.js'), 'utf8');
  ck('the seeding script is syntactically valid', (() => {
    try { new (require('vm').Script)(seedJs); return true; } catch (e) { return false; }
  })());
  ck('the seeding script supports keyboard shortcuts', /keydown/.test(seedJs) && /parseInt\(e\.key/.test(seedJs));

  // ---- the page renders a real list when there are votes ----
  const fakeList = [
    { mal_id: 52991, title: "Frieren: Beyond Journey's End", poster: 'https://cdn.example/f.jpg', rating: 9.31, year: 2023, episodes: 28, votes: 12 },
    { mal_id: 1, title: 'Mushishi', poster: 'https://cdn.example/m.jpg', rating: 8.7, year: 2005, episodes: 26, votes: 4 },
  ];
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'mood.ejs'), {
    mood: moods.get('calm'), moods: moods.MOODS, list: fakeList, currentUser: null, isLoggedIn: false,
    metaTitle: 'Calm anime — Nikkilog', metaDescription: 'calm',
    jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Calm anime' },
  });

  ck('the list titles are in the HTML', html.includes('Frieren') && html.includes('Mushishi'));
  ck('each title is a real link to its page', html.includes('href="/anime/52991"') && html.includes('href="/anime/1"'));
  ck('posters have alt text', /alt="Frieren/.test(html));
  ck('the vote count is shown', html.includes('12 people say calm'), (html.match(/\d+ people say calm/) || [])[0]);
  // This used to render without metaTitle, so the template threw every time and
  // the .catch reported a failure — invisible only because the process exited
  // before the promise settled. It is awaited now, and given the locals it needs.
  try {
    const pluralHtml = await ejs.renderFile(path.join(__dirname, '..', 'views', 'mood.ejs'), {
      mood: moods.get('calm'), moods: moods.MOODS,
      list: [
        { mal_id: 9, title: 'X', poster: '', rating: null, year: null, votes: 1 },
        { mal_id: 8, title: 'Y', poster: '', rating: null, year: null, votes: 3 },
      ],
      currentUser: null, isLoggedIn: false, jsonLd: null,
      metaTitle: 'Calm anime', metaDescription: 'Anime that feels calm.',
    });
    ck('a single vote is not pluralised', pluralHtml.includes('1 person says calm'), 'person says');
    ck('several votes are pluralised', pluralHtml.includes('3 people say calm'), 'people say');
  } catch (err) {
    ck('a single vote is not pluralised', false, 'render threw: ' + err.message);
  }


  // ---------------------------------------------------------------------------
  // Up to four moods per title, and a share measured against people.
  // ---------------------------------------------------------------------------
// A stand-in for the two tables this touches.
function fakeDb(opts) {
  const votes = new Set((opts && opts.votes) || []);   // "user:anime:mood"
  const state = { deletes: 0, inserts: 0, insertSql: '' };
  return {
    votes, state,
    deps: {
      query: async (sql, params) => {
        if (/FROM anime WHERE mal_id/.test(sql)) return opts && opts.noAnime ? [] : [{ id: 7 }];
        if (/SELECT id FROM mood_votes/.test(sql)) {
          const key = params[0] + ':7:' + params[2];
          return votes.has(key) ? [{ id: 99 }] : [];
        }
        if (/GROUP BY mood/.test(sql)) {
          const counts = {};
          for (const k of votes) { const m = k.split(':')[2]; counts[m] = (counts[m] || 0) + 1; }
          return Object.entries(counts).map(([mood, c]) => ({ mood, c })).sort((a, b) => b.c - a.c);
        }
        if (/COUNT\(\*\) AS c/.test(sql)) {
          const mine = [...votes].filter((k) => k.startsWith(params[0] + ':7:'));
          return [{ c: mine.length }];
        }
        if (/COUNT\(DISTINCT user_id\)/.test(sql)) {
          const people = new Set([...votes].map((k) => k.split(':')[0]));
          return [{ v: people.size }];
        }
        if (/SELECT mood FROM mood_votes/.test(sql)) {
          const mine = [...votes].filter((k) => k.startsWith(params[0] + ':7:')).map((k) => k.split(':')[2]);
          return mine.map((m) => ({ mood: m }));
        }
        return [];
      },
      execute: async (sql, params) => {
        if (/^INSERT/i.test(sql)) { state.inserts += 1; state.insertSql = sql; votes.add(params[0] + ':7:' + params[2]); return []; }
        if (/^DELETE/i.test(sql)) { state.deletes += 1; return []; }
        return [];
      },
    },
  };
}


  // ---- the vocabulary is intact ----
  ck('the mood limit is four', moods.MAX_MOODS === 4, moods.MAX_MOODS);
  ck('there is a vocabulary to choose from', moods.MOODS.length >= 4, moods.MOODS.length + ' moods');
  ck('an unknown mood is rejected', moods.isValid('nonsense') === false);
  ck('a known mood is accepted', moods.isValid(moods.MOODS[0].slug) === true);

  // ---- adding, and toggling off ----
  const a = fakeDb();
  const added = await moods.vote(1, 100, 'calm', a.deps);
  ck('picking a mood adds it', added.action === 'added', added.action);
  ck('the row is written', a.state.inserts === 1, a.state.inserts + ' insert(s)');
  ck('the write is an INSERT IGNORE, so a double tap cannot duplicate', /INSERT IGNORE/i.test(a.state.insertSql), a.state.insertSql.slice(0, 40));

  const removed = await moods.vote(1, 100, 'calm', a.deps);
  ck('picking the same mood again removes it', removed.action === 'removed', removed.action);
  ck('a delete is issued', a.state.deletes === 1, a.state.deletes + ' delete(s)');

  // ---- up to four, then no more ----
  const b = fakeDb({ votes: ['1:7:calm', '1:7:happy', '1:7:thrilling', '1:7:emotional'] });
  let limitErr = null;
  try { await moods.vote(1, 100, 'dark', b.deps); } catch (e) { limitErr = e; }
  ck('a fifth mood is refused', limitErr !== null && limitErr.code === 'MOOD_LIMIT', limitErr && limitErr.code);
  ck('the refusal says what the limit is', /up to 4 moods/i.test(limitErr.message), limitErr.message.slice(0, 46));
  ck('nothing was written for the refused mood', b.state.inserts === 0, b.state.inserts + ' insert(s)');

  const c = fakeDb({ votes: ['1:7:calm', '1:7:happy', '1:7:thrilling'] });
  const third = await moods.vote(1, 100, 'emotional', c.deps);
  ck('a fourth mood is still allowed', third.action === 'added', third.action);

  // removing is always allowed, even at the limit
  const d = fakeDb({ votes: ['1:7:calm', '1:7:happy', '1:7:thrilling', '1:7:emotional'] });
  const drop = await moods.vote(1, 100, 'calm', d.deps);
  ck('a mood can be removed while at the limit', drop.action === 'removed', drop.action);

  // ---- the awkward inputs ----
  let badMood = null; try { await moods.vote(1, 100, 'not-a-mood', a.deps); } catch (e) { badMood = e; }
  ck('an unknown mood is refused', badMood !== null && /unknown mood/i.test(badMood.message), badMood && badMood.message);
  let badAnime = null; try { await moods.vote(1, 100, 'calm', fakeDb({ noAnime: true }).deps); } catch (e) { badAnime = e; }
  ck('an unknown anime is refused', badAnime !== null && /unknown anime/i.test(badAnime.message), badAnime && badAnime.message);

  // ---- the aggregate ----
  // Two people. One picked three moods, the other picked one.
  const agg = fakeDb({ votes: ['1:7:calm', '1:7:happy', '1:7:thrilling', '2:7:calm'] });
  const data = await moods.forAnime(100, 1, agg.deps);
  ck('my moods come back as a list', Array.isArray(data.mine), typeof data.mine);
  ck('all of my moods are returned', data.mine.length === 3, data.mine.join(','));
  ck('the vote total counts rows', data.total === 4, data.total);
  ck('the voter count counts people', data.voters === 2, data.voters);
  ck('a share is of PEOPLE, not of votes', data.distribution.find((d) => d.slug === 'calm').pct === 100,
    'calm is 2/2 = ' + data.distribution.find((d) => d.slug === 'calm').pct + '%');
  ck('shares never exceed 100%', data.distribution.every((d) => d.pct <= 100), data.distribution.map((d) => d.pct).join(','));
  ck('the top mood is the most picked', data.top.slug === 'calm', data.top.slug);
  ck('the remaining allowance is reported', data.remaining === 1, data.remaining);
  ck('the limit is reported to the page', data.max === 4, data.max);

  const full = await moods.forAnime(100, 1, fakeDb({ votes: ['1:7:calm', '1:7:happy', '1:7:thrilling', '1:7:emotional'] }).deps);
  ck('at the limit, nothing remains', full.remaining === 0, full.remaining);

  const none = await moods.forAnime(100, 1, fakeDb().deps);
  ck('no votes means an empty distribution', none.total === 0 && none.distribution.length === 0);
  ck('no votes means an empty list of mine', Array.isArray(none.mine) && none.mine.length === 0);
  ck('no votes still reports the limit', none.max === 4 && none.remaining === 4);
  ck('an unreachable database returns the empty shape', (await moods.forAnime(100, 1, { query: async () => { throw new Error('down'); } })).total === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
