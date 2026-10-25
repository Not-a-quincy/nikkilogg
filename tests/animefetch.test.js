'use strict';
// The bug this pins: the updater only asked the API for the season currently
// airing, so everything that finished earlier in the year was never requested and
// looked missing. A year fetch must ask for all four seasons.
const fs = require('fs');
const path = require('path');
const api = require('../src/services/animeApi');
const animeFetch = require('../src/services/animeFetch');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  // ---- which season is it ----
  ck('January is winter', animeFetch.seasonOf(new Date('2026-01-15')).season === 'winter');
  ck('March is still winter', animeFetch.seasonOf(new Date('2026-03-31')).season === 'winter');
  ck('April is spring', animeFetch.seasonOf(new Date('2026-04-01')).season === 'spring');
  ck('July is summer', animeFetch.seasonOf(new Date('2026-07-01')).season === 'summer');
  ck('October is fall', animeFetch.seasonOf(new Date('2026-10-25')).season === 'fall');
  ck('December is still fall', animeFetch.seasonOf(new Date('2026-12-31')).season === 'fall');
  ck('the year comes from the date', animeFetch.seasonOf(new Date('2026-10-25')).year === 2026);
  ck('a year has exactly four seasons', animeFetch.seasonsOfYear(2026).length === 4);
  ck('they are in order',
    animeFetch.seasonsOfYear(2026).map((s) => s.season).join(',') === 'winter,spring,summer,fall');

  // ---- de-duplication ----
  const d = animeFetch.dedupe([{ mal_id: 1 }, { mal_id: 2 }, { mal_id: 1 }, { mal_id: 3 }, { mal_id: 2 }]);
  ck('duplicates are removed', d.items.length === 3, d.items.map((i) => i.mal_id).join(','));
  ck('and counted', d.duplicates === 2, d.duplicates);
  ck('records with no mal_id are dropped', animeFetch.dedupe([{}, { mal_id: 5 }]).items.length === 1);
  ck('an empty list is fine', animeFetch.dedupe([]).items.length === 0);

  // ---- a year fetch asks for all four seasons ----
  const calls = [];
  const original = api.season;
  api.season = async (year, season) => { calls.push(`${year}/${season}`); return [{ mal_id: 1 }, { mal_id: 2 }]; };

  const yearResult = await animeFetch.fetchYear(2026);
  ck('fetching a year makes FOUR requests', calls.length === 4, calls.join(', '));
  ck('one per season of that year',
    calls.join(',') === '2026/winter,2026/spring,2026/summer,2026/fall', calls.join(', '));
  ck('it reports a per-season breakdown', yearResult.breakdown.length === 4);
  ck('cross-season repeats are collapsed', yearResult.items.length === 2, yearResult.items.length + ' unique');
  ck('the repeat count is reported', yearResult.duplicates === 6, yearResult.duplicates);

  // ---- several years ----
  calls.length = 0;
  const multi = await animeFetch.fetchYears([2025, 2026]);
  ck('two years make eight requests', calls.length === 8, calls.length);
  ck('both years are covered', calls.some((c) => c.startsWith('2025/')) && calls.some((c) => c.startsWith('2026/')));
  ck('the breakdown spans both years', multi.breakdown.length === 8);

  // ---- the default path is still just the current season ----
  calls.length = 0;
  api.seasonNow = async () => [{ mal_id: 9 }];
  api.seasonUpcoming = async () => [{ mal_id: 10 }];

  await animeFetch.fetchFor({});
  ck('with no flags it asks only for the current season', calls.length === 0, calls.length + ' season calls');

  await animeFetch.fetchFor({ upcoming: true });
  ck('with --upcoming it still asks for no specific season', calls.length === 0);

  // ---- the important one: --year must NOT go through seasonNow ----
  calls.length = 0;
  let usedNow = false;
  const realNow = api.seasonNow;
  api.seasonNow = async () => { usedNow = true; return []; };
  await animeFetch.fetchFor({ years: [2026] });
  ck('--year fetches four seasons', calls.length === 4, calls.join(', '));
  ck('--year does NOT fall back to the current season', usedNow === false);
  api.seasonNow = realNow;

  // ---- the CLI is wired to it ----
  const cli = read('scripts/update-anime.js');
  ck('the CLI uses the fetch layer', /animeFetch\.fetchFor/.test(cli));
  ck('the CLI accepts --year', /'--year'/.test(cli) && /startsWith\('--year='\)/.test(cli));
  ck('the CLI reports what it fetched', /Fetched:/.test(cli));
  ck('the CLI explains the season trap in its help',
    /only asks the API for the season currently/i.test(cli));
  ck('the fetch layer is its own file', fs.existsSync(path.join(ROOT, 'src/services/animeFetch.js')));

  api.season = original;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
