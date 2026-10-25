'use strict';

const express = require('express');
const { asyncHandler } = require('../services/util');
const { requireAuth } = require('../middleware/auth');
const moods = require('../services/moods');

const router = express.Router();

/** GET /api/mood — the vocabulary, so the UI never hard-codes it twice. */
router.get('/mood', (req, res) => {
  res.json({ moods: moods.MOODS });
});

/** GET /api/mood/:mal_id — what people felt about one title. */
router.get(
  '/mood/:mal_id(\\d+)',
  asyncHandler(async (req, res) => {
    const result = await moods.forAnime(Number(req.params.mal_id), req.user ? req.user.id : null);
    res.json(result);
  })
);

/** POST /api/mood/vote { mal_id, mood } — one tap, changeable. */
router.post(
  '/mood/vote',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const malId = Number(body.mal_id);
    if (!Number.isInteger(malId)) return res.status(400).json({ error: 'mal_id is required.' });
    if (!moods.isValid(body.mood)) return res.status(400).json({ error: 'Unknown mood.' });

    try {
      await moods.vote(req.user.id, malId, String(body.mood).toLowerCase());
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json(await moods.forAnime(malId, req.user.id));
  })
);

/** GET /api/mood/queue — what you have tracked but not yet given a mood. */
router.get(
  '/mood/queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 40));
    const [items, logged] = await Promise.all([
      moods.queue(req.user.id, limit),
      moods.myCount(req.user.id),
    ]);
    res.json({ items, logged });
  })
);

module.exports = router;
