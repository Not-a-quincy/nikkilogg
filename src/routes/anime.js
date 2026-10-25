'use strict';

const express = require('express');
const { query } = require('../config/db');
const staffService = require('../services/staff');
const animeApi = require('../services/animeApi');
const { store: cacheStore } = require('../services/cache');
const { asyncHandler } = require('../services/util');
const { cacheJson, cachedText } = require('../services/cache');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/anime  — paginated, filterable anime list
// (mirrors the Flask get_anime endpoint; cached 10 min)
// ---------------------------------------------------------------------------
router.get(
  '/anime',
  cacheJson(600),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 48;
    const offset = (page - 1) * limit;

    const animeTypeFilter = req.query.type;
    const animeStatusFilter = req.query.sort; // status filter
    const animeOrderBy = req.query.order_by; // sort column
    const genresFilter = req.query.genres;
    const themesFilter = req.query.themes;
    const yearFilter = req.query.year;
    const seasonFilter = req.query.season;
    const excludeGenresFilter = req.query.exclude_genres;
    const excludeThemesFilter = req.query.exclude_themes;

    function parseIntList(raw, label) {
      if (!raw) return [];
      const list = [];
      for (const part of String(raw).split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const n = Number(trimmed);
        if (!Number.isInteger(n)) {
          throw Object.assign(new Error(`Invalid ${label} ID(s) provided. Must be integers.`), {
            status: 400,
          });
        }
        list.push(n);
      }
      return list;
    }

    let genresList, themesList, excludeGenresList, excludeThemesList;
    try {
      genresList = parseIntList(genresFilter, 'genre');
      themesList = parseIntList(themesFilter, 'theme');
      excludeGenresList = parseIntList(excludeGenresFilter, 'exclude genre');
      excludeThemesList = parseIntList(excludeThemesFilter, 'exclude theme');
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }

    const ALLOWED_SORT_COLUMNS = {
      popularity: 'popularity ASC',
      average_rating: 'average_rating DESC',
      members: 'members DESC',
      favorites: 'favorites DESC',
      anime_rank: 'anime_rank ASC',
    };

    const orderByClause = ALLOWED_SORT_COLUMNS[animeOrderBy] || 'popularity ASC';
    const [sortColumnName, sortDirection] = orderByClause.split(' ');

    const mainJoins = [];
    const mainWhereConditions = [];
    const mainParams = [];

    const searchQuery = (req.query.search || '').trim();
    if (searchQuery) {
      mainWhereConditions.push('(anime.title LIKE ? OR anime.title_en LIKE ? OR anime.title_jp LIKE ?)');
      const likePattern = `%${searchQuery}%`;
      mainParams.push(likePattern, likePattern, likePattern);
    }

    if (genresList.length) {
      if (genresList.length === 1) {
        mainJoins.push('INNER JOIN anime_genre_link_table aglt ON anime.id = aglt.anime_id');
        mainJoins.push('INNER JOIN master_genre mg ON aglt.genre_id = mg.unique_mal_id_for_genre');
        mainWhereConditions.push('mg.unique_mal_id_for_genre = ?');
        mainParams.push(genresList[0]);
      } else {
        const genrePlaceholders = genresList.map(() => '?').join(',');
        const genreSubquery = `
          (SELECT aglt.anime_id
          FROM anime_genre_link_table aglt
          INNER JOIN master_genre mg ON aglt.genre_id = mg.unique_mal_id_for_genre
          WHERE mg.unique_mal_id_for_genre IN (${genrePlaceholders})
          GROUP BY aglt.anime_id
          HAVING COUNT(DISTINCT mg.unique_mal_id_for_genre) = ?) AS filtered_genres
        `;
        mainJoins.push(`INNER JOIN ${genreSubquery} ON anime.id = filtered_genres.anime_id`);
        mainParams.push(...genresList, genresList.length);
      }
    }

    // --- Exclusion filters ---
    if (excludeGenresList.length) {
      const placeholders = excludeGenresList.map(() => '?').join(',');
      mainJoins.push(`
        LEFT JOIN anime_genre_link_table aglt_ex ON anime.id = aglt_ex.anime_id AND aglt_ex.genre_id IN (${placeholders})
      `);
      mainWhereConditions.push('aglt_ex.genre_id IS NULL');
      mainParams.push(...excludeGenresList);
    }

    if (excludeThemesList.length) {
      const placeholders = excludeThemesList.map(() => '?').join(',');
      mainJoins.push(`
        LEFT JOIN anime_theme_link_table atlt_ex ON anime.id = atlt_ex.anime_id AND atlt_ex.theme_id IN (${placeholders})
      `);
      mainWhereConditions.push('atlt_ex.theme_id IS NULL');
      mainParams.push(...excludeThemesList);
    }

    if (themesList.length) {
      const placeholders = themesList.map(() => '?').join(',');
      mainJoins.push('INNER JOIN anime_theme_link_table atlt ON anime.id = atlt.anime_id');
      mainJoins.push('INNER JOIN master_theme mt ON atlt.theme_id = mt.unique_mal_id_for_theme');
      mainWhereConditions.push(`mt.unique_mal_id_for_theme IN (${placeholders})`);
      mainParams.push(...themesList);
    }

    if (animeTypeFilter) {
      mainWhereConditions.push('anime.anime_type = ?');
      mainParams.push(animeTypeFilter);
    }
    if (animeStatusFilter) {
      mainWhereConditions.push('anime.status = ?');
      mainParams.push(animeStatusFilter);
    }
    if (yearFilter) {
      mainWhereConditions.push('anime.anime_year = ?');
      mainParams.push(yearFilter);
    }
    if (seasonFilter) {
      mainWhereConditions.push('LOWER(anime.season) = ?');
      mainParams.push(String(seasonFilter).toLowerCase());
    }

    const mainWhereClause = mainWhereConditions.length
      ? `WHERE ${mainWhereConditions.join(' AND ')}`
      : '';

    const malIdQueryBase = `
      SELECT DISTINCT anime.mal_id, anime.${sortColumnName}
      FROM anime
      ${mainJoins.join(' ')}
      ${mainWhereClause}
      ORDER BY anime.${sortColumnName} ${sortDirection}
    `;
    const malIdQuery = `${malIdQueryBase} LIMIT ? OFFSET ?`;
    const malIdParams = [...mainParams, limit, offset];

    const orderedRows = await query(malIdQuery, malIdParams);
    const orderedMalIds = orderedRows.map((r) => r.mal_id);

    const totalCountQuery = `
      SELECT COUNT(DISTINCT anime.mal_id) AS total_count
      FROM anime
      ${mainJoins.join(' ')}
      ${mainWhereClause}
    `;
    const totalCountRows = await query(totalCountQuery, mainParams);
    const totalAnimeCount = totalCountRows[0].total_count;

    if (!orderedMalIds.length) {
      let message = 'No anime found.';
      if (animeTypeFilter || animeStatusFilter || genresList.length || themesList.length || searchQuery) {
        message = 'No anime found matching the selected filters.';
      }
      return res.json({
        anime: [],
        total_anime_count: totalAnimeCount,
        page,
        limit,
        message,
      });
    }

    const formatStrings = orderedMalIds.map(() => '?').join(',');

    const detailedQuery = `
      SELECT
        anime.mal_id,
        anime.title_en,
        anime.title_jp,
        anime.synopsis,
        anime.episodes,
        anime.status,
        anime.start_date,
        anime.poster_image_url,
        anime.average_rating,
        anime.end_date,
        anime.airing,
        anime.duration,
        anime.favorites,
        anime.members,
        anime.popularity,
        anime.anime_rank,
        anime.rating,
        anime.scored_by,
        anime.season,
        anime.anime_source,
        anime.title,
        anime.anime_type,
        anime.url,
        anime.anime_year,
        anime.kitsu_poster_image_url,
        anime.kitsu_cover_image_url,
        kitsu_synopsis,
        anime.id AS internal_anime_id,
        master_demographics.unique_mal_id_for_demographics AS demographic_mal_id,
        master_demographics.demographics_name AS demographic_name,
        master_genre.unique_mal_id_for_genre AS genre_mal_id,
        master_genre.genre_name AS genre_name,
        master_theme.unique_mal_id_for_theme AS theme_mal_id,
        master_theme.theme_name AS theme_name,
        master_explicit_genre.unique_mal_id_for_explicit_genre AS explicit_genre_mal_id,
        master_explicit_genre.explicit_genre_name AS explicit_genre_name,
        master_studio.unique_mal_id_for_studio AS studio_mal_id,
        master_studio.studio_name AS studio_name,
        master_producer.unique_mal_id_for_producer AS producer_mal_id,
        master_producer.producer_name AS producer_name,
        master_licensor.unique_mal_id_for_licensor AS licensor_mal_id,
        master_licensor.licensor_name AS licensor_name
      FROM anime
      LEFT JOIN anime_demographics_link_table ON anime.id = anime_demographics_link_table.anime_id
      LEFT JOIN master_demographics ON anime_demographics_link_table.demographics_id = master_demographics.unique_mal_id_for_demographics
      LEFT JOIN anime_genre_link_table ON anime.id = anime_genre_link_table.anime_id
      LEFT JOIN master_genre ON anime_genre_link_table.genre_id = master_genre.unique_mal_id_for_genre
      LEFT JOIN anime_theme_link_table ON anime.id = anime_theme_link_table.anime_id
      LEFT JOIN master_theme ON anime_theme_link_table.theme_id = master_theme.unique_mal_id_for_theme
      LEFT JOIN explicit_genre_anime_link_table ON anime.id = explicit_genre_anime_link_table.anime_id
      LEFT JOIN master_explicit_genre ON explicit_genre_anime_link_table.explicit_genre_id = master_explicit_genre.unique_mal_id_for_explicit_genre
      LEFT JOIN anime_studio_link_table ON anime.id = anime_studio_link_table.anime_id
      LEFT JOIN master_studio ON anime_studio_link_table.studio_id = master_studio.unique_mal_id_for_studio
      LEFT JOIN anime_producer_link_table ON anime.id = anime_producer_link_table.anime_id
      LEFT JOIN master_producer ON anime_producer_link_table.producer_id = master_producer.unique_mal_id_for_producer
      LEFT JOIN anime_licensor_link_table ON anime.id = anime_licensor_link_table.anime_id
      LEFT JOIN master_licensor ON anime_licensor_link_table.licensor_id = master_licensor.unique_mal_id_for_licensor
      WHERE anime.mal_id IN (${formatStrings})
      ORDER BY FIELD(anime.mal_id, ${formatStrings})
    `;
    const detailedParams = [...orderedMalIds, ...orderedMalIds];

    const rawAnimeData = await query(detailedQuery, detailedParams);

    const animeMap = {};
    for (const row of rawAnimeData) {
      const animeMalId = row.mal_id;
      if (!(animeMalId in animeMap)) {
        const base = {};
        for (const key of [
          'mal_id', 'title_en', 'title_jp', 'synopsis', 'episodes', 'status', 'start_date',
          'poster_image_url', 'average_rating', 'end_date', 'airing', 'duration', 'favorites',
          'members', 'popularity', 'anime_rank', 'rating', 'scored_by', 'season', 'anime_source',
          'title', 'anime_type', 'url', 'anime_year', 'internal_anime_id',
        ]) {
          base[key] = row[key];
        }
        animeMap[animeMalId] = Object.assign(base, {
          demographics: [], genre: [], theme: [], explicit_genre: [],
          studio: [], producer: [], licensor: [],
        });
      }

      const appendUnique = (key, info) => {
        if (!info) return;
        const list = animeMap[animeMalId][key];
        if (!list.some((x) => x.name === info.name && x.mal_id === info.mal_id)) {
          list.push(info);
        }
      };

      if (row.demographic_name && row.demographic_mal_id != null)
        appendUnique('demographics', { name: row.demographic_name, mal_id: row.demographic_mal_id });
      if (row.genre_name && row.genre_mal_id != null)
        appendUnique('genre', { name: row.genre_name, mal_id: row.genre_mal_id });
      if (row.theme_name && row.theme_mal_id != null)
        appendUnique('theme', { name: row.theme_name, mal_id: row.theme_mal_id });
      if (row.explicit_genre_name && row.explicit_genre_mal_id != null)
        appendUnique('explicit_genre', { name: row.explicit_genre_name, mal_id: row.explicit_genre_mal_id });
      if (row.studio_name && row.studio_mal_id != null)
        appendUnique('studio', { name: row.studio_name, mal_id: row.studio_mal_id });
      if (row.producer_name && row.producer_mal_id != null)
        appendUnique('producer', { name: row.producer_name, mal_id: row.producer_mal_id });
      if (row.licensor_name && row.licensor_mal_id != null)
        appendUnique('licensor', { name: row.licensor_name, mal_id: row.licensor_mal_id });
    }

    // --- Favorites: add is_favorited to each anime ---
    let userFavoritesSet = new Set();
    if (req.user) {
      const favRows = await query('SELECT anime_id FROM user_favorites WHERE user_id = ?', [req.user.id]);
      userFavoritesSet = new Set(favRows.map((r) => r.anime_id));
    }

    const orderedAnimeList = [];
    for (const malId of orderedMalIds) {
      const animeObj = animeMap[malId];
      animeObj.is_favorited = false;
      if (req.user && userFavoritesSet.has(animeObj.internal_anime_id)) {
        animeObj.is_favorited = true;
      }

      animeObj.user_status = null;
      if (req.user) {
        const statusRows = await query(
          'SELECT status FROM user_anime_tracking WHERE user_id = ? AND anime_id = ?',
          [req.user.id, animeObj.internal_anime_id]
        );
        if (statusRows.length && statusRows[0].status) {
          animeObj.user_status = statusRows[0].status;
        }
      }
      orderedAnimeList.push(animeObj);
    }

    return res.json({
      anime: orderedAnimeList,
      total_anime_count: totalAnimeCount,
      page,
      limit,
      message: 'Anime data fetched successfully.',
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/anime/search_titles — typeahead title search
// ---------------------------------------------------------------------------
router.get(
  '/anime/search_titles',
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ anime: [] });
    }
    const searchPattern = `%${q}%`;
    const results = await query(
      `SELECT id, mal_id, title_en, title_jp, title, poster_image_url
       FROM anime
       WHERE title_en LIKE ? OR title_jp LIKE ? OR title LIKE ?
       ORDER BY popularity DESC
       LIMIT 10`,
      [searchPattern, searchPattern, searchPattern]
    );
    return res.json({ anime: results });
  })
);

