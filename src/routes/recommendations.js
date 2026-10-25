'use strict';

const express = require('express');
const { query } = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { asyncHandler } = require('../services/util');
const { cacheJson } = require('../services/cache');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/recommend — save a recommendation
// ---------------------------------------------------------------------------
router.post(
  '/recommend',
  requireLogin,
  asyncHandler(async (req, res) => {
    const data = req.body || {};
    const userId = req.user.id;
    const fromAnimeId = data.from_anime_id;
    const toAnimeId = data.to_anime_id;
    await query(
      'INSERT IGNORE INTO recommendations (user_id, from_anime_id, to_anime_id) VALUES (?, ?, ?)',
      [userId, fromAnimeId, toAnimeId]
    );
    return res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// GET /api/recommendations/global — aggregated (cached 5 min)
// (registered before :anime_id so it is not shadowed)
// ---------------------------------------------------------------------------
router.get(
  '/recommendations/global',
  cacheJson(300),
  asyncHandler(async (req, res) => {
    const rawRecs = await query(
      `SELECT
          r.from_anime_id,
          a_from.title_en AS from_title_en,
          a_from.title_jp AS from_title_jp,
          a_from.poster_image_url AS from_poster_url,
          r.to_anime_id,
          a_to.title_en AS to_title_en,
          a_to.title_jp AS to_title_jp,
          a_to.poster_image_url AS to_poster_url,
          COUNT(*) AS recommendation_count,
          MAX(r.created_at) AS latest_recommendation_date,
          (SELECT COUNT(*) FROM recommendations sub_r WHERE sub_r.to_anime_id = r.to_anime_id) AS total_recommendations_for_to
       FROM recommendations r
       JOIN anime a_from ON r.from_anime_id = a_from.mal_id
       JOIN anime a_to ON r.to_anime_id = a_to.mal_id
       GROUP BY r.from_anime_id, r.to_anime_id,
                a_from.title_en, a_from.title_jp, a_from.poster_image_url,
                a_to.title_en, a_to.title_jp, a_to.poster_image_url
       ORDER BY latest_recommendation_date DESC, recommendation_count DESC
       LIMIT 10`
    );

    const recommendations = rawRecs.map((row) => ({
      from_anime: {
        mal_id: row.from_anime_id,
        title_en: row.from_title_en,
        title_jp: row.from_title_jp,
        poster_image_url: row.from_poster_url,
      },
      to_anime: {
        mal_id: row.to_anime_id,
        title_en: row.to_title_en,
        title_jp: row.to_title_jp,
        poster_image_url: row.to_poster_url,
        total_recommendations: row.total_recommendations_for_to,
      },
      recommendation_count: row.recommendation_count,
      date: row.latest_recommendation_date,
    }));

    return res.json({ recommendations });
  })
);

// ---------------------------------------------------------------------------
// GET /api/recommendations/:anime_id — recommendations for one anime
// ---------------------------------------------------------------------------
router.get(
  '/recommendations/:anime_id(\\d+)',
  asyncHandler(async (req, res) => {
    const animeId = parseInt(req.params.anime_id, 10);
    const recs = await query(
      `SELECT r.to_anime_id, a.title_en, a.title_jp, a.poster_image_url
       FROM recommendations r
       JOIN anime a ON r.to_anime_id = a.mal_id
       WHERE r.from_anime_id = ?`,
      [animeId]
    );
    return res.json({ recommendations: recs });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user/recommendations — the current user's recommendations
// ---------------------------------------------------------------------------
router.get(
  '/user/recommendations',
  requireLogin,
  asyncHandler(async (req, res) => {
    const userRecs = await query(
      `SELECT
          r.id AS recommendation_id,
          a_from.mal_id AS from_anime_mal_id,
          a_from.title_en AS from_anime_title_en,
          a_from.title_jp AS from_anime_title_jp,
          a_from.poster_image_url AS from_anime_poster_url,
          a_to.mal_id AS to_anime_mal_id,
          a_to.title_en AS to_anime_title_en,
          a_to.title_jp AS to_anime_title_jp,
          a_to.poster_image_url AS to_anime_poster_url,
          r.created_at
       FROM recommendations r
       JOIN anime a_from ON r.from_anime_id = a_from.mal_id
       JOIN anime a_to ON r.to_anime_id = a_to.mal_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    return res.json({ user_recommendations: userRecs });
  })
);

module.exports = router;
