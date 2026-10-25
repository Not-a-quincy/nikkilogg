'use strict';

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');

const { query } = require('../config/db');
const { asyncHandler } = require('../services/util');
const { requireLogin } = require('../middleware/auth');
const { store } = require('../services/cache');
const importer = require('../services/malImport');
const runner = require('../services/importRunner');

const router = express.Router();

// Uploads are held in memory: the file is parsed immediately and never written
// to disk, so there is nothing to clean up and nothing to leak.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

const PREVIEW_TTL_SECONDS = 15 * 60;

function previewKey(userId, token) {
  return `import:${userId}:${token}`;
}

/**
 * POST /api/import/preview
 *
 * Parses the file and reports exactly what would happen — without writing
 * anything. Importing is not destructive, but overwriting somebody's ratings
 * without warning them would be, so the write only happens after a confirmation.
 */
router.post(
  '/import/preview',
  requireLogin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Choose a file to upload.' });
    }

    let parsed;
    try {
      // pass the Buffer: the service decompresses gzip itself
      parsed = importer.parse(req.file.buffer, req.file.originalname);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const { entries, duplicates } = importer.dedupe(parsed.entries);
    if (!entries.length) {
      return res.status(400).json({
        error: 'No entries could be read from that file.',
        problems: parsed.problems.slice(0, 10),
      });
    }

    const preview = await runner.buildPreview(req.user.id, entries);
    const { matched, unmatched, alreadyTracked, newEntries, byStatus } = preview;

    const token = crypto.randomBytes(16).toString('hex');
    store.set(previewKey(req.user.id, token), matched, PREVIEW_TTL_SECONDS);

    res.json({
      token,
      format: parsed.format,
      total: entries.length,
      matched: matched.length,
      unmatched: unmatched.length,
      alreadyTracked,
      newEntries,
      byStatus,
      duplicates,
      problems: parsed.problems.slice(0, 10),
      problemCount: parsed.problems.length,
      unmatchedSample: unmatched.slice(0, 15).map((e) => ({ malId: e.malId, title: e.title })),
      notImported: importer.NOT_IMPORTED,
    });
  })
);

/**
 * POST /api/import/apply  { token }
 *
 * Writes the previewed entries. Wrapped in a transaction: a half-imported list
 * would be worse than no import at all.
 */
router.post(
  '/import/apply',
  requireLogin,
  asyncHandler(async (req, res) => {
    const token = String((req.body && req.body.token) || '');
    const key = previewKey(req.user.id, token);
    const entries = store.get(key);

    if (!entries) {
      return res.status(410).json({
        error: 'That preview has expired. Please upload the file again.',
      });
    }

    // One-shot: a token cannot be replayed.
    store.del(key);

    const { inserted, updated, imported } = await runner.applyImport(req.user.id, entries);

    res.json({ imported, inserted, updated });
  })
);

// A too-large upload is a user mistake, not a crash.
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'That file is larger than 25 MB.' });
  }
  if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
  next();
});

module.exports = router;
