'use strict';

const express = require('express');
const { query } = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { asyncHandler } = require('../services/util');

const router = express.Router();

function round(value, digits) {
  if (value == null || Number.isNaN(value)) return 0;
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

// ---------------------------------------------------------------------------
// POST /api/update-user-anime-tracking
// ---------------------------------------------------------------------------
router.post(
  '/update-user-anime-tracking',
  requireLogin,
  asyncHandler(async (req, res) => {
    if (!req.is('application/json')) {
      return res.status(400).json({ message: 'Request must be JSON' });
    }
    const data = req.body || {};
    const userId = req.user.id;

    let malId = data.mal_id;
    malId = Number(malId);
    if (!Number.isInteger(malId)) {
      return res.status(400).json({ message: 'Missing or invalid mal_id' });
    }

    const animeRows = await query('SELECT id FROM anime WHERE mal_id = ?', [malId]);
    if (!animeRows.length) {
      return res.status(404).json({ message: 'Anime not found.' });
    }
    const animeId = animeRows[0].id;

    const status = data.status;
    let currentEpisode = data.current_episode;
    if (currentEpisode === undefined || currentEpisode === null || currentEpisode === '') {
      currentEpisode = null;
    } else {
      const n = Number(currentEpisode);
      currentEpisode = Number.isFinite(n) ? Math.trunc(n) : null;
    }

    let userRating = data.user_rating;
    if (userRating !== undefined && userRating !== null && userRating !== '') {
      const f = Number(userRating);
      if (Number.isFinite(f)) {
        if (f < 0 || f > 10) {
          return res.status(400).json({ message: 'Score must be between 0 and 10.' });
        }
        userRating = f;
      } else {
        userRating = null;
      }
    } else {
      userRating = null;
    }

    const notes = data.notes;
    let mood = data.mood || '';
    if (!mood) mood = null;

    const existing = await query(
      'SELECT id FROM user_anime_tracking WHERE user_id = ? AND anime_id = ?',
      [userId, animeId]
    );

    if (existing.length) {
      const fields = [];
      const values = [];
      if (status !== undefined && status !== null) {
        fields.push('status = ?');
        values.push(status);
      }
      if (currentEpisode !== null) {
        fields.push('current_episode = ?');
        values.push(currentEpisode);
      }
      if (userRating !== null) {
        fields.push('user_rating = ?');
        values.push(userRating);
      }
      if (notes !== undefined && notes !== null) {
        fields.push('notes = ?');
        values.push(notes);
      }
      if (mood !== null) {
        fields.push('mood = ?');
        values.push(mood);
      }
      fields.push('updated_at = UTC_TIMESTAMP()');
      values.push(userId, animeId);
      await query(
        `UPDATE user_anime_tracking SET ${fields.join(', ')} WHERE user_id = ? AND anime_id = ?`,
        values
      );
      return res.status(200).json({ message: 'Tracking updated successfully.' });
    }

    const insertFields = ['user_id', 'anime_id', 'created_at', 'updated_at'];
    const insertValues = [userId, animeId];
    const placeholders = ['?', '?', 'UTC_TIMESTAMP()', 'UTC_TIMESTAMP()'];
    if (status !== undefined && status !== null) {
      insertFields.push('status');
      insertValues.push(status);
      placeholders.push('?');
    }
    if (currentEpisode !== null) {
      insertFields.push('current_episode');
      insertValues.push(currentEpisode);
      placeholders.push('?');
    }
    if (userRating !== null) {
      insertFields.push('user_rating');
      insertValues.push(userRating);
      placeholders.push('?');
    }
    if (notes !== undefined && notes !== null) {
      insertFields.push('notes');
      insertValues.push(notes);
      placeholders.push('?');
    }
    if (mood !== null) {
      insertFields.push('mood');
      insertValues.push(mood);
      placeholders.push('?');
    }
    await query(
      `INSERT INTO user_anime_tracking (${insertFields.join(', ')}) VALUES (${placeholders.join(', ')})`,
      insertValues
    );
    return res.status(201).json({ message: 'Tracking created successfully.' });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user-anime-tracking/:mal_id
// ---------------------------------------------------------------------------
router.get(
  '/user-anime-tracking/:mal_id(\\d+)',
  requireLogin,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const malId = parseInt(req.params.mal_id, 10);

    const animeRows = await query('SELECT id FROM anime WHERE mal_id = ?', [malId]);
    if (!animeRows.length) {
      return res.status(404).json({ message: 'Anime not found.' });
    }
    const animeId = animeRows[0].id;

    const tracking = await query(
      `SELECT status, current_episode, user_rating, notes, mood
       FROM user_anime_tracking WHERE user_id = ? AND anime_id = ?`,
      [userId, animeId]
    );
    return res.json(tracking.length ? tracking[0] : {});
  })
);

// ---------------------------------------------------------------------------
// GET /api/user-anime-by-mood
// ---------------------------------------------------------------------------
router.get(
  '/user-anime-by-mood',
  requireLogin,
  asyncHandler(async (req, res) => {
    const mood = req.query.mood;
    if (!mood) {
      return res.status(400).json({ error: 'Mood parameter is required.' });
    }
    const results = await query(
      `SELECT a.id, a.title_en, a.title_jp, a.poster_image_url, a.mal_id, uat.mood
       FROM user_anime_tracking uat
       JOIN anime a ON uat.anime_id = a.id
       WHERE uat.user_id = ? AND uat.mood = ?`,
      [req.user.id, mood]
    );
    return res.json({ anime: results });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user-stats
// ---------------------------------------------------------------------------
router.get(
  '/user-stats',
  requireLogin,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const totalsRows = await query(
      `SELECT
          SUM(uat.current_episode) AS total_episodes,
          SUM(uat.current_episode *
              COALESCE(NULLIF(CAST(SUBSTRING_INDEX(a.duration, ' ', 1) AS UNSIGNED), 0), 24)
          ) AS total_minutes
       FROM user_anime_tracking uat
       JOIN anime a ON uat.anime_id = a.id
       WHERE uat.user_id = ?`,
      [userId]
    );
    const totalEpisodes = totalsRows[0].total_episodes || 0;
    const totalMinutes = Number(totalsRows[0].total_minutes) || 0;
    const totalHours = round(totalMinutes / 60, 1);

    const completedRows = await query(
      `SELECT COUNT(*) AS total_completed FROM user_anime_tracking
       WHERE user_id = ? AND status = 'completed'`,
      [userId]
    );
    const totalCompleted = completedRows[0].total_completed || 0;

    const firstRows = await query(
      `SELECT a.title FROM user_anime_tracking uat
       JOIN anime a ON uat.anime_id = a.id
       WHERE uat.user_id = ? ORDER BY uat.created_at ASC LIMIT 1`,
      [userId]
    );
    const firstAnime = firstRows.length ? firstRows[0].title : 'N/A';

    const lastRows = await query(
      `SELECT a.title, uat.status, uat.created_at, uat.updated_at, uat.user_rating,
              a.mal_id, a.poster_image_url
       FROM user_anime_tracking uat
       JOIN anime a ON uat.anime_id = a.id
       WHERE uat.user_id = ?
       ORDER BY uat.created_at DESC`,
      [userId]
    );
    const lastAnimeAdded = lastRows.map((row) => ({
      title: row.title,
      status: row.status,
      score: row.user_rating,
      mal_id: row.mal_id,
      image: row.poster_image_url,
      created_at: toIso(row.created_at),
      updated_at: toIso(row.updated_at),
    }));

    const avgEpRows = await query(
      `SELECT AVG(current_episode) AS avg_ep FROM user_anime_tracking
       WHERE user_id = ? AND status = 'completed'`,
      [userId]
    );
    const avgEp = avgEpRows[0].avg_ep ? Math.round(avgEpRows[0].avg_ep) : 0;

    const meanRows = await query(
      `SELECT AVG(user_rating) AS mean_score FROM user_anime_tracking
       WHERE user_id = ? AND status = 'completed'`,
      [userId]
    );
    const meanScore = meanRows[0].mean_score ? round(meanRows[0].mean_score, 1) : 0;

    const genreRows = await query(
      `SELECT mg.genre_name, COUNT(*) AS cnt
       FROM user_anime_tracking uat
       JOIN anime_genre_link_table aglt ON uat.anime_id = aglt.anime_id
       JOIN master_genre mg ON aglt.genre_id = mg.unique_mal_id_for_genre
       WHERE uat.user_id = ?
       GROUP BY mg.genre_name
       ORDER BY cnt DESC
       LIMIT 1`,
      [userId]
    );
    const mostWatchedGenre = genreRows.length ? genreRows[0].genre_name : 'N/A';

    const statusRows = await query(
      `SELECT status, COUNT(*) AS count FROM user_anime_tracking WHERE user_id = ? GROUP BY status`,
      [userId]
    );
    const statusDict = {};
    for (const row of statusRows) statusDict[row.status] = row.count;

    const totalRows = await query('SELECT COUNT(*) AS total FROM anime');
    const totalAnimeCount = totalRows.length ? totalRows[0].total : 0;

    return res.json({
      total_episodes_watched: totalEpisodes,
      total_hours_watched: totalHours,
      total_days_in_anime: round(totalHours / 24, 2),
      total_anime_completed: totalCompleted,
      first_anime: firstAnime,
      last_anime_added: lastAnimeAdded,
      avg_ep_per_completed: avgEp,
      most_watched_genre: mostWatchedGenre,
      avg_score: meanScore,
      status_counts: statusDict,
      total_anime_count: totalAnimeCount,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user/anime-list
// ---------------------------------------------------------------------------
router.get(
  '/user/anime-list',
  requireLogin,
  asyncHandler(async (req, res) => {
    const animeList = await query(
      `SELECT
          a.mal_id, a.title_en, a.title_jp, a.poster_image_url,
          a.episodes AS total_episodes,
          uat.status, uat.current_episode, uat.user_rating, uat.mood,
          uat.created_at, uat.updated_at
       FROM user_anime_tracking uat
       JOIN anime a ON uat.anime_id = a.id
       WHERE uat.user_id = ?
       ORDER BY uat.updated_at DESC`,
      [req.user.id]
    );
    return res.json({ anime_list: animeList });
  })
);

// ---------------------------------------------------------------------------
// GET /api/unique-anime-watched — count distinct franchises watched
// ---------------------------------------------------------------------------
router.get(
  '/unique-anime-watched',
  requireLogin,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const watchedRows = await query(
      'SELECT anime_id FROM user_anime_tracking WHERE user_id = ?',
      [userId]
    );
    const watchedIds = new Set(watchedRows.map((r) => r.anime_id));
    if (watchedIds.size === 0) {
      return res.json({ unique_anime_watched: 0, franchises: [] });
    }

    const prequelRows = await query(
      `SELECT source_anime_id, target_anime_id, mrt.relation_type_name
       FROM anime_relationship ar
       JOIN master_relation_type mrt ON ar.relation_type_id = mrt.id
       WHERE mrt.relation_type_name IN ('prequel', 'parent story')`
    );
    const prequelMap = {};
    for (const row of prequelRows) {
      prequelMap[row.target_anime_id] = row.source_anime_id;
    }

    const allRows = await query('SELECT id FROM anime');
    const allAnimeIds = allRows.map((r) => r.id);

    function findRoot(animeId) {
      const seen = new Set();
      while (animeId in prequelMap && !seen.has(animeId)) {
        seen.add(animeId);
        animeId = prequelMap[animeId];
      }
      return animeId;
    }

    const animeToRoot = {};
    for (const id of allAnimeIds) animeToRoot[id] = findRoot(id);

    const franchiseRoots = new Set();
    for (const id of watchedIds) franchiseRoots.add(findRoot(id));

    const franchises = [];
    for (const rootId of franchiseRoots) {
      const franchiseAnimeIds = Object.keys(animeToRoot)
        .filter((aid) => animeToRoot[aid] === rootId)
        .map(Number);
      if (!franchiseAnimeIds.length) continue;
      const placeholders = franchiseAnimeIds.map(() => '?').join(',');
      const rows = await query(
        `SELECT id, mal_id, title_en, title_jp, poster_image_url, start_date
         FROM anime
         WHERE id IN (${placeholders})
         ORDER BY start_date ASC, id ASC
         LIMIT 1`,
        franchiseAnimeIds
      );
      if (rows.length) franchises.push(rows[0]);
    }

    return res.json({ unique_anime_watched: franchiseRoots.size, franchises });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user/recent-anime
// ---------------------------------------------------------------------------
router.get(
  '/user/recent-anime',
  requireLogin,
  asyncHandler(async (req, res) => {
    const recent = await query(
      `SELECT a.mal_id, a.title_en, a.title_jp, a.poster_image_url, uat.status
       FROM user_anime_tracking uat
       JOIN anime a ON uat.anime_id = a.id
       WHERE uat.user_id = ?
       ORDER BY uat.updated_at DESC
       LIMIT 10`,
      [req.user.id]
    );
    return res.json({ recent });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user/status_counts
// ---------------------------------------------------------------------------
router.get(
  '/user/status_counts',
  requireLogin,
  asyncHandler(async (req, res) => {
    const statusCounts = await query(
      `SELECT status, COUNT(*) AS count FROM user_anime_tracking WHERE user_id = ? GROUP BY status`,
      [req.user.id]
    );
    return res.json({ status_counts: statusCounts });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user/watch_hour_ranks — leaderboard by total watch hours
// ---------------------------------------------------------------------------
router.get(
  '/user/watch_hour_ranks',
  requireLogin,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const allRanks = await query(
      `WITH UserWatchHours AS (
          SELECT uat.user_id,
                 SUM(uat.current_episode *
                     COALESCE(NULLIF(CAST(SUBSTRING_INDEX(a.duration, ' ', 1) AS UNSIGNED), 0), 24)
                 ) AS total_minutes
          FROM user_anime_tracking uat
          JOIN anime a ON uat.anime_id = a.id
          WHERE uat.status = 'completed'
          GROUP BY uat.user_id
      ),
      UserCompleted AS (
          SELECT user_id, COUNT(*) AS completed_count, AVG(user_rating) AS mean_score
          FROM user_anime_tracking
          WHERE status = 'completed'
          GROUP BY user_id
      ),
      RankedUsers AS (
          SELECT u.id AS user_id,
                 u.display_name,
                 u.profile_pic,
                 COALESCE(uwh.total_minutes, 0) AS total_minutes,
                 COALESCE(uc.completed_count, 0) AS completed_count,
                 ROUND(COALESCE(uc.mean_score, 0), 2) AS mean_score,
                 RANK() OVER (ORDER BY COALESCE(uwh.total_minutes, 0) DESC) AS user_rank
          FROM users u
          LEFT JOIN UserWatchHours uwh ON u.id = uwh.user_id
          LEFT JOIN UserCompleted uc ON u.id = uc.user_id
      )
      SELECT user_id, display_name, profile_pic, total_minutes, completed_count, mean_score, user_rank
      FROM RankedUsers
      ORDER BY user_rank ASC`
    );

    const topRanks = allRanks.slice(0, 9);
    const userRank = allRanks.find((r) => r.user_id === userId) || null;
    const showRanks = topRanks.slice();
    if (userRank && !topRanks.some((r) => r.user_id === userRank.user_id)) {
      showRanks.push(userRank);
    }

    return res.json({ show_ranks: showRanks, all_ranks: allRanks, user_rank: userRank });
  })
);

module.exports = router;
