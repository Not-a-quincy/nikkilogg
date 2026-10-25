'use strict';

/**
 * Adding newly-aired anime to the catalogue.
 *
 * The original populate script is a bulk builder: it walks Jikan page by page
 * and keeps a resume point. Re-running it to pick up this season's shows is
 * slow and awkward. This does the narrow job instead — ask Jikan for the
 * current (and optionally upcoming) season, and insert only what is missing.
 *
 * `mapAnime` is pure: Jikan's shape in, your `anime` columns out. The column
 * names and order come from populate_anime_db.py, so this writes exactly the
 * same row that script would.
 */

// Exact column order from populate_anime_db.py.
const ANIME_COLUMNS = [
  'title_en', 'title_jp', 'synopsis', 'episodes', 'status',
  'start_date', 'poster_image_url', 'average_rating', 'end_date',
  'airing', 'duration', 'favorites', 'mal_id', 'members', 'popularity',
  'anime_rank', 'rating', 'scored_by', 'season', 'anime_source',
  'title', 'anime_type', 'url', 'anime_year',
];

// The master + link tables, exactly as populate_anime_db.py uses them.
const LINK_TABLES = [
  { key: 'genres', master: 'master_genre', masterId: 'unique_mal_id_for_genre', masterName: 'genre_name', link: 'anime_genre_link_table', linkCol: 'genre_id' },
  { key: 'explicit_genres', master: 'master_explicit_genre', masterId: 'unique_mal_id_for_explicit_genre', masterName: 'explicit_genre_name', link: 'explicit_genre_anime_link_table', linkCol: 'explicit_genre_id' },
  { key: 'themes', master: 'master_theme', masterId: 'unique_mal_id_for_theme', masterName: 'theme_name', link: 'anime_theme_link_table', linkCol: 'theme_id' },
  { key: 'demographics', master: 'master_demographics', masterId: 'unique_mal_id_for_demographics', masterName: 'demographics_name', link: 'anime_demographics_link_table', linkCol: 'demographics_id' },
  { key: 'studios', master: 'master_studio', masterId: 'unique_mal_id_for_studio', masterName: 'studio_name', link: 'anime_studio_link_table', linkCol: 'studio_id' },
  { key: 'producers', master: 'master_producer', masterId: 'unique_mal_id_for_producer', masterName: 'producer_name', link: 'anime_producer_link_table', linkCol: 'producer_id' },
  { key: 'licensors', master: 'master_licensor', masterId: 'unique_mal_id_for_licensor', masterName: 'licensor_name', link: 'anime_licensor_link_table', linkCol: 'licensor_id' },
];

function intOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function strOrNull(value) {
  const s = String(value == null ? '' : value).trim();
  return s ? s : null;
}

/** Jikan sends "2026-10-05T00:00:00+00:00"; the column is a DATE. */
function dateOnly(value) {
  const s = strOrNull(value);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  // Jikan uses 0000-00-00 for unknown; the column should hold NULL instead.
  if (m[1] === '0000' || m[2] === '00' || m[3] === '00') return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Prefer the largest image Jikan offers. */
function pickImage(images) {
  if (!images || typeof images !== 'object') return null;
  const webp = images.webp || {};
  const jpg = images.jpg || {};
  return strOrNull(webp.large_image_url)
    || strOrNull(jpg.large_image_url)
    || strOrNull(webp.image_url)
    || strOrNull(jpg.image_url);
}

/** A Jikan entry -> one row of the `anime` table. */
function mapAnime(item) {
  const titles = Array.isArray(item.titles) ? item.titles : [];
  const byType = (t) => {
    const hit = titles.find((x) => String(x.type || '').toLowerCase() === t);
    return hit ? strOrNull(hit.title) : null;
  };

  const aired = item.aired || {};

  return {
    title_en: strOrNull(item.title_english) || byType('english'),
    title_jp: strOrNull(item.title_japanese) || byType('japanese'),
    synopsis: strOrNull(item.synopsis),
    episodes: intOrNull(item.episodes),
    status: strOrNull(item.status),
    start_date: dateOnly(aired.from),
    poster_image_url: pickImage(item.images),
    average_rating: numOrNull(item.score),
    end_date: dateOnly(aired.to),
    airing: item.airing ? 1 : 0,
    duration: strOrNull(item.duration),
    favorites: intOrNull(item.favorites),
    mal_id: intOrNull(item.mal_id),
    members: intOrNull(item.members),
    popularity: intOrNull(item.popularity),
    anime_rank: intOrNull(item.rank),
    rating: strOrNull(item.rating),
    scored_by: intOrNull(item.scored_by),
    season: strOrNull(item.season),
    anime_source: strOrNull(item.source),
    title: strOrNull(item.title),
    anime_type: strOrNull(item.type),
    url: strOrNull(item.url),
    anime_year: intOrNull(item.year),
  };
}

/**
 * Pulls MAL ids out of whatever a person pastes: spaces, commas, newlines, or
 * a mix, optionally with a leading #. Dedupes and drops anything unusable.
 */
function parseIdList(text) {
  const seen = new Set();
  for (const token of String(text == null ? '' : text).split(/[\s,;|]+/)) {
    const cleaned = token.trim().replace(/^#/, '');
    if (!cleaned) continue;
    const n = Number(cleaned);
    if (!Number.isInteger(n) || n <= 0 || n > 1e9) continue;
    seen.add(n);
  }
  return Array.from(seen);
}

/** Rows worth inserting: has an id, and has some kind of title. */
function usable(rows) {
  return rows.filter((r) => r.mal_id && (r.title || r.title_en || r.title_jp));
}

async function existingMalIds(conn, malIds) {
  const found = new Set();
  const CHUNK = 500;
  for (let i = 0; i < malIds.length; i += CHUNK) {
    const chunk = malIds.slice(i, i + CHUNK);
    const ph = chunk.map(() => '?').join(',');
    const [rows] = await conn.execute(`SELECT mal_id FROM anime WHERE mal_id IN (${ph})`, chunk);
    for (const r of rows) found.add(Number(r.mal_id));
  }
  return found;
}

/** Inserts the anime row and returns its internal id. */
async function insertAnime(conn, row) {
  const cols = ANIME_COLUMNS.join(', ');
  const ph = ANIME_COLUMNS.map(() => '?').join(', ');
  const values = ANIME_COLUMNS.map((c) => row[c]);
  const [res] = await conn.execute(`INSERT INTO anime (${cols}) VALUES (${ph})`, values);
  return res.insertId;
}

/** Inserts the master entries and the links for one anime. */
async function insertLinks(conn, animeDbId, item) {
  let linked = 0;
  for (const cfg of LINK_TABLES) {
    const list = Array.isArray(item[cfg.key]) ? item[cfg.key] : [];
    for (const entry of list) {
      const malId = intOrNull(entry && entry.mal_id);
      const name = strOrNull(entry && entry.name);
      if (!malId || !name) continue;

      await conn.execute(
        `INSERT IGNORE INTO ${cfg.master} (${cfg.masterId}, ${cfg.masterName}) VALUES (?, ?)`,
        [malId, name]
      );
      await conn.execute(
        `INSERT IGNORE INTO ${cfg.link} (anime_id, ${cfg.linkCol}) VALUES (?, ?)`,
        [animeDbId, malId]
      );
      linked += 1;
    }
  }
  return linked;
}

module.exports = {
  ANIME_COLUMNS,
  parseIdList,
  LINK_TABLES,
  mapAnime,
  usable,
  existingMalIds,
  insertAnime,
  insertLinks,
  dateOnly,
  pickImage,
};
