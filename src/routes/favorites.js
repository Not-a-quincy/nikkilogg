'use strict';

const express = require('express');
const { query } = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { asyncHandler } = require('../services/util');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/favorite — toggle a favorite for the current user
// ---------------------------------------------------------------------------
router.post(
  '/favorite',
  requireLogin,
  asyncHandler(async (req, res) => {
    const data = req.body || {};
    const malId = data.mal_id;
    if (!malId) {
      return res.status(400).json({ error: 'Missing mal_id' });
    }

    const rows = await query('SELECT id FROM anime WHERE mal_id = ?', [malId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Anime not found' });
    }
    const animeId = rows[0].id;
    const userId = req.user.id;

    const fav = await query(
      'SELECT id FROM user_favorites WHERE user_id = ? AND anime_id = ?',
      [userId, animeId]
    );

    if (fav.length) {
      await query('DELETE FROM user_favorites WHERE user_id = ? AND anime_id = ?', [userId, animeId]);
      return res.json({ favorited: false });
    }
    await query('INSERT INTO user_favorites (user_id, anime_id) VALUES (?, ?)', [userId, animeId]);
    return res.json({ favorited: true });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user/favorites
// ---------------------------------------------------------------------------
router.get(
  '/user/favorites',
  requireLogin,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const favRows = await query('SELECT anime_id FROM user_favorites WHERE user_id = ?', [userId]);
    const favoriteAnimeIds = favRows.map((r) => r.anime_id);

    if (!favoriteAnimeIds.length) {
      return res.json({ favorites: [] });
    }

    const placeholders = favoriteAnimeIds.map(() => '?').join(',');
    const favoritesData = await query(
      `SELECT mal_id, title_en, title_jp, poster_image_url
       FROM anime
       WHERE id IN (${placeholders})
       ORDER BY title_en ASC`,
      favoriteAnimeIds
    );
    return res.json({ favorites: favoritesData });
  })
);

module.exports = router;
