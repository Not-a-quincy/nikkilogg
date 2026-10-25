'use strict';

const express = require('express');
const { query, execute } = require('../config/db');
const { asyncHandler } = require('../services/util');
const { requireLogin, requireAuth } = require('../middleware/auth');
const { createToken, listTokens, revokeToken } = require('../services/tokens');
const { rank, CONFIDENT } = require('../services/match');

const router = express.Router();

// ---------------------------------------------------------------------------
// Token management (session only — you cannot mint a token with a token)
// ---------------------------------------------------------------------------
router.get(
  '/tokens',
  requireLogin,
  asyncHandler(async (req, res) => {
    res.json({ tokens: await listTokens(req.user.id) });
  })
);

router.post(
  '/tokens',
  requireLogin,
  asyncHandler(async (req, res) => {
    const name = (req.body && req.body.name) || 'Browser extension';
    const created = await createToken(req.user.id, name);
    // The plaintext is returned exactly once and never stored.
    res.status(201).json({ id: created.id, token: created.token, prefix: created.prefix, name });
  })
);

router.delete(
  '/tokens/:id(\\d+)',
  requireLogin,
  asyncHandler(async (req, res) => {
    const ok = await revokeToken(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'No such token.' });
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Extension API
// ---------------------------------------------------------------------------

/** Lets the extension confirm a token works and show who it belongs to. */
router.get(
  '/extension/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      id: req.user.id,
      display_name: req.user.display_name,
      profile_pic: req.user.profile_pic,
      auth: req.authMethod || 'session',
    });
  })
);

/**
 * GET /api/extension/lookup?title=Frieren&episode=5
 *
 * Finds catalogue entries for a title scraped off a streaming page, ranked
 * best-first, each carrying the viewer's own progress so the extension can
 * decide whether there is anything to log.
 */
router.get(
  '/extension/lookup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const raw = (req.query.title || '').toString().trim();
    if (raw.length < 2) {
      return res.json({ query: raw, best: null, candidates: [], confident: false });
    }

    // Try the whole title first, then the first couple of words — streaming
    // sites often append junk ("... Episode 5 English Subbed").
    const words = raw.split(/\s+/).filter(Boolean);
    const attempts = [raw];
    if (words.length > 2) attempts.push(words.slice(0, 3).join(' '));
    if (words.length > 1) attempts.push(words.slice(0, 2).join(' '));

    const seen = new Map();
    for (const attempt of attempts) {
      const like = `%${attempt}%`;
      const rows = await query(
        `SELECT mal_id, title, title_en, title_jp, poster_image_url, episodes,
                status, average_rating
           FROM anime
          WHERE title_en LIKE ? OR title LIKE ? OR title_jp LIKE ?
          LIMIT 25`,
        [like, like, like]
      );
      for (const row of rows) if (!seen.has(row.mal_id)) seen.set(row.mal_id, row);
      if (seen.size >= 12) break;
    }

    const ranked = rank(raw, Array.from(seen.values()), 5);
    if (!ranked.length) {
      return res.json({ query: raw, best: null, candidates: [], confident: false });
    }

    // Attach this viewer's progress for each candidate.
    const ids = ranked.map((r) => r.candidate.mal_id);
    const progress = new Map();
    if (ids.length) {
      const rows = await query(
        `SELECT a.mal_id, t.status, t.current_episode
           FROM user_anime_tracking t
           JOIN anime a ON a.id = t.anime_id
          WHERE t.user_id = ? AND a.mal_id IN (${ids.map(() => '?').join(',')})`,
        [req.user.id, ...ids]
      );
      for (const row of rows) progress.set(row.mal_id, row);
    }

    const candidates = ranked.map((r) => ({
      mal_id: r.candidate.mal_id,
      title: r.candidate.title_en || r.candidate.title || r.candidate.title_jp,
      title_jp: r.candidate.title_jp,
      poster: r.candidate.poster_image_url,
      episodes: r.candidate.episodes,
      airing_status: r.candidate.status,
      score: r.score,
      tracking: progress.get(r.candidate.mal_id) || null,
    }));

    res.json({
      query: raw,
      best: candidates[0],
      candidates,
      confident: candidates[0].score >= CONFIDENT,
    });
  })
);

/**
 * POST /api/extension/progress
 * { mal_id, episode, status? }  — logs what the viewer just watched.
 */
router.post(
  '/extension/progress',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const malId = Number(body.mal_id);
    const episode = Number(body.episode);
    const status = (body.status || 'watching').toString();

    if (!Number.isInteger(malId)) {
      return res.status(400).json({ error: 'mal_id is required.' });
    }
    if (!Number.isFinite(episode) || episode < 0) {
      return res.status(400).json({ error: 'episode must be a positive number.' });
    }

    const animeRows = await query('SELECT id FROM anime WHERE mal_id = ? LIMIT 1', [malId]);
    if (!animeRows.length) return res.status(404).json({ error: 'Unknown anime.' });
    const animeId = animeRows[0].id;

    const existing = await query(
      'SELECT id, current_episode FROM user_anime_tracking WHERE user_id = ? AND anime_id = ? LIMIT 1',
      [req.user.id, animeId]
    );

    if (!existing.length) {
      await execute(
        'INSERT INTO user_anime_tracking (user_id, anime_id, status, current_episode) VALUES (?, ?, ?, ?)',
        [req.user.id, animeId, status, episode]
      );
    } else {
      // Never move progress backwards — a rewatch should not erase the record.
      await execute(
        `UPDATE user_anime_tracking
            SET current_episode = GREATEST(COALESCE(current_episode, 0), ?),
                status = CASE WHEN status IS NULL OR status = '' THEN ? ELSE status END
          WHERE id = ?`,
        [episode, status, existing[0].id]
      );
    }

    res.json({ success: true, mal_id: malId, episode });
  })
);

module.exports = router;
