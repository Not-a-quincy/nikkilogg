'use strict';

const express = require('express');
const { query, execute } = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { asyncHandler } = require('../services/util');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/profile
// ---------------------------------------------------------------------------
router.get(
  '/profile',
  requireLogin,
  asyncHandler(async (req, res) => {
    const user = req.user;
    return res.json({
      display_name: user.display_name,
      country: user.country,
      state: user.state != null ? user.state : null,
      bio: user.bio != null ? user.bio : null,
      profile_pic: user.profile_pic,
      bg_image: user.bg_image != null ? user.bg_image : null,
      can_edit_country_state: true,
      can_edit_display_name: true,
      profile_last_updated: user.profile_last_updated
        ? new Date(user.profile_last_updated).toISOString()
        : null,
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/profile  (multipart/form-data)
// ---------------------------------------------------------------------------
router.post(
  '/profile',
  requireLogin,
  upload.fields([
    { name: 'profile_pic', maxCount: 1 },
    { name: 'bg_image', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const user = req.user;
    const body = req.body || {};
    const files = req.files || {};

    const displayName = (body.display_name || '').trim();
    const country = (body.country || '').trim();
    const state = (body.state || '').trim();
    const bio = (body.bio || '').trim();

    let touched = false;

    // --- Display Name: allow change anytime ---
    if (displayName && displayName !== (user.display_name || '')) {
      if (displayName.length > 20) {
        return res.status(400).json({ error: 'Display name must be 20 characters or fewer.' });
      }
      const existing = await query(
        'SELECT id FROM users WHERE display_name = ? AND id <> ? LIMIT 1',
        [displayName, user.id]
      );
      if (existing.length) {
        return res.status(409).json({ error: 'This display name exists. Try another name.' });
      }
      user.display_name = displayName;
      touched = true;
    }

    // --- Country / State: allow change anytime ---
    const changingCountry = country && country !== (user.country || '');
    const changingState = state && state !== (user.state || '');
    if (changingCountry || changingState) {
      user.country = country || null;
      user.state = state || null;
      touched = true;
    }

    // --- Bio: anytime ---
    user.bio = bio || null;

    // --- Profile pic ---
    if (files.profile_pic && files.profile_pic[0]) {
      user.profile_pic = `/static/uploads/${files.profile_pic[0].filename}`;
    }
    // --- Background image ---
    if (files.bg_image && files.bg_image[0]) {
      user.bg_image = `/static/uploads/${files.bg_image[0].filename}`;
    }

    const lastUpdatedClause = touched ? 'profile_last_updated = UTC_TIMESTAMP(),' : '';
    await execute(
      `UPDATE users SET
         display_name = ?, country = ?, state = ?, bio = ?,
         profile_pic = ?, bg_image = ?,
         ${lastUpdatedClause} updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [
        user.display_name != null ? user.display_name : null,
        user.country != null ? user.country : null,
        user.state != null ? user.state : null,
        user.bio != null ? user.bio : null,
        user.profile_pic != null ? user.profile_pic : null,
        user.bg_image != null ? user.bg_image : null,
        user.id,
      ]
    ).catch(async (err) => {
      // Some schemas have no `updated_at` column on users; retry without it.
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        await execute(
          `UPDATE users SET
             display_name = ?, country = ?, state = ?, bio = ?,
             profile_pic = ?, bg_image = ?
             ${touched ? ', profile_last_updated = UTC_TIMESTAMP()' : ''}
           WHERE id = ?`,
          [
            user.display_name != null ? user.display_name : null,
            user.country != null ? user.country : null,
            user.state != null ? user.state : null,
            user.bio != null ? user.bio : null,
            user.profile_pic != null ? user.profile_pic : null,
            user.bg_image != null ? user.bg_image : null,
            user.id,
          ]
        );
      } else {
        throw err;
      }
    });

    return res.json({
      success: true,
      profile_pic: user.profile_pic,
      bg_image: user.bg_image,
    });
  })
);

module.exports = router;
