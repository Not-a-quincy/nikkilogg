'use strict';

const api = require('./animeApi');

/**
 * Deciding WHAT to fetch, kept apart from how to fetch it and how to store it.
 *
 *   animeApi.js    — the HTTP client: URLs, retries, paging, rate limits.
 *   animeFetch.js  — this file: which seasons to ask for, and de-duplicating them.
 *   animeUpdate.js — mapping an API record onto a database row.
 *   scripts/update-anime.js — the command you run.
 *
 * Why this file exists: the old updater only asked for `/seasons/now`, which is
 * the season currently airing. In October 2026 that is Fall 2026 — so every title
 * that finished in Winter, Spring or Summer 2026 was never requested at all, and
 * looked "missing" no matter how often you re-ran it. Fetching a whole year, one
 * season at a time, is the fix.
 */

const SEASONS = ['winter', 'spring', 'summer', 'fall'];

/** Anime seasons turn over in January, April, July and October. */
function seasonOf(date = new Date()) {
  const month = date.getMonth() + 1;
  const season = month <= 3 ? 'winter' : month <= 6 ? 'spring' : month <= 9 ? 'summer' : 'fall';
  return { year: date.getFullYear(), season };
}

function seasonsOfYear(year) {
  return SEASONS.map((season) => ({ year, season }));
}

/**
 * De-duplicate by mal_id.
 *
 * Not optional: a two-cour show is listed in both the season it started and the
 * one it ran into, so fetching four seasons of a year returns plenty of repeats.
 * Inserting those would be harmless but slow, and the counts would lie.
 */
function dedupe(items) {
  const seen = new Set();
  const out = [];
  let duplicates = 0;
  for (const item of items) {
    const id = item && item.mal_id;
    if (!id) continue;
    if (seen.has(id)) {
      duplicates += 1;
      continue;
    }
    seen.add(id);
    out.push(item);
  }
  return { items: out, duplicates };
}

/** One season. Thin, but it keeps callers from touching animeApi directly. */
async function fetchSeason(year, season, onPage) {
  return api.season(year, season, onPage);
}

/** Every season of one year, de-duplicated, with a per-season breakdown. */
async function fetchYear(year, { onPage, onSeason } = {}) {
  const collected = [];
  const breakdown = [];

  for (const { season } of seasonsOfYear(year)) {
    if (onSeason) onSeason(year, season);
    const items = await fetchSeason(year, season, onPage);
    collected.push(...items);
    breakdown.push({ year, season, count: items.length });
  }

  const { items, duplicates } = dedupe(collected);
  return { items, breakdown, fetched: collected.length, duplicates };
}

/** Several years in one run — for a real backfill. */
async function fetchYears(years, { onPage, onSeason } = {}) {
  const collected = [];
  const breakdown = [];

  for (const year of years) {
    const result = await fetchYear(year, { onPage, onSeason });
    collected.push(...result.items);
    breakdown.push(...result.breakdown);
  }

  const { items, duplicates } = dedupe(collected);
  return { items, breakdown, fetched: collected.length, duplicates };
}

/** What is airing right now. */
async function fetchNow(onPage) {
  const items = await api.seasonNow(onPage);
  return { items: dedupe(items).items, breakdown: [{ year: seasonOf().year, season: 'now', count: items.length }], fetched: items.length, duplicates: 0 };
}

/** Next season — announced titles that have not started. */
async function fetchUpcoming(onPage) {
  const items = await api.seasonUpcoming(onPage);
  return { items: dedupe(items).items, breakdown: [{ year: seasonOf().year, season: 'upcoming', count: items.length }], fetched: items.length, duplicates: 0 };
}

/**
 * One entry point for the CLI: read the flags, decide what that means, fetch it.
 *
 * @param {{years?: number[], season?: {year: number, season: string}, upcoming?: boolean}} options
 */
async function fetchFor(options = {}, { onPage, onSeason } = {}) {
  if (options.season) {
    const items = await fetchSeason(options.season.year, options.season.season, onPage);
    return {
      items: dedupe(items).items,
      breakdown: [{ year: options.season.year, season: options.season.season, count: items.length }],
      fetched: items.length,
      duplicates: 0,
    };
  }

  if (options.years && options.years.length) {
    const result = await fetchYears(options.years, { onPage, onSeason });
    if (options.upcoming) {
      const next = await fetchUpcoming(onPage);
      const merged = dedupe(result.items.concat(next.items));
      return {
        items: merged.items,
        breakdown: result.breakdown.concat(next.breakdown),
        fetched: result.fetched + next.fetched,
        duplicates: result.duplicates + merged.duplicates,
      };
    }
    return result;
  }

  const now = await fetchNow(onPage);
  if (!options.upcoming) return now;

  const next = await fetchUpcoming(onPage);
  const merged = dedupe(now.items.concat(next.items));
  return {
    items: merged.items,
    breakdown: now.breakdown.concat(next.breakdown),
    fetched: now.fetched + next.fetched,
    duplicates: merged.duplicates,
  };
}

module.exports = {
  SEASONS,
  seasonOf,
  seasonsOfYear,
  dedupe,
  fetchSeason,
  fetchYear,
  fetchYears,
  fetchNow,
  fetchUpcoming,
  fetchFor,
};
