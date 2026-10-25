'use strict';

/**
 * Production staff for an anime (director, writer, composer…).
 *
 * This is separate from characters and voice actors, which the original
 * populate script fetched. Staff was never fetched at all, so there is no data
 * for it in the database.
 *
 * Rather than a bulk crawl over the whole catalogue — tens of thousands of
 * requests for data most pages never show — this fetches staff for an anime the
 * first time someone actually opens its page, stores it, and serves it from the
 * database after that.
 */

// How long to remember "this anime has no staff" before asking again.
const EMPTY_TTL_SECONDS = 6 * 60 * 60;

/** A Jikan v4 / Tenrai staff entry -> one row. Defensive about shape. */
function mapStaff(item) {
  if (!item || typeof item !== 'object') return null;

  const person = (item.person && typeof item.person === 'object') ? item.person : item;
  const personMalId = Number(person.mal_id);
  const name = String(person.name == null ? '' : person.name).trim();

  if (!Number.isInteger(personMalId) || personMalId <= 0 || !name) return null;

  const images = person.images || {};
  const jpg = images.jpg || {};
  const webp = images.webp || {};
  const imageUrl = String(webp.image_url || jpg.image_url || '').trim() || null;

  const positions = Array.isArray(item.positions)
    ? item.positions.filter(Boolean).join(', ')
    : String(item.positions || item.role || '').trim();

  return {
    person_mal_id: personMalId,
    person_name: name,
    person_url: String(person.url || '').trim() || null,
    image_url: imageUrl,
    positions: positions || null,
  };
}

/** Dedupes by person, merging their positions. */
function mapStaffList(list) {
  const byPerson = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const row = mapStaff(item);
    if (!row) continue;
    const existing = byPerson.get(row.person_mal_id);
    if (existing) {
      const merged = [existing.positions, row.positions].filter(Boolean).join(', ');
      existing.positions = Array.from(new Set(merged.split(/,\s*/).filter(Boolean))).join(', ');
      if (!existing.image_url && row.image_url) existing.image_url = row.image_url;
    } else {
      byPerson.set(row.person_mal_id, row);
    }
  }
  return Array.from(byPerson.values());
}

/**
 * Staff for one anime: from the database if we have them, otherwise fetched
 * once and stored.
 *
 * @param {number} animeDbId  internal id, for storing
 * @param {number} malId      the id the API wants
 * @param {object} deps       { query, fetchStaff, cache } — injected for testing
 */
async function getStaff(animeDbId, malId, deps) {
  const { query, fetchStaff, cache } = deps;

  const stored = await query(
    `SELECT person_mal_id, person_name, person_url, image_url, positions
       FROM anime_staff WHERE anime_id = ? ORDER BY id ASC`,
    [animeDbId]
  );
  if (stored && stored.length) return { staff: stored, source: 'database' };

  // Recently asked and the API had nothing: do not ask again on every view.
  const emptyKey = 'staff:empty:' + animeDbId;
  if (cache && cache.get(emptyKey)) return { staff: [], source: 'cache' };

  let rows = [];
  let source = 'api';
  try {
    rows = mapStaffList(await fetchStaff(malId));
  } catch (err) {
    // An unreachable API must not break the page — the section just stays empty.
    if (cache) cache.set(emptyKey, true, EMPTY_TTL_SECONDS);
    return { staff: [], source: 'unavailable', error: err };
  }

  if (!rows.length) {
    if (cache) cache.set(emptyKey, true, EMPTY_TTL_SECONDS);
    return { staff: [], source };
  }

  if (cache) cache.del(emptyKey);

  // INSERT IGNORE: a second request racing this one cannot create duplicates.
  for (const row of rows) {
    await query(
      `INSERT IGNORE INTO anime_staff
         (anime_id, person_mal_id, person_name, person_url, image_url, positions)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [animeDbId, row.person_mal_id, row.person_name, row.person_url, row.image_url, row.positions]
    );
  }

  return { staff: rows, source };
}

module.exports = { getStaff, mapStaff, mapStaffList, EMPTY_TTL_SECONDS };