// ---------------------------------------------------------------------------
// GET /api/anime/:mal_id — single anime with all relations (cached 10 min)
// ---------------------------------------------------------------------------
router.get(
  '/anime/:mal_id(\\d+)',
  cacheJson(600),
  asyncHandler(async (req, res) => {
    const malId = parseInt(req.params.mal_id, 10);
    const rows = await query('SELECT * FROM anime WHERE mal_id = ?', [malId]);
    if (!rows.length) {
      return res.status(404).json({ message: `Anime with MAL ID ${malId} not found in our database.` });
    }
    const animeData = rows[0];
    const internalAnimeId = animeData.id;

    async function fetchLinked(table, masterTable, fkCol, idCol, nameCol, outKey) {
      if (!internalAnimeId) {
        animeData[outKey] = [];
        return;
      }
      try {
        animeData[outKey] = await query(
          `SELECT m.${nameCol} AS ${nameCol}, m.${idCol} AS mal_id
           FROM ${table} l
           JOIN ${masterTable} m ON l.${fkCol} = m.${idCol}
           WHERE l.anime_id = ?`,
          [internalAnimeId]
        );
      } catch (err) {
        console.error(`Warning: Could not fetch ${outKey} for anime ID ${malId}: ${err.message}`);
        animeData[outKey] = [];
      }
    }

    await fetchLinked('anime_genre_link_table', 'master_genre', 'genre_id',
      'unique_mal_id_for_genre', 'genre_name', 'genres');
    await fetchLinked('anime_producer_link_table', 'master_producer', 'producer_id',
      'unique_mal_id_for_producer', 'producer_name', 'producers');
    await fetchLinked('anime_studio_link_table', 'master_studio', 'studio_id',
      'unique_mal_id_for_studio', 'studio_name', 'studios');
    await fetchLinked('anime_licensor_link_table', 'master_licensor', 'licensor_id',
      'unique_mal_id_for_licensor', 'licensor_name', 'licensors');
    await fetchLinked('anime_theme_link_table', 'master_theme', 'theme_id',
      'unique_mal_id_for_theme', 'theme_name', 'themes');
    await fetchLinked('anime_demographics_link_table', 'master_demographics', 'demographics_id',
      'unique_mal_id_for_demographics', 'demographics_name', 'demographics');
    await fetchLinked('explicit_genre_anime_link_table', 'master_explicit_genre', 'explicit_genre_id',
      'unique_mal_id_for_explicit_genre', 'explicit_genre_name', 'explicit_genres');

    return res.json(animeData);
  })
);

