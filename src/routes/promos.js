'use strict';

const express = require('express');
const { query, execute } = require('../config/db');
const { asyncHandler } = require('../services/util');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { cacheJson, invalidate } = require('../services/cache');

const router = express.Router();

const KINDS = new Set(['announcement', 'event', 'partner']);

function cleanKind(kind) {
  return KINDS.has(kind) ? kind : 'event';
}

function normalise(body) {
  const out = {};
  out.kind = cleanKind((body.kind || '').toString().trim());
  out.title = (body.title || '').toString().trim().slice(0, 160);
  out.subtitle = (body.subtitle || '').toString().trim().slice(0, 255) || null;
  out.body = (body.body || '').toString().trim().slice(0, 4000) || null;
  out.date_label = (body.date_label || '').toString().trim().slice(0, 80) || null;
  out.url = (body.url || '').toString().trim().slice(0, 500) || null;
  out.image_url = (body.image_url || '').toString().trim().slice(0, 500) || null;
  out.active = body.active === undefined ? 1 : (body.active ? 1 : 0);
  out.sort_order = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  return out;
}

// ---------------------------------------------------------------------------
// GET /api/promos  — active announcements / events / partners (public)
// ---------------------------------------------------------------------------
router.get(
  '/promos',
  cacheJson(120),
  asyncHandler(async (req, res) => {
    const kind = req.query.kind ? cleanKind(req.query.kind) : null;
    const rows = kind
      ? await query('SELECT * FROM promos WHERE active = 1 AND kind = ? ORDER BY sort_order ASC, id DESC', [kind])
      : await query('SELECT * FROM promos WHERE active = 1 ORDER BY sort_order ASC, id DESC');
    const grouped = { announcement: [], event: [], partner: [] };
    for (const r of rows) {
      if (grouped[r.kind]) grouped[r.kind].push(r);
    }
    res.json(kind ? { items: grouped[kind] } : grouped);
  })
);

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------
router.get(
  '/admin/promos',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const rows = await query('SELECT * FROM promos ORDER BY kind ASC, sort_order ASC, id DESC');
    res.json({ items: rows });
  })
);

router.post(
  '/admin/promos',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const p = normalise(req.body || {});
    if (!p.title) return res.status(400).json({ error: 'A title is required.' });
    const r = await execute(
      `INSERT INTO promos (kind, title, subtitle, body, date_label, url, image_url, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.kind, p.title, p.subtitle, p.body, p.date_label, p.url, p.image_url, p.active, p.sort_order]
    );
    invalidate();
    res.status(201).json({ success: true, id: r.insertId });
  })
);

router.put(
  '/admin/promos/:id(\\d+)',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const p = normalise(req.body || {});
    if (!p.title) return res.status(400).json({ error: 'A title is required.' });
    const r = await execute(
      `UPDATE promos SET kind = ?, title = ?, subtitle = ?, body = ?, date_label = ?,
              url = ?, image_url = ?, active = ?, sort_order = ? WHERE id = ?`,
      [p.kind, p.title, p.subtitle, p.body, p.date_label, p.url, p.image_url, p.active, p.sort_order, req.params.id]
    );
    invalidate();
    if (!r.affectedRows) return res.status(404).json({ error: 'That entry no longer exists.' });
    res.json({ success: true });
  })
);

router.delete(
  '/admin/promos/:id(\\d+)',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const r = await execute('DELETE FROM promos WHERE id = ?', [req.params.id]);
    invalidate();
    if (!r.affectedRows) return res.status(404).json({ error: 'That entry no longer exists.' });
    res.json({ success: true });
  })
);

module.exports = router;
