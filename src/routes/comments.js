'use strict';

const express = require('express');
const { query, execute } = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { asyncHandler } = require('../services/util');

const router = express.Router();

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

// ---------------------------------------------------------------------------
// GET /api/anime/:mal_id/comments
// ---------------------------------------------------------------------------
router.get(
  '/anime/:mal_id(\\d+)/comments',
  asyncHandler(async (req, res) => {
    const malId = parseInt(req.params.mal_id, 10);

    const animeRows = await query('SELECT id FROM anime WHERE mal_id = ?', [malId]);
    if (!animeRows.length) {
      return res.status(404).json({ error: 'Anime not found' });
    }
    const animeId = animeRows[0].id;
    const userForLikeCheck = req.user ? req.user.id : 0;

    const comments = await query(
      `SELECT
          c.id AS comment_id,
          c.comment_text,
          c.title,
          c.created_at,
          c.score,
          c.verdict,
          u.id AS user_id,
          u.display_name AS username,
          u.profile_pic,
          COUNT(cl.id) AS like_count,
          MAX(CASE WHEN cl.user_id = ? THEN 1 ELSE 0 END) AS is_liked_by_user
       FROM comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN comment_likes cl ON c.id = cl.comment_id
       WHERE c.anime_id = ? AND c.parent_comment_id IS NULL
       GROUP BY c.id, c.comment_text, c.title, c.created_at, u.id, u.display_name, u.profile_pic
       ORDER BY c.created_at ASC`,
      [userForLikeCheck, animeId]
    );

    const isAdmin = req.user ? !!req.user.is_admin : false;
    for (const comment of comments) {
      comment.created_at = toIso(comment.created_at);
      comment.is_liked_by_user = !!comment.is_liked_by_user;
      comment.is_owner = !!req.user && comment.user_id === req.user.id;
      comment.viewer_is_admin = isAdmin;
    }

    return res.json(comments);
  })
);

// ---------------------------------------------------------------------------
// POST /api/anime/:anime_id/user_comments
// ---------------------------------------------------------------------------
router.post(
  '/anime/:anime_id(\\d+)/user_comments',
  asyncHandler(async (req, res) => {
    const animeIdParam = parseInt(req.params.anime_id, 10);
    const data = req.body;
    if (!data) {
      return res.status(400).json({ error: 'No JSON data received' });
    }
    const userId = data.user;
    const title = data.title;
    const commentText = data.content;
    const score = data.score;
    const verdict = data.verdict;

    if (!userId || !commentText) {
      return res.status(400).json({ error: 'Missing user_id or comment_text' });
    }

    const animeRows = await query('SELECT id FROM anime WHERE mal_id = ?', [animeIdParam]);
    if (!animeRows.length) {
      return res.status(404).json({ error: 'Anime not found' });
    }
    const internalAnimeId = animeRows[0].id;

    const result = await execute(
      `INSERT INTO comments (anime_id, user_id, title, comment_text, score, verdict)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [internalAnimeId, userId, title, commentText, score, verdict]
    );

    return res.status(201).json({
      message: 'Comment posted successfully',
      comment_id: result.insertId,
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/comments/:comment_id/like — toggle like
// ---------------------------------------------------------------------------
router.post(
  '/comments/:comment_id(\\d+)/like',
  requireLogin,
  asyncHandler(async (req, res) => {
    const commentId = parseInt(req.params.comment_id, 10);
    const userId = req.user.id;

    const existing = await query(
      'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?',
      [commentId, userId]
    );

    let action;
    if (existing.length) {
      await query('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
      action = 'unliked';
    } else {
      await query('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [commentId, userId]);
      action = 'liked';
    }

    const countRows = await query(
      'SELECT COUNT(*) AS cnt FROM comment_likes WHERE comment_id = ?',
      [commentId]
    );
    const newLikeCount = countRows[0].cnt;

    return res.status(200).json({ success: true, action, new_like_count: newLikeCount });
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/comments/:comment_id
// ---------------------------------------------------------------------------
router.delete(
  '/comments/:comment_id(\\d+)',
  requireLogin,
  asyncHandler(async (req, res) => {
    const commentId = parseInt(req.params.comment_id, 10);
    const rows = await query('SELECT user_id FROM comments WHERE id = ?', [commentId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (rows[0].user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await query('DELETE FROM comments WHERE id = ?', [commentId]);
    return res.status(200).json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// POST /api/comments/:comment_id/report
// ---------------------------------------------------------------------------
router.post(
  '/comments/:comment_id(\\d+)/report',
  asyncHandler(async (req, res) => {
    const commentId = parseInt(req.params.comment_id, 10);
    const data = req.body || {};
    const reason = (data.reason || '').trim();
    const details = (data.details || '').trim();
    const userId = req.user ? req.user.id : null;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'] || '';

    if (!reason) {
      return res.status(400).json({ error: 'Please select a reason' });
    }

    const exists = await query('SELECT 1 FROM comments WHERE id = ?', [commentId]);
    if (!exists.length) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (userId) {
      const dup = await query(
        'SELECT 1 FROM comment_reports WHERE comment_id = ? AND user_id = ?',
        [commentId, userId]
      );
      if (dup.length) {
        return res.status(409).json({ error: 'You have already reported this comment' });
      }
    }

    await query(
      `INSERT INTO comment_reports (comment_id, user_id, ip_address, user_agent, reason, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [commentId, userId, ipAddress, userAgent, reason, details]
    );

    return res.json({ success: true });
  })
);

module.exports = router;