// ---------------------------------------------------------------------------
// GET /api/anime-statistics/:mal_id — community status/score distribution
// ---------------------------------------------------------------------------
router.get(
  '/anime-statistics/:mal_id(\\d+)',
  asyncHandler(async (req, res) => {
    const malId = parseInt(req.params.mal_id, 10);
    const animeRows = await query('SELECT id FROM anime WHERE mal_id = ?', [malId]);
    if (!animeRows.length) {
      return res.status(404).json({ message: 'Anime not found.' });
    }
    const animeId = animeRows[0].id;

    const statusRows = await query(
      `SELECT status, COUNT(*) AS count FROM user_anime_tracking WHERE anime_id = ? GROUP BY status`,
      [animeId]
    );
    const statusCounts = {};
    for (const row of statusRows) statusCounts[row.status] = row.count;

    const scoreRows = await query(
      `SELECT user_rating, COUNT(*) AS count
       FROM user_anime_tracking
       WHERE anime_id = ? AND user_rating IS NOT NULL
       GROUP BY user_rating
       ORDER BY user_rating`,
      [animeId]
    );
    const scoreCounts = {};
    for (const row of scoreRows) scoreCounts[String(row.user_rating)] = row.count;

    const scoreListRows = await query(
      `SELECT user_rating FROM user_anime_tracking WHERE anime_id = ? AND user_rating IS NOT NULL`,
      [animeId]
    );
    const allScores = scoreListRows.map((r) => r.user_rating);

    return res.json({ status_counts: statusCounts, score_counts: scoreCounts, all_scores: allScores });
  })
);

