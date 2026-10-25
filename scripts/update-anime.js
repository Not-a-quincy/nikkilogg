#!/usr/bin/env node
'use strict';

/**
 * Add newly-aired anime to the catalogue.
 *
 *   npm run update-anime             show what is new, write nothing
 *   npm run update-anime:apply       insert it
 *   npm run update-anime:upcoming    include next season too
 *   npm run update-anime:year        BACKFILL the whole current year (all four seasons)
 *   npm run update-anime:check       is the metadata source reachable?
 *
 * IMPORTANT: plain `update-anime` only asks the API for the season currently
 * airing. In October 2026 that is Fall 2026, so anything that finished earlier in
 * 2026 is not in that answer and looks missing however often you re-run it. To
 * fill a gap, use `update-anime:year` (or --year 2025,2026) — that walks every
 * season of the year, which is what picks those titles up.
 *
 * Flags work too (--apply, --upcoming, --check, --season 2026/fall, --year 2026), but passing
 * them through `npm run` is awkward on Windows: PowerShell reads a leading `--`
 * as its decrement operator and refuses to parse the line. The aliases above
 * avoid that entirely. If you do need a flag on Windows, call node directly:
 *   node scripts/update-anime.js --season 2026/fall
 *
 * Metadata comes from the anime API configured by ANIME_API_BASE_URL, which
 * defaults to Tenrai (https://api.tenrai.org/v1). Jikan's public API was
 * discontinued on 1 October 2026, and Tenrai is its drop-in successor: same
 * paths, same response shape, same mal_id.
 *
 * The original populate_anime_db.py walks the API page by page from a resume
 * point, which is the wrong tool for "what aired since I last looked". This asks
 * for one season and inserts only the titles you do not already have.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envFile = fs.existsSync(path.join(root, '.env')) ? path.join(root, '.env') : path.join(root, 'login.env');
require('dotenv').config({ path: envFile });

const { pool, withTransaction, describeDbError } = require('../src/config/db');
const api = require('../src/services/animeApi');
const animeFetch = require('../src/services/animeFetch');
const updater = require('../src/services/animeUpdate');

/** "2026" or "2025,2026" or "2024-2026" -> [2025, 2026] */
function parseYears(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return [];
  const range = value.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const from = parseInt(range[1], 10);
    const to = parseInt(range[2], 10);
    const out = [];
    for (let y = from; y <= to && out.length < 30; y += 1) out.push(y);
    return out;
  }
  return value.split(',').map((v) => parseInt(v.trim(), 10)).filter((n) => Number.isInteger(n) && n > 1900 && n < 2200);
}

function parseArgs(argv) {
  const args = { apply: false, upcoming: false, season: '', years: [], limit: 0, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--check') args.check = true;
    else if (a === '--upcoming') args.upcoming = true;
    else if (a === '--season') args.season = String(argv[++i] || '');
    else if (a.startsWith('--season=')) args.season = a.slice(9);
    else if (a === '--year') args.years = parseYears(argv[++i]);
    else if (a.startsWith('--year=')) args.years = parseYears(a.slice(7));
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 0;
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice(8), 10) || 0;
  }
  return args;
}

const progress = (page, got, total) =>
  process.stdout.write(`\r  fetching from the API… page ${page}, ${total} titles so far   `);

