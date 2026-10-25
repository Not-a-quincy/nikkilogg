'use strict';

const { query, withTransaction } = require('../config/db');

/**
 * The database half of a MyAnimeList import, kept out of the route so the CLI
 * script and the web page share exactly the same logic — and so the risky part
 * (matching and writing) has one implementation rather than two.
 */

const CHUNK = 1000;

function placeholders(n) {
  return new Array(n).fill('?').join(',');
}

/** Which of these MAL ids exist in the catalogue. */
async function resolveAnimeIds(malIds) {
  const map = new Map();
  for (let i = 0; i < malIds.length; i += CHUNK) {
    const chunk = malIds.slice(i, i + CHUNK);
    const rows = await query(
      `SELECT id, mal_id FROM anime WHERE mal_id IN (${placeholders(chunk.length)})`,
      chunk
    );
    for (const r of rows) map.set(Number(r.mal_id), r.id);
  }
  return map;
}

/** Which of these catalogue ids this person already tracks. */
async function existingTracking(userId, animeIds) {
  const found = new Set();
  for (let i = 0; i < animeIds.length; i += CHUNK) {
    const chunk = animeIds.slice(i, i + CHUNK);
    const rows = await query(
      `SELECT anime_id FROM user_anime_tracking
        WHERE user_id = ? AND anime_id IN (${placeholders(chunk.length)})`,
      [userId, ...chunk]
    );
    for (const r of rows) found.add(Number(r.anime_id));
  }
  return found;
}

/**
 * Works out what an import would do, without doing any of it.
 * Returns the same shape the web preview shows.
 */
async function buildPreview(userId, entries) {
  const idMap = await resolveAnimeIds(entries.map((e) => e.malId));

  const matched = [];
  const unmatched = [];
  for (const e of entries) {
    if (idMap.has(e.malId)) matched.push({ ...e, animeId: idMap.get(e.malId) });
    else unmatched.push(e);
  }

  const already = await existingTracking(userId, matched.map((e) => e.animeId));

  const byStatus = {};
  for (const e of matched) byStatus[e.status] = (byStatus[e.status] || 0) + 1;

  return {
    matched,
    unmatched,
    alreadyTracked: already.size,
    newEntries: matched.length - already.size,
    byStatus,
  };
}

/** Writes the entries. One transaction — a half-imported list is worse than none. */
async function applyImport(userId, entries) {
  let inserted = 0;
  let updated = 0;

  await withTransaction(async (conn) => {
    const animeIds = entries.map((e) => e.animeId);
    const existing = new Set();
    for (let i = 0; i < animeIds.length; i += CHUNK) {
      const chunk = animeIds.slice(i, i + CHUNK);
      const [rows] = await conn.execute(
        `SELECT anime_id FROM user_anime_tracking
          WHERE user_id = ? AND anime_id IN (${placeholders(chunk.length)})`,
        [userId, ...chunk]
      );
      for (const r of rows) existing.add(Number(r.anime_id));
    }

    for (const e of entries) {
      if (existing.has(e.animeId)) {
        await conn.execute(
          `UPDATE user_anime_tracking
              SET status = ?, current_episode = ?, user_rating = ?, updated_at = UTC_TIMESTAMP()
            WHERE user_id = ? AND anime_id = ?`,
          [e.status, e.episodes, e.score, userId, e.animeId]
        );
        updated += 1;
      } else {
        await conn.execute(
          `INSERT INTO user_anime_tracking (user_id, anime_id, status, current_episode, user_rating)
           VALUES (?, ?, ?, ?, ?)`,
          [userId, e.animeId, e.status, e.episodes, e.score]
        );
        inserted += 1;
      }
    }
  });

  return { inserted, updated, imported: inserted + updated };
}

module.exports = { resolveAnimeIds, existingTracking, buildPreview, applyImport };