// ---------------------------------------------------------------------------
// GET /api/seasons/now — current-season anime (cached 1 hour)
// ---------------------------------------------------------------------------
router.get(
  '/seasons/now',
  cacheJson(3600),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    let season;
    if (month >= 1 && month <= 3) season = 'winter';
    else if (month >= 4 && month <= 6) season = 'spring';
    else if (month >= 7 && month <= 9) season = 'summer';
    else season = 'fall';

    const animeList = await query(
      `SELECT a.mal_id,
              MAX(a.title_en) AS title_en,
              MAX(a.title_jp) AS title_jp,
              MAX(a.title) AS title,
              MAX(a.poster_image_url) AS poster_image_url,
              MAX(a.synopsis) AS synopsis,
              GROUP_CONCAT(DISTINCT mg.genre_name) AS genres
       FROM anime a
       LEFT JOIN anime_genre_link_table aglt ON a.id = aglt.anime_id
       LEFT JOIN master_genre mg ON aglt.genre_id = mg.unique_mal_id_for_genre
       WHERE a.anime_year = ? AND LOWER(a.season) = ?
       GROUP BY a.mal_id
       ORDER BY MAX(a.popularity) ASC
       LIMIT 24`,
      [year, season]
    );

    for (const anime of animeList) {
      anime.genres = anime.genres ? anime.genres.split(',') : [];
    }

    return res.json({ year, season, anime: animeList });
  })
);

