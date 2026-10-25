'use strict';

const express = require('express');
const config = require('../config/env');
const { query, describeDbError } = require('../config/db');
const { asyncHandler } = require('../services/util');

const router = express.Router();

/**
 * GET /api/health
 *
 * A self-diagnosis page. Open http://127.0.0.1:5000/api/health in a browser to
 * see whether the server can reach the database, and if not, exactly why.
 * Never returns the database password.
 */
router.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    const report = {
      server: 'ok',
      database: { connected: false },
      config: {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
      },
    };

    try {
      await query('SELECT 1');
      report.database.connected = true;

      const tables = await query(
        `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()`
      );
      report.database.tables = tables[0].n;

      // Does the table the anime list needs actually exist here?
      const animeTable = await query(
        `SELECT COUNT(*) AS n FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = 'anime'`
      );
      report.database.hasAnimeTable = animeTable[0].n > 0;

      report.ok = true;
      report.database.message = report.database.hasAnimeTable
        ? 'Connected to the database.'
        : 'Connected, but there is no "anime" table in this database. DB_NAME may be pointing at the wrong database.';
    } catch (err) {
      const described = describeDbError(err);
      report.ok = false;
      report.database.error = described.code;
      report.database.message = described.message;
      report.database.hint = described.hint;
    }

    res.status(report.ok ? 200 : 503).json(report);
  })
);

module.exports = router;
