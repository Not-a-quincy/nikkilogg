'use strict';
// The profile Overview is rendered on the server, so its shaping is testable
// without a browser and without a database.
const path = require('path');
const ejs = require('ejs');
const ov = require('../src/services/overview');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

// ---- watch time formatting ----
ck('under an hour reads in minutes', ov.formatWatchTime(45) === '45m', ov.formatWatchTime(45));
ck('hours read as h/m', ov.formatWatchTime(320) === '5h 20m', ov.formatWatchTime(320));
ck('whole hours drop the minutes', ov.formatWatchTime(300) === '5h', ov.formatWatchTime(300));
ck('two days reads in days', ov.formatWatchTime(2880) === '2.0 days', ov.formatWatchTime(2880));
ck('long spans round to whole days', ov.formatWatchTime(28800) === '20 days', ov.formatWatchTime(28800));
ck('zero is 0m', ov.formatWatchTime(0) === '0m');
ck('nonsense is 0m, not NaN', ov.formatWatchTime(null) === '0m' && ov.formatWatchTime('x') === '0m' && ov.formatWatchTime(-5) === '0m');

// ---- percentages ----
ck('percent is a whole number', ov.percent(1, 3) === 33, ov.percent(1, 3));
ck('percent is capped at 100', ov.percent(5, 2) === 100);
ck('percent of nothing is 0, not NaN', ov.percent(0, 0) === 0 && ov.percent(3, 0) === 0);

// ---- the shape built from a database row ----
function fakeQuery(rows, recent) {
  return async (sql) => (/COUNT\(\*\)/.test(sql) ? rows : (recent || []));
}

(async () => {
  const full = await ov.buildOverview(1, fakeQuery(
    [{ total: 299, watching: 8, completed: 223, on_hold: 8, dropped: 17, plan_to_watch: 43, episodes: 4120, minutes: 98880, scored: 240, mean_score: '7.85' }],
    [{ mal_id: 52991, title_en: 'Frieren', poster_image_url: '/p.jpg', status: 'completed', current_episode: 28, user_rating: 10 }]
  ));

  ck('total entries', full.total === 299, full.total);
  ck('episodes', full.episodes === 4120, full.episodes);
  ck('watch time is formatted (whole days past ten)', full.watchTime === '69 days', full.watchTime);
  ck('mean score is two decimals', full.meanScore === '7.85', full.meanScore);
  ck('the rated count is carried', full.scored === 240, full.scored);
  ck('it is not empty', full.isEmpty === false);
  ck('all five statuses are present', full.byStatus.length === 5, full.byStatus.map((s) => s.key).join(','));
  ck('statuses keep a stable order', full.byStatus.map((s) => s.key).join(',') === 'watching,completed,on-hold,dropped,plan-to-watch');
  ck('hyphenated statuses map to their columns', full.byStatus.find((s) => s.key === 'on-hold').count === 8 && full.byStatus.find((s) => s.key === 'plan-to-watch').count === 43);
  ck('counts are numbers, not strings', full.byStatus.every((s) => typeof s.count === 'number'));
  ck('percentages are computed', full.byStatus.find((s) => s.key === 'completed').percent === 75, full.byStatus.find((s) => s.key === 'completed').percent);
  ck('status counts add up to the total', full.byStatus.reduce((a, s) => a + s.count, 0) === 299);
  ck('recent entries are shaped', full.recent.length === 1 && full.recent[0].malId === 52991, full.recent.length + ' recent');
  ck('a recent entry has a readable status label', full.recent[0].statusLabel === 'Completed', full.recent[0].statusLabel);
  ck('a recent entry falls back for a missing title', (await ov.buildOverview(1, fakeQuery([{ total: 1 }], [{ mal_id: 1, title_jp: '夜' }]))).recent[0].title === '夜');

  // an empty list must not produce NaN or a wall of zeroes
  const empty = await ov.buildOverview(1, fakeQuery([{ total: 0, episodes: 0, minutes: 0, scored: 0, mean_score: null }], []));
  ck('an empty list is flagged', empty.isEmpty === true);
  ck('an empty list has no mean score', empty.meanScore === null, String(empty.meanScore));
  ck('an empty list reads 0m', empty.watchTime === '0m');
  ck('an empty list still has all five statuses', empty.byStatus.length === 5);
  ck('an empty list has no NaN percentages', empty.byStatus.every((s) => Number.isFinite(s.percent)));
  ck('a row-less result is tolerated', (await ov.buildOverview(1, fakeQuery([], []))).total === 0);

  // ---- the template renders the overview, and no longer has favourites ----
  const render = (locals) => ejs.renderFile(path.join(__dirname, '..', 'views', 'profile.ejs'), locals);

  const html = await render({ overview: full, currentUser: { id: 1, display_name: 'V', is_admin: false, profile_pic: '/d.png' }, isLoggedIn: true });
  ck('the page renders', html.includes('overview-section'));
  ck('the Overview is no longer a bare placeholder', !/<p>Overview<\/p>/.test(html));
  ck('it shows the totals', html.includes('>299<') && html.includes('entries'));
  ck('it shows the episode count', html.includes('>4120<'));
  ck('it shows the watch time', html.includes('69 days'));
  ck('it shows the mean score', html.includes('7.85'));
  ck('it shows the status breakdown', html.includes('Plan to watch') && html.includes('Completed'));
  ck('it shows recently updated titles', html.includes('Frieren'));
  ck('recent entries link to the info page', /href="\/anime\/52991"/.test(html));
  ck('the Favourites tab is gone', !/Favorites<\/li>/.test(html) && !html.includes('favorites-section'), 'no favourites');
  ck('the Top Tracks section survives', html.includes('top-tracks-section') && html.includes('favorite-tracks-list'));

  const emptyHtml = await render({ overview: empty, currentUser: { id: 1, display_name: 'V' }, isLoggedIn: true });
  ck('an empty list gets a friendly nudge, not zeroes', emptyHtml.includes('Nothing logged yet') && !emptyHtml.includes('>NaN<'));

  const brokenHtml = await render({ overview: null, currentUser: { id: 1, display_name: 'V' }, isLoggedIn: true });
  ck('a failed overview still renders the page', brokenHtml.includes('could not be loaded'));
  ck('a failed overview shows no NaN', !brokenHtml.includes('NaN'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