// ---------------------------------------------------------------------------
// GET /api/anime/:mal_id/relations — watch order / related anime
// ---------------------------------------------------------------------------
router.get(
  '/anime/:mal_id(\\d+)/relations',
  asyncHandler(async (req, res) => {
    const malId = parseInt(req.params.mal_id, 10);
    const sourceRows = await query('SELECT id FROM anime WHERE mal_id = ?', [malId]);
    if (!sourceRows.length) {
      return res.status(404).json({ error: 'Anime with the given MAL ID not found.' });
    }
    const sourceAnimeId = sourceRows[0].id;

    const relations = await query(
      `SELECT
         mrt.relation_type_name AS relation_type,
         related_anime.mal_id,
         related_anime.title_en,
         related_anime.title_jp,
         related_anime.poster_image_url,
         related_anime.anime_type,
         related_anime.status,
         related_anime.anime_year,
         related_anime.episodes
       FROM anime_relationship ar
       JOIN master_relation_type mrt ON ar.relation_type_id = mrt.id
       JOIN anime AS related_anime ON ar.target_anime_id = related_anime.id
       WHERE ar.source_anime_id = ?`,
      [sourceAnimeId]
    );

    return res.json({ relations });
  })
);

// ---------------------------------------------------------------------------
// GET /api/anime/:mal_id/staff — production staff
// Staff was never in the catalogue, so it is fetched on first view and stored.
// ---------------------------------------------------------------------------
router.get(
  '/anime/:mal_id(\\d+)/staff',
  asyncHandler(async (req, res) => {
    const malId = parseInt(req.params.mal_id, 10);

    const found = await query('SELECT id FROM anime WHERE mal_id = ?', [malId]);
    if (!found.length) return res.json({ staff: [], source: 'unknown-anime' });

    const result = await staffService.getStaff(found[0].id, malId, {
      query,
      fetchStaff: animeApi.animeStaff,
      cache: cacheStore,
    });

    res.json({ staff: result.staff, source: result.source });
  })
);

