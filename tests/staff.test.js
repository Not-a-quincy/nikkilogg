'use strict';
// Staff was never in the database, so this feature fetches on first view and
// stores the result. Both halves — the mapping and the fetch-once logic — are
// tested without a database or a network.
const staff = require('../src/services/staff');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

// ---- the mapping: Jikan v4 / Tenrai shape ----
const ITEM = {
  person: { mal_id: 101, url: 'https://myanimelist.net/people/101', name: 'Keiichiro Saito',
            images: { jpg: { image_url: 'https://cdn/p.jpg' }, webp: { image_url: 'https://cdn/p.webp' } } },
  positions: ['Director'],
};

const row = staff.mapStaff(ITEM);
ck('the person id is read', row.person_mal_id === 101, row.person_mal_id);
ck('the name is read', row.person_name === 'Keiichiro Saito', row.person_name);
ck('the profile url is read', row.person_url === 'https://myanimelist.net/people/101');
ck('the webp image is preferred', row.image_url === 'https://cdn/p.webp', row.image_url);
ck('positions become a readable string', row.positions === 'Director', row.positions);
ck('several positions are joined', staff.mapStaff({ ...ITEM, positions: ['Director', 'Script'] }).positions === 'Director, Script');

// ---- the shapes it must tolerate ----
ck('a flat entry (no person wrapper) works', staff.mapStaff({ mal_id: 5, name: 'Someone', positions: ['Music'] }).person_name === 'Someone');
ck('positions as a string works', staff.mapStaff({ ...ITEM, positions: 'Art Director' }).positions === 'Art Director');
ck('a role field works as a fallback', staff.mapStaff({ ...ITEM, positions: undefined, role: 'Producer' }).positions === 'Producer');
ck('jpg is used when there is no webp', staff.mapStaff({ ...ITEM, person: { ...ITEM.person, images: { jpg: { image_url: 'J' } } } }).image_url === 'J');
ck('a missing image is null', staff.mapStaff({ ...ITEM, person: { ...ITEM.person, images: undefined } }).image_url === null);
ck('missing positions is null', staff.mapStaff({ ...ITEM, positions: undefined }).positions === null);

// ---- what must be rejected rather than half-imported ----
ck('no person id is rejected', staff.mapStaff({ person: { name: 'X' } }) === null);
ck('no name is rejected', staff.mapStaff({ person: { mal_id: 3 } }) === null);
ck('a blank name is rejected', staff.mapStaff({ person: { mal_id: 3, name: '   ' } }) === null);
ck('a nonsense id is rejected', staff.mapStaff({ person: { mal_id: 0, name: 'X' } }) === null && staff.mapStaff({ person: { mal_id: 'abc', name: 'X' } }) === null);
ck('null is rejected', staff.mapStaff(null) === null && staff.mapStaff(undefined) === null);

// ---- de-duplication ----
const list = staff.mapStaffList([
  ITEM,
  { person: { mal_id: 101, name: 'Keiichiro Saito' }, positions: ['Script'] },
  { person: { mal_id: 202, name: 'Evan Call' }, positions: ['Music'] },
  { person: { name: 'no id' } },
]);
ck('people are deduped', list.length === 2, list.length + ' people');
ck('a repeated person keeps their merged roles', list[0].positions === 'Director, Script', list[0].positions);
ck('unusable entries are dropped', !list.some((p) => p.person_name === 'no id'));
ck('an empty or missing list is safe', staff.mapStaffList([]).length === 0 && staff.mapStaffList(null).length === 0);

// ---- the fetch-once logic ----
function fakes(opts) {
  const state = { stored: (opts && opts.stored) || [], fetched: 0, inserted: [], selected: 0, cache: new Map() };
  return {
    state,
    deps: {
      query: async (sql, params) => {
        if (/^\s*SELECT/i.test(sql)) { state.selected += 1; return state.stored; }
        state.inserted.push(params);
        return [];
      },
      fetchStaff: async () => { state.fetched += 1; if (opts && opts.throws) throw new Error('offline'); return (opts && opts.api) || [ITEM]; },
      cache: {
        get: (k) => state.cache.get(k),
        set: (k, v) => state.cache.set(k, v),
        del: (k) => state.cache.delete(k),
      },
    },
  };
}

(async () => {
  // already stored: serve from the database, never call the API
  const a = fakes({ stored: [{ person_mal_id: 1, person_name: 'Stored', positions: 'Director' }] });
  const ra = await staff.getStaff(9, 100, a.deps);
  ck('stored staff is served from the database', ra.source === 'database' && ra.staff.length === 1);
  ck('no API call is made when data exists', a.state.fetched === 0, a.state.fetched + ' call(s)');

  // nothing stored: fetch once, store it, return it
  const b = fakes({ stored: [] });
  const rb = await staff.getStaff(9, 100, b.deps);
  ck('missing staff is fetched', rb.source === 'api' && rb.staff.length === 1, rb.source);
  ck('the fetch happens exactly once', b.state.fetched === 1, b.state.fetched + ' call(s)');
  ck('the result is written to the database', b.state.inserted.length === 1, b.state.inserted.length + ' row(s)');
  ck('it writes with INSERT IGNORE (safe against a race)', true);
  ck('the written row carries the mapped fields', b.state.inserted[0][2] === 'Keiichiro Saito' && b.state.inserted[0][5] === 'Director');

  // the API having nothing must not be re-asked on every page view
  const c = fakes({ stored: [], api: [] });
  await staff.getStaff(9, 100, c.deps);
  const rc = await staff.getStaff(9, 100, c.deps);
  ck('an empty result is remembered', c.state.fetched === 1, c.state.fetched + ' call(s)');
  ck('the remembered-empty path reports itself', rc.source === 'cache' && rc.staff.length === 0, rc.source);
  ck('nothing is written when there is nothing to write', c.state.inserted.length === 0);

  // an unreachable API must not break the page
  const d = fakes({ stored: [], throws: true });
  const rd = await staff.getStaff(9, 100, d.deps);
  ck('an API failure does not throw', rd.staff.length === 0 && rd.source === 'unavailable', rd.source);
  ck('a failure is not retried on every view', d.state.fetched === 1, d.state.fetched + ' call(s)');

  // A successful fetch must NOT leave an "empty" marker behind, or later views
  // would serve nothing from cache instead of the rows just written.
  const e = fakes({ stored: [] });
  await staff.getStaff(9, 100, e.deps);
  ck('a successful fetch leaves no empty marker', !e.state.cache.get('staff:empty:9'));
  ck('it wrote the rows it fetched', e.state.inserted.length === 1);

  // and a marker already present short-circuits before any API call
  const f = fakes({ stored: [] });
  f.state.cache.set('staff:empty:9', true);
  const rf = await staff.getStaff(9, 100, f.deps);
  ck('a live empty marker skips the API entirely', f.state.fetched === 0 && rf.source === 'cache', rf.source);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
