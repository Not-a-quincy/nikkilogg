'use strict';

const express = require('express');
const { query, execute } = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { asyncHandler } = require('../services/util');

const router = express.Router();

function getPlatformFromUrl(url) {
  if (!url) return 'Other';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('spotify.com')) return 'Spotify';
  return 'Other';
}

// ---------------------------------------------------------------------------
// POST /api/user/custom-themes
// ---------------------------------------------------------------------------
router.post(
  '/user/custom-themes',
  requireLogin,
  asyncHandler(async (req, res) => {
    const data = req.body || {};
    const songTitle = data.song_title;
    const artist = data.artist;
    const animeTitleText = data.anime_title_text;
    const url = data.url;
    const themeType = data.theme_type || 'OP';
    const themeNumber = data.theme_number;

    if (!songTitle) {
      return res.status(400).json({ error: 'Song title is required.' });
    }

    const userId = req.user.id;
    const platform = getPlatformFromUrl(url);

    let animeId = null;
    if (animeTitleText) {
      const animeRows = await query(
        'SELECT id FROM anime WHERE title_en = ? OR title_jp = ? OR title = ? LIMIT 1',
        [animeTitleText, animeTitleText, animeTitleText]
      );
      if (animeRows.length) animeId = animeRows[0].id;
    }

    const result = await execute(
      `INSERT INTO user_custom_themes
         (user_id, song_title, artist, anime_title_text, anime_id, theme_type, theme_number, url, platform)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, songTitle, artist, animeTitleText, animeId, themeType, themeNumber, url, platform]
    );
    return res.status(201).json({
      success: true,
      message: 'Custom theme added.',
      id: result.insertId,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/user/custom-themes
// ---------------------------------------------------------------------------
router.get(
  '/user/custom-themes',
  requireLogin,
  asyncHandler(async (req, res) => {
    const themes = await query(
      `SELECT uct.id, uct.song_title, uct.artist, uct.anime_title_text, uct.theme_type, uct.theme_number,
              uct.url, uct.platform, a.mal_id AS anime_mal_id, a.poster_image_url AS anime_poster_url,
              a.title_en AS anime_title_en
       FROM user_custom_themes uct
       LEFT JOIN anime a ON uct.anime_id = a.id
       WHERE uct.user_id = ?
       ORDER BY uct.created_at DESC`,
      [req.user.id]
    );
    return res.json({ themes });
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/user/custom-themes/:theme_id
// ---------------------------------------------------------------------------
router.delete(
  '/user/custom-themes/:theme_id(\\d+)',
  requireLogin,
  asyncHandler(async (req, res) => {
    const themeId = parseInt(req.params.theme_id, 10);
    const result = await execute(
      'DELETE FROM user_custom_themes WHERE id = ? AND user_id = ?',
      [themeId, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: 'Theme not found or you do not have permission to delete it.' });
    }
    return res.json({ success: true, message: 'Custom theme removed.' });
  })
);

module.exports = router;