async function collect(args) {
  // All the "which seasons" reasoning lives in animeFetch.js; this only reports.
  let seasonOpt = null;
  if (args.season) {
    const m = args.season.match(/^(\d{4})[\/-]([a-z]+)$/i);
    if (!m) throw new Error('--season must look like 2026/fall (winter, spring, summer, fall).');
    seasonOpt = { year: parseInt(m[1], 10), season: m[2].toLowerCase() };
  }

  if (seasonOpt) console.log(`\n  Season: ${seasonOpt.year} ${seasonOpt.season}`);
  else if (args.years.length) console.log(`\n  Year: ${args.years.join(', ')} — every season`);
  else console.log('\n  Season: now (currently airing)');

  const result = await animeFetch.fetchFor(
    { season: seasonOpt, years: args.years, upcoming: args.upcoming },
    {
      onPage: progress,
      onSeason: (year, season) => {
        process.stdout.write('\n');
        console.log(`  · ${year} ${season}`);
      },
    }
  );
  process.stdout.write('\n');

  // Say what actually came back, season by season. Silence here is what made a
  // missing season look like a broken script.
  if (result.breakdown && result.breakdown.length) {
    console.log('\n  Fetched:');
    for (const b of result.breakdown) {
      console.log(`    ${String(b.year)} ${String(b.season).padEnd(9)} ${String(b.count).padStart(4)} titles`);
    }
    console.log(`    ${'total'.padEnd(14)} ${String(result.fetched).padStart(4)} titles` +
      (result.duplicates ? `  (${result.duplicates} cross-season repeats removed)` : ''));
  }

  return result.items;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.check) {
    console.log('');
    const steps = await api.diagnose();
    for (const s of steps) {
      console.log('  ' + (s.ok ? 'ok  ' : 'FAIL') + '  ' + s.step.padEnd(9) + '  ' + s.detail);
    }
    console.log('');
    if (!steps.every((s) => s.ok)) {
      console.log('  The source is not reachable. Set ANIME_API_BASE_URL in .env to a');
      console.log('  different instance, or see DEPLOY.md.');
      console.log('');
      process.exitCode = 1;
    }
    return;
  }

  const raw = await collect(args);
  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  const rows = updater.usable(raw.map(updater.mapAnime));
  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    if (seen.has(r.mal_id)) continue;
    seen.add(r.mal_id);
    unique.push(r);
  }
  const limited = args.limit ? unique.slice(0, args.limit) : unique;

  console.log(`  Fetched      : ${raw.length} titles`);
  console.log(`  Usable       : ${limited.length}${unique.length !== limited.length ? ' (of ' + unique.length + ')' : ''}`);

  const conn = await pool.getConnection();
  try {
    const existing = await updater.existingMalIds(conn, limited.map((r) => r.mal_id));
    const fresh = limited.filter((r) => !existing.has(r.mal_id));

    console.log(`  Already have : ${existing.size}`);
    console.log(`  New          : ${fresh.length}`);

    if (fresh.length) {
      console.log('');
      fresh.slice(0, 25).forEach((r) => {
        const label = r.title_en || r.title || ('MAL #' + r.mal_id);
        const when = r.start_date ? '  ' + r.start_date : '';
        console.log(`    + ${label}${when}`);
      });
      if (fresh.length > 25) console.log(`    ...and ${fresh.length - 25} more`);
    }

    if (!fresh.length) {
      console.log('\n  Nothing to add — the catalogue is already current.\n');
      return;
    }

    if (!args.apply) {
      console.log('\n  This was a dry run. Nothing was written.');
      console.log('  To insert these ' + fresh.length + ' titles, run:');
      console.log('');
      console.log('      npm run update-anime:apply');
      console.log('');
      return;
    }

    // One transaction: either the whole season lands or none of it does.
    let links = 0;
    const byId = new Map(raw.map((i) => [Number(i.mal_id), i]));
    await withTransaction(async (tx) => {
      for (const row of fresh) {
        const id = await updater.insertAnime(tx, row);
        links += await updater.insertLinks(tx, id, byId.get(row.mal_id) || {});
      }
    });

    console.log(`\n  Added ${fresh.length} titles and ${links} genre/studio links.\n`);
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
      console.error('');
      console.error('  Could not reach the anime API at ' + api.baseUrl());
      console.error('  Reason: ' + (err.code ? err.code + ' — ' : '') + (err.message || 'no response'));
      console.error('');
      console.error('  Note: Jikan\'s public API (api.jikan.moe) was discontinued on');
      console.error('  1 October 2026. This project uses Tenrai instead, which speaks the');
      console.error('  same schema. If this instance is unreachable, point the app at');
      console.error('  another one by setting ANIME_API_BASE_URL in .env.');
      console.error('');
      console.error('  Diagnose it with:');
      console.error('');
      console.error('      npm run update-anime:check');
      console.error('');
    } else {
      console.error('\n  ' + (err && err.message ? err.message : err) + '\n');
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
