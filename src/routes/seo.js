'use strict';

const express = require('express');
const { query } = require('../config/db');
const config = require('../config/env');

const router = express.Router();

/** Pages that should never appear in search results. */
const DISALLOW = ['/api/', '/settings', '/admin/', '/login', '/register', '/logout', '/profile'];

router.get('/robots.txt', (req, res) => {
  const lines = [
    'User-agent: *',
    'Allow: /',
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${config.baseUrl}/sitemap.xml`,
    '',
  ];
  res.type('text/plain').send(lines.join('\n'));
});

function urlEntry(loc, changefreq, priority) {
  return `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

/**
 * GET /sitemap.xml
 *
 * Lists every page worth indexing. The catalogue can run to tens of thousands
 * of entries; a sitemap holds 50,000 URLs, so beyond that you would need a
 * sitemap index — noted in SEO.md rather than guessed at here.
 */
router.get('/sitemap.xml', async (req, res) => {
  const base = config.baseUrl;
  const urls = [
    urlEntry(`${base}/`, 'daily', '1.0'),
    urlEntry(`${base}/browse?category=all`, 'daily', '0.8'),
    urlEntry(`${base}/events`, 'weekly', '0.4'),
    urlEntry(`${base}/about`, 'monthly', '0.5'),
    urlEntry(`${base}/privacy`, 'monthly', '0.3'),
  ];

  // The mood pages are the ones actually worth indexing: they answer a query
  // no catalogue site can, so they carry the site's only original value.
  for (const mood of require('../services/moods').MOODS) {
    urls.push(urlEntry(`${base}/mood/${mood.slug}`, 'daily', '0.9'));
  }

  try {
    const rows = await query('SELECT mal_id FROM anime WHERE mal_id IS NOT NULL ORDER BY popularity ASC LIMIT 45000');
    for (const row of rows) {
      urls.push(urlEntry(`${base}/anime/${row.mal_id}`, 'weekly', '0.6'));
    }
  } catch (err) {
    // Database down: still serve a valid sitemap rather than a 500.
    console.error('sitemap: could not list anime —', err.code || err.message);
  }

  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  );
});

module.exports = router;
