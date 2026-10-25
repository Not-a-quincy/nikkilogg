'use strict';

const express = require('express');
const { query, execute } = require('../config/db');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../services/util');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /admin/reports — admin panel for reported comments
// ---------------------------------------------------------------------------
router.get(
  '/admin/reports',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const reports = await query(
      `SELECT r.id AS report_id, r.reason, r.details, r.status, r.reported_at,
              r.comment_id, r.user_id, r.ip_address, r.user_agent,
              c.comment_text, c.title, c.created_at AS comment_created,
              u.display_name AS commenter_name
       FROM comment_reports r
       JOIN comments c ON r.comment_id = c.id
       LEFT JOIN users u ON c.user_id = u.id
       ORDER BY r.reported_at DESC`
    );
    res.render('admin_reports', { reports });
  })
);

// ---------------------------------------------------------------------------
// POST /admin/reports/:report_id/status — update or resolve a report
// ---------------------------------------------------------------------------
router.post(
  '/admin/reports/:report_id(\\d+)/status',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const reportId = parseInt(req.params.report_id, 10);
    const newStatus = req.body.status;
    const commentId = req.body.comment_id;

    if (newStatus === 'delete_comment') {
      await execute('DELETE FROM comments WHERE id = ?', [commentId]);
    } else {
      await execute('UPDATE comment_reports SET status = ? WHERE id = ?', [newStatus, reportId]);
    }

    res.redirect('/admin/reports');
  })
);

module.exports = router;
