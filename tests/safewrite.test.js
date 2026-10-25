'use strict';
// A promise about what a command does to a database is worth exactly as much as
// the test that enforces it. These assert, statically and functionally, that the
// catalogue commands cannot modify data that is already there.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const updater = require('../src/services/animeUpdate');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

// Finds real SQL write verbs, ignoring comments and prose.
//
// `DROP INDEX` / `DROP KEY` are deliberately allowed: they change a constraint,
// never a row. The migration that lets a person pick up to four moods has to
// widen a unique key, and that means dropping the old one.
// The migration used to be purely additive. It now writes to `users` in exactly
// one place: filling in a username for accounts that have none, because usernames
// became the login key and an account without one cannot be signed into. That
// fills a blank; it never overwrites a value. It is allowed here explicitly, and
// a test below asserts it is the ONLY write.
const ALLOWED_WRITES = [/UPDATE users SET username = \? WHERE id = \?/];

function dangerousStatements(source) {
  let code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    .replace(/DROP\s+(INDEX|KEY)\s+\w+/gi, '')       // constraint only, not data
    .replace(/ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, ''); // a column clause, not a statement
  for (const allowed of ALLOWED_WRITES) code = code.replace(allowed, '');
  const hits = [];
  for (const verb of ['UPDATE', 'DELETE', 'DROP', 'REPLACE', 'TRUNCATE']) {
    const re = new RegExp('\\b' + verb + '\\b', 'g');
    const n = (code.match(re) || []).length;
    if (n) hits.push(verb + '×' + n);
  }
  return hits;
}

// ---- 1. npm run update-anime must be insert-only ----
const script = read('scripts/update-anime.js');
const service = read('src/services/animeUpdate.js');
const updaterHits = dangerousStatements(script + '\n' + service);
ck('update-anime issues no UPDATE/DELETE/DROP/REPLACE', updaterHits.length === 0, updaterHits.join(', ') || 'none');
ck('update-anime does insert', /\bINSERT\b/.test(service));
ck('the master/link inserts use INSERT IGNORE (add-only)', (service.match(/INSERT IGNORE/g) || []).length === 2);
ck('it only inserts anime it does not already have', /filter\(\(r\) => !existing\.has\(r\.mal_id\)\)/.test(script));
ck('it looks up what exists before writing anything', script.indexOf('existingMalIds') < script.indexOf('insertAnime'));

// ---- 2. npm run migrate must only add structure ----
const schema = read('src/config/schema.js');
const schemaHits = dangerousStatements(schema).filter((h) => !/^UPDATE×1$/.test(h));
ck('migrate issues no UPDATE/DELETE/DROP', schemaHits.length === 0, schemaHits.join(', ') || 'none');
const tableCount = (schema.match(/CREATE TABLE/g) || []).length;
const guardCount = (schema.match(/if \(!\(await tableExists/g) || []).length;
ck('every table creation is guarded by an existence check', guardCount >= tableCount,
  tableCount + ' CREATE TABLE, ' + guardCount + ' existence guards');
ck('it checks for the users table too (and warns if absent)', /tableExists\('users'\)/.test(schema));
ck('every column addition is guarded', /if \(!\(await columnExists\('users', column\)\)\)/.test(schema));
ck('no column is ever dropped', !/DROP COLUMN/i.test(schema));
ck('no table is ever dropped', !/DROP TABLE/i.test(schema));

// The one write the migration is allowed to make, and why.
const backfillWrites = (schema.match(/UPDATE users SET username = \? WHERE id = \?/g) || []).length;
ck('the migration writes to users in exactly one place', backfillWrites === 1, backfillWrites + ' occurrence(s)');
ck('and it is a FILL, not an overwrite (it only selects blank usernames)',
  /WHERE username IS NULL OR username = ''/.test(schema));
ck('no other UPDATE survives in the migration',
  !/UPDATE\s+(?!users SET username)/i.test(schema.replace(/ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '')),
  'checked');
ck('dropping an INDEX is allowed (a constraint, not data)',
  dangerousStatements('ALTER TABLE t DROP INDEX some_index').length === 0);
ck('but dropping a COLUMN is still caught',
  dangerousStatements('ALTER TABLE t DROP COLUMN some_col').includes('DROP×1'),
  dangerousStatements('ALTER TABLE t DROP COLUMN some_col').join(','));
ck('and deleting rows is still caught', dangerousStatements('DELETE FROM t WHERE 1').includes('DELETE×1'));

// ---- 3. functionally: the lookup returns only what is there ----
(async () => {
  const seen = [];
  const fakeConn = {
    execute: async (sql, params) => {
      seen.push({ sql, params });
      // pretend the database has 3 of the 5 ids.
      // NOTE: existingMalIds passes the id list as the whole parameter array —
      // no leading user id — so slicing here would silently drop the first id.
      const have = new Set([1, 3, 5]);
      return [params.filter((id) => have.has(Number(id))).map((id) => ({ mal_id: id })), []];
    },
  };

  const found = await updater.existingMalIds(fakeConn, [1, 2, 3, 4, 5]);
  ck('it finds the ids that exist', found.size === 3, found.size + ' found');
  ck('it reports the right ones', [1, 3, 5].every((i) => found.has(i)) && !found.has(2));
  ck('the lookup is a SELECT', seen.every((s) => /^\s*SELECT/i.test(s.sql)), seen.map((s) => s.sql.split(' ')[0]).join(','));
  ck('the lookup writes nothing', !seen.some((s) => /\b(INSERT|UPDATE|DELETE)\b/i.test(s.sql)));

  // the filter that protects existing rows
  const candidates = [1, 2, 3, 4, 5].map((id) => ({ mal_id: id, title: 't' + id }));
  const fresh = candidates.filter((r) => !found.has(r.mal_id));
  ck('only the unknown ids survive the filter', fresh.length === 2 && fresh.every((r) => [2, 4].includes(r.mal_id)),
    fresh.map((r) => r.mal_id).join(','));

  // chunking must not change the answer
  const many = Array.from({ length: 1200 }, (_, i) => i + 1);
  seen.length = 0;
  await updater.existingMalIds(fakeConn, many);
  ck('a large list is chunked, not sent in one statement', seen.length >= 2, seen.length + ' statement(s)');
  ck('every chunk is still a SELECT', seen.every((s) => /^\s*SELECT/i.test(s.sql)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
