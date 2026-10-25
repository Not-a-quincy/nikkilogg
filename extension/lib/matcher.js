/**
 * Nikkilog matcher — works out "which show, which episode" from a streaming page.
 *
 * Deliberately generic. MAL-Sync hard-codes an adapter per site (100+ of them,
 * which is why it needs 170 contributors). Streaming domains change constantly,
 * so instead of a site list we parse what the page already tells us: its title,
 * its heading, and its URL. That works on sites nobody has written an adapter
 * for, including ones that appear next week.
 *
 * Pure functions, no DOM and no network, so it can be tested directly.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NikkilogMatcher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Words and tokens that belong to the site's chrome, never to the show name.
  const NOISE = [
    /\b(?:season|part|cour)\s*\d+\b/gi,
    /\bwatch\b/gi, /\bonline\b/gi, /\bfree\b/gi, /\bstream(?:ing)?\b/gi, /\bdownload\b/gi,
    /\benglish\b/gi, /\beng(?:lish)?\s*sub(?:bed|s)?\b/gi, /\bsubbed?\b/gi, /\bdubbed?\b/gi,
    /\bsub\b/gi, /\bdub\b/gi, /\braw\b/gi, /\bhindi\b/gi, /\btamil\b/gi, /\btelugu\b/gi,
    /\bfull\s*episode\b/gi, /\bepisode\s*list\b/gi, /\bseason\s*list\b/gi,
    /\bhd\b/gi, /\bfhd\b/gi, /\buhd\b/gi, /\b\d{3,4}p\b/gi, /\b[48]k\b/gi,
    /\bx26[45]\b/gi, /\bhevc\b/gi, /\bavc\b/gi, /\baac\b/gi, /\bbluray\b/gi, /\bbd\b/gi,
    /\bweb[- ]?dl\b/gi, /\bmkv\b/gi, /\bmp4\b/gi, /\bmega\b/gi, /\bmulti[- ]?audio\b/gi,
  ];

  // Episode markers, most specific first. Ordered — the first hit wins.
  const EPISODE_PATTERNS = [
    { re: /第\s*(\d+(?:\.\d+)?)\s*[話话回]/i, confidence: 0.98 },
    { re: /\bepisode\s*[-\s]*(\d+(?:\.\d+)?)/i, confidence: 0.97 },
    { re: /\bep\.?\s*[-\s]*(\d+(?:\.\d+)?)\b/i, confidence: 0.95 },
    { re: /\bE(?:P)?\s*[-\s]*(\d{1,4}(?:\.\d+)?)\b/, confidence: 0.8 },
    { re: /[\[\(]\s*(\d{1,4}(?:\.\d+)?)\s*[\]\)]/, confidence: 0.6 },
    { re: /(?:^|[\s\-–—|/])(\d{1,4}(?:\.\d+)?)\s*(?:v\d)?\s*$/i, confidence: 0.55 },
  ];

  // Numbers that look like episodes but never are.
  const NOT_AN_EPISODE = /^(19|20)\d{2}$|^(480|720|1080|1440|2160|360|240)$/;

  function clean(text) {
    let out = String(text == null ? '' : text);
    for (const re of NOISE) out = out.replace(re, ' ');
    return out
      .replace(/[_]+/g, ' ')
      .replace(/\s*[-–—]\s*/g, ' - ')
      .replace(/[|•·»«]+/g, ' ')
      .replace(/[\[\(]\s*[\]\)]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Splits a page title into its parts. Site names are almost always the last
   * segment after a separator, so we prefer the first substantial one.
   */
  function splitTitle(rawTitle) {
    const parts = String(rawTitle || '')
      .split(/\s*[|•·»«]\s*|\s+[-–—]\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return '';
    // The show name is usually the longest early segment; the site name is short
    // and last. Prefer the first segment unless it is clearly a site name.
    if (parts.length > 1 && parts[0].length < 12 && parts[1].length > parts[0].length) {
      return parts[1];
    }
    return parts[0];
  }

  function findEpisode(text) {
    for (const { re, confidence } of EPISODE_PATTERNS) {
      const m = text.match(re);
      if (!m) continue;
      const value = parseFloat(m[1]);
      if (!Number.isFinite(value)) continue;
      if (NOT_AN_EPISODE.test(m[1])) continue;
      if (value <= 0 || value > 5000) continue;
      return { episode: value, confidence, matched: m[0] };
    }
    return { episode: null, confidence: 0, matched: '' };
  }

  /**
   * Parses one candidate string into { series, episode, confidence }.
   */
  function parseCandidate(text) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return { series: '', episode: null, confidence: 0 };

    const head = splitTitle(raw);
    let found = findEpisode(head);
    if (found.episode === null) found = findEpisode(clean(raw));
    if (found.episode === null) found = findEpisode(raw);

    let series = clean(head);
    if (found.matched) {
      // remove the episode marker from the series name
      series = series.replace(found.matched, ' ');
    }
    // drop a dangling separator left behind
    series = series.replace(/\s*[-–—:|]\s*$/, '').replace(/^\s*[-–—:|]\s*/, '').trim();

    let confidence = found.confidence;
    if (!series || series.length < 2) confidence = 0;
    if (series.length > 120) { series = series.slice(0, 120); confidence *= 0.8; }

    return { series, episode: found.episode, confidence: Number(confidence.toFixed(3)) };
  }

  /**
   * Best effort across everything the page offers: title, heading, og:title, URL.
   * Returns the highest-confidence parse, plus every attempt for debugging.
   */
  function parse(page) {
    const sources = [
      { text: page.title, weight: 1.0 },
      { text: page.heading, weight: 1.0 },
      { text: page.ogTitle, weight: 0.95 },
      { text: page.urlSlug, weight: 0.8 },
    ].filter((s) => s.text);

    const attempts = sources.map((s) => {
      const parsed = parseCandidate(s.text);
      return { ...parsed, source: s.text, confidence: Number((parsed.confidence * s.weight).toFixed(3)) };
    });

    attempts.sort((a, b) => b.confidence - a.confidence);
    const best = attempts[0] || { series: '', episode: null, confidence: 0, source: '' };

    return {
      series: best.series,
      episode: best.episode,
      confidence: best.confidence,
      source: best.source,
      attempts,
    };
  }

  /** Turns a URL into something title-like: /watch/frieren-episode-5 -> "frieren episode 5". */
  function slugFromUrl(url) {
    try {
      const path = String(url).split(/[?#]/)[0];
      const last = path.split('/').filter(Boolean).pop() || '';
      return decodeURIComponent(last)
        .replace(/\.(html?|php|aspx?)$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
    } catch (e) {
      return '';
    }
  }

  return { parse, parseCandidate, findEpisode, splitTitle, clean, slugFromUrl, NOISE, EPISODE_PATTERNS };
});