// ---------------------------------------------------------------------------
// GET /api/anime/:mal_id/characters/full — characters + voice actors
// ---------------------------------------------------------------------------
router.get(
  '/anime/:mal_id(\\d+)/characters/full',
  asyncHandler(async (req, res) => {
    const malId = parseInt(req.params.mal_id, 10);

    const rows = await query(
      `SELECT
          characters.mal_id AS character_mal_id,
          characters.name AS character_name,
          characters.favorites,
          characters.name_kanji,
          characters.nicknames,
          characters.about,
          ag.anime_mal_id,
          ag.anime_url,
          ag.anime_title,
          ag.role AS anime_role,
          ag.anime_image_url,
          img.image_url_webp_small,
          cva.person_mal_id,
          cva.person_url,
          cva.person_name,
          cva.language,
          cva.image_url AS person_image_url
       FROM characters
       LEFT JOIN character_animeography AS ag ON characters.mal_id = ag.character_mal_id
       LEFT JOIN character_images AS img ON characters.mal_id = img.character_mal_id
       LEFT JOIN character_voice_actors AS cva ON characters.mal_id = cva.character_mal_id
       WHERE ag.anime_mal_id = ?`,
      [malId]
    );

    const grouped = {};
    for (const row of rows) {
      const charId = row.character_mal_id;
      if (!(charId in grouped)) {
        grouped[charId] = {
          character_mal_id: row.character_mal_id,
          character_name: row.character_name,
          nicknames: row.nicknames,
          kanji_katakana: row.name_kanji,
          about: row.about,
          favorites: row.favorites,
          anime_mal_id: row.anime_mal_id,
          anime_url: row.anime_url,
          anime_title: row.anime_title,
          anime_role: row.anime_role,
          anime_image_url: row.anime_image_url,
          image_url_webp_small: row.image_url_webp_small,
          voice_actors: [],
        };
      }
      if (row.person_name && row.language) {
        const vaKey = `${row.person_name}:${row.language}`;
        const existing = grouped[charId].voice_actors;
        if (!existing.some((va) => `${va.name}:${va.language}` === vaKey)) {
          existing.push({
            name: row.person_name,
            image_url: row.person_image_url,
            language: row.language,
            profile_url: row.person_url,
            person_mal_id: row.person_mal_id,
          });
        }
      }
    }

    return res.json({ characters: Object.values(grouped) });
  })
);

// ---------------------------------------------------------------------------
// GET /api/va/:person_id/roles — all roles for a voice actor
// ---------------------------------------------------------------------------
router.get(
  '/va/:person_id(\\d+)/roles',
  asyncHandler(async (req, res) => {
    const personId = parseInt(req.params.person_id, 10);
    const rows = await query(
      `SELECT
          characters.mal_id AS character_mal_id,
          characters.name AS character_name,
          character_voice_actors.person_mal_id,
          character_voice_actors.person_name,
          character_voice_actors.language,
          character_animeography.anime_mal_id AS anime_mal_id,
          anime.title_en AS anime_title,
          anime.poster_image_url AS anime_image
       FROM characters
       LEFT JOIN character_voice_actors ON characters.mal_id = character_voice_actors.character_mal_id
       LEFT JOIN character_animeography ON characters.mal_id = character_animeography.character_mal_id
       LEFT JOIN anime ON anime.mal_id = character_animeography.anime_mal_id
       WHERE character_voice_actors.person_mal_id = ?
       ORDER BY anime.title_en`,
      [personId]
    );
    const roles = rows.filter((r) => r.anime_mal_id != null);
    return res.json(roles);
  })
);

// ---------------------------------------------------------------------------
// GET /api/news — proxy Anime News Network RSS (cached 30 min)
// ---------------------------------------------------------------------------
router.get(
  '/news',
  asyncHandler(async (req, res) => {
    try {
      const text = await cachedText('news:ann', 1800, async () => {
        const r = await fetch('https://www.animenewsnetwork.com/all/rss.xml', {
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) throw new Error(`ANN responded ${r.status}`);
        return r.text();
      });
      res.set('Content-Type', 'application/rss+xml');
      res.set('Cache-Control', 'public, max-age=1800');
      return res.send(text);
    } catch (err) {
      console.error('Error fetching ANN news:', err.message);
      return res.status(500).type('text/xml').send('<error>Could not fetch news</error>');
    }
  })
);

module.exports = router;
