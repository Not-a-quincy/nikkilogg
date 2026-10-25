'use strict';

const express = require('express');
const overviewService = require('../services/overview');
const contactService = require('../services/contact');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { query } = require('../config/db');
const config = require('../config/env');
const moods = require('../services/moods');
const { asyncHandler } = require('../services/util');

const router = express.Router();

// GET /  -> index.html
router.get('/', (req, res) => {
  res.render('index', {
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Nikkilog',
      url: `${config.baseUrl}/`,
      description: 'A calm, self-hosted anime tracker — log what you watch and write down what you thought.',
    },
  });
});

// GET /login  (already signed in? go home)
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { next: typeof req.query.next === 'string' ? req.query.next : '' });
});

// GET /recover  (already signed in? go home)
router.get('/recover', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('recover');
});

// GET /register  (already signed in? go home)
router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('register');
});

// GET /browse -> browse.html
router.get('/browse', (req, res) => {
  const category = req.query.category || 'all';
  res.render('browse', {
    currentCategory: category,
    isLoggedIn: !!req.user,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Browse anime — Nikkilog',
      url: `${config.baseUrl}/browse`,
    },
  });
});

// GET /anime/:anime_id -> anime.html
// Also loads the title/synopsis/poster so shared links show a rich preview.
router.get(
  '/anime/:anime_id(\\d+)',
  asyncHandler(async (req, res) => {
    const animeId = parseInt(req.params.anime_id, 10);
    const userId = req.user ? req.user.id : null;

    // Everything here is rendered into the HTML so a crawler sees real content
    // without running JavaScript. The page script then enhances it.
    let anime = null;
    let metaTitle, metaDescription, metaImage, jsonLd;

    try {
      const rows = await query(
        `SELECT id, mal_id, title, title_en, title_jp, synopsis, poster_image_url,
                anime_type, episodes, average_rating, anime_year, season
           FROM anime WHERE mal_id = ? LIMIT 1`,
        [animeId]
      );

      if (rows.length) {
        anime = rows[0];
        const name = anime.title_en || anime.title || anime.title_jp || `Anime #${animeId}`;
        const synopsis = (anime.synopsis || '').replace(/\s+/g, ' ').trim();

        anime.name = name;
        anime.synopsisText = synopsis;
        anime.excerpt = synopsis.length > 300 ? synopsis.slice(0, 300).replace(/\s+\S*$/, '') + '…' : synopsis;

        try {
          const genres = await query(
            `SELECT m.genre_name AS name
               FROM anime_genre_link_table l
               JOIN master_genre m ON l.genre_id = m.unique_mal_id_for_genre
              WHERE l.anime_id = ?
              LIMIT 12`,
            [anime.id]
          );
          anime.genres = genres.map((g) => g.name).filter(Boolean);
        } catch (err) {
          anime.genres = [];
        }

        metaTitle = `${name} — Nikkilog`;
        metaDescription = synopsis ? synopsis.slice(0, 300) : `Details, tracking and reviews for ${name}.`;
        metaImage = anime.poster_image_url || null;

        // schema.org — this is what earns rich results in Google.
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'TVSeries',
          name,
          alternateName: anime.title_jp || undefined,
          description: synopsis ? synopsis.slice(0, 500) : undefined,
          image: anime.poster_image_url || undefined,
          url: `${config.baseUrl}/anime/${animeId}`,
          numberOfEpisodes: anime.episodes || undefined,
          genre: anime.genres && anime.genres.length ? anime.genres : undefined,
          inLanguage: 'ja',
          ...(anime.average_rating
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: Number(anime.average_rating),
                  bestRating: 10,
                  ratingCount: 1,
                },
              }
            : {}),
        };
      }
    } catch (err) {
      // database unavailable — fall back to the default preview
      console.error('anime meta lookup failed:', err.code || err.message);
    }

    res.render('anime', {
      animeId,
      userId,
      anime,
      jsonLd,
      metaTitle,
      metaDescription,
      metaImage,
      metaType: 'video.tv_show',
    });
  })
);

// GET /settings  (account + API tokens for the browser extension)
router.get('/settings', requireLogin, (req, res) => {
  res.render('settings');
});

// GET /mood/:slug -> a server-rendered "find anime by feeling" page.
// This is the page that answers a query no catalogue site can: nobody else
// collects how a show felt, so this list cannot be copied from anywhere.
router.get(
  '/mood/:slug([a-z]+)',
  asyncHandler(async (req, res) => {
    const mood = moods.get(req.params.slug);
    if (!mood) return res.status(404).send('Not Found');

    let list = [];
    try {
      list = await moods.animeForMood(mood.slug, 60);
    } catch (err) {
      console.error('mood page:', err.code || err.message);
    }

    res.render('mood', {
      mood,
      moods: moods.MOODS,
      list,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${mood.label} anime — Nikkilog`,
        description: `Anime that viewers describe as ${mood.label.toLowerCase()}: ${mood.blurb}`,
        url: `${config.baseUrl}/mood/${mood.slug}`,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: list.length,
          itemListElement: list.slice(0, 20).map((a, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${config.baseUrl}/anime/${a.mal_id}`,
            name: a.title,
          })),
        },
      },
      metaTitle: `${mood.label} anime — Nikkilog`,
      metaDescription: `Anime that viewers describe as ${mood.label.toLowerCase()}: ${mood.blurb}`,
    });
  })
);

// GET /mood-seed — a fast one-at-a-time flow for logging moods on everything
// you have already tracked. This is what fills the mood layer up.
router.get('/mood-seed', requireLogin, (req, res) => {
  res.render('mood_seed');
});

// GET /about and /privacy — plain-language pages. A public site that collects
// email addresses and republishes another site's catalogue should say so.
router.get('/about', (req, res) => {
  res.render('about', { contact: contactService.buildContact(config.contactTwitter) });
});

router.get('/privacy', (req, res) => {
  res.render('privacy', { contact: contactService.buildContact(config.contactTwitter) });
});

// GET /import — bring a MyAnimeList export across.
router.get('/import', requireLogin, (req, res) => {
  res.render('import');
});

// GET /events
router.get('/events', (req, res) => {
  res.render('events');
});

// GET /admin/promos  (manage events / announcements / sponsors)
router.get('/admin/promos', requireLogin, requireAdmin, (req, res) => {
  res.render('admin_promos');
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// GET /profile  (login required)
router.get(
  '/profile',
  requireLogin,
  asyncHandler(async (req, res) => {
    // Rendered on the server so the Overview tab has content immediately.
    // If the database hiccups the page still renders, with a note in that tab.
    let overview = null;
    try {
      overview = await overviewService.buildOverview(req.user.id, query);
    } catch (err) {
      console.error('Could not build the profile overview: ' + (err.message || err));
    }
    res.render('profile', { overview });
  })
);

// GET /api/context
router.get('/api/context', requireLogin, (req, res) => {
  res.json({
    user_id: req.user.id,
    is_admin: req.user.is_admin,
    anime_id: req.query.anime_id || null,
  });
});

module.exports = router;
