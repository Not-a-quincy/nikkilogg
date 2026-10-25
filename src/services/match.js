'use strict';

/**
 * Title matching for the browser extension.
 *
 * Streaming sites name things inconsistently — "Frieren: Beyond Journey's End",
 * "Frieren Beyond Journeys End", "Sousou no Frieren" — so we score rather than
 * compare. Kept dependency-free and pure so it can be tested directly.
 */

/** Lowercases and reduces punctuation/whitespace to single spaces. */
function normalise(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    // apostrophes are dropped rather than turned into a separator, so
    // "Journey's End" and "Journeys End" reduce to the same tokens
    .replace(/['\u2019\u02bc`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Strips trailing season/part markers that differ between sites. */
function stripSeason(value) {
  return normalise(value)
    .replace(/\b(season|part|cour)\s*\d+\b/g, '')
    .replace(/\b[ivx]{1,4}$/, '') // trailing roman numerals
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return stripSeason(value).split(' ').filter((t) => t.length > 1);
}

/**
 * 0..1 similarity between a query (from a streaming page) and a candidate title.
 */
function score(query, candidate) {
  const a = stripSeason(query);
  const b = stripSeason(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;

  // one fully contains the other (very common: "X" vs "X Season 2")
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.7 + 0.25 * (shorter / longer);
  }

  // token overlap, weighted so shared rare words count more than shared common ones
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const overlap = shared / Math.min(ta.size, tb.size);

  // a prefix match on the first token is a strong signal ("frieren ...")
  const first = [...ta][0];
  const bonus = tb.has(first) ? 0.1 : 0;

  return Math.min(1, overlap * 0.9 + bonus);
}

/**
 * Ranks candidates against a query and returns them best-first.
 * `candidates` is [{ title, title_en, title_jp, ... }].
 */
function rank(query, candidates, limit = 5) {
  const scored = (candidates || []).map((c) => {
    const best = Math.max(
      score(query, c.title_en),
      score(query, c.title),
      score(query, c.title_jp)
    );
    return { candidate: c, score: Number(best.toFixed(4)) };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, limit);
}

/** Anything at or above this is treated as a confident match. */
const CONFIDENT = 0.82;

module.exports = { normalise, stripSeason, tokens, score, rank, CONFIDENT };
