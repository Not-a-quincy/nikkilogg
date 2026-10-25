#!/usr/bin/env node
'use strict';

/**
 * Add specific titles to the catalogue by their MyAnimeList id.
 *
 *   npm run add-anime 52991 20 30
 *   npm run add-anime "52991, 20, 30"
 *   npm run add-anime                      # then paste the ids when asked
 *
 * This is the companion to an import that skipped a few entries: the import
 * matches on mal_id, so a title that was never fetched into the catalogue cannot
 * land. Add it here, then run the import again.
 *
 * Plain numbers are fine to pass through npm on Windows. Only `--flags` are a
 * problem there (PowerShell reads a leading `--` as its decrement operator).
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const root = path.join(__dirname, '..');
const envFile = fs.existsSync(path.join(root, '.env')) ? path.join(root, '.env') : path.join(root, 'login.env');
require('dotenv').config({ path: envFile });

const { pool, withTransaction, describeDbError } = require('../src/config/db');
const api = require('../src/services/animeApi');
const updater = require('../src/services/animeUpdate');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  let ids = updater.parseIdList(process.argv.slice(2).join(' '));

  if (!ids.length) {
    console.log('');
    console.log('  Which titles? Paste MAL ids (from the anime\'s URL, or the');
    console.log('  "not in the catalogue" list an import prints).');
    console.log('');
    const answer = await ask('  ids: ');
    ids = updater.parseIdList(answer);
  }

  if (!ids.length) {
    console.log('\n  No usable ids given. Example:  npm run add-anime 52991 20\n');
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Looking up ${ids.length} title${ids.length === 1 ? '' : 's'} at ${api.baseUrl()}\n`);

  const conn = await pool.getConnection();
  try {
    const already = await updater.existingMalIds(conn, ids);
    const results = { added: [], present: [], missing: [], failed: [] };

    for (const id of ids) {
      if (already.has(id)) {
        results.present.push(id);
        console.log(`  = ${id}  already in the catalogue`);
        continue;
      }

      let item;
      try {
        item = await api.animeById(id);
      } catch (err) {
        if (err.statusCode === 404) {
          results.missing.push(id);
          console.log(`  x ${id}  no such title on MyAnimeList`);
        } else {
          results.failed.push(id);
          console.log(`  ! ${id}  could not fetch: ${err.message}`);
        }
        continue;
      }

      const row = updater.mapAnime(item || {});
      if (!row.mal_id) row.mal_id = id;
      if (!updater.usable([row]).length) {
        results.failed.push(id);
        console.log(`  ! ${id}  the response had no usable title`);
        continue;
      }

      try {
        await withTransaction(async (tx) => {
          const dbId = await updater.insertAnime(tx, row);
          await updater.insertLinks(tx, dbId, item || {});
        });
        results.added.push(id);
        console.log(`  + ${id}  added: ${row.title_en || row.title || row.title_jp}`);
      } catch (err) {
        // a race, or a duplicate key on mal_id
        if (/duplicate|ER_DUP_ENTRY/i.test(String(err.code || '') + String(err.message || ''))) {
          results.present.push(id);
          console.log(`  = ${id}  already in the catalogue`);
        } else {
          results.failed.push(id);
          console.log(`  ! ${id}  could not insert: ${err.message}`);
        }
      }
    }

    console.log('');
    console.log(`  Added ${results.added.length}, already present ${results.present.length}` +
      (results.missing.length ? `, not on MyAnimeList ${results.missing.length}` : '') +
      (results.failed.length ? `, failed ${results.failed.length}` : ''));
    if (results.added.length) {
      console.log('');
      console.log('  Now re-run the import to bring the tracking data across:');
      console.log('      npm run import-mal -- "path/to/animelist.xml" --email you@example.com');
    }
    console.log('');
  } finally {
    conn.release();
  }
}

main()
  .catch((err) => {
    if (err && (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR')) {
      const d = describeDbError(err);
      console.error('\n  Could not reach the database.');
      console.error('  ' + d.message);
      console.error('  ' + d.hint + '\n');
    } else if (err && /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|did not respond in time/i.test(String(err.code || '') + ' ' + String(err.message || ''))) {
      console.error('\n  Could not reach the anime API at ' + api.baseUrl());
      console.error('  Reason: ' + (err.code ? err.code + ' — ' : '') + (err.message || 'no response'));
      console.error('\n  Check it with:  npm run update-anime:check\n');
    } else {
      console.error('\n  ' + (err && err.message ? err.message : err) + '\n');
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
