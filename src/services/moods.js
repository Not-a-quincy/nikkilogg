'use strict';

const { query, execute } = require('../config/db');

/**
 * Moods — the one kind of content on this site that exists nowhere else.
 *
 * Every other field on an anime page is a fact you can copy from MAL. How a
 * show *felt* to the people who watched it is not a fact anyone else collects,
 * so the aggregate is original data by construction.
 *
 * The vocabulary matches the mood picker already used on the tracking list, so
 * a user's private mood and the public vote mean the same thing.
 */

// How many moods one person may attach to a single title.
const MAX_MOODS = 4;

const MOODS = [
  { slug: 'happy', label: 'Happy', blurb: 'Bright, warm and good-natured.' },
  { slug: 'calm', label: 'Calm', blurb: 'Slow, quiet and unhurried.' },
  { slug: 'thrilling', label: 'Thrilling', blurb: 'Tense, fast and hard to stop watching.' },
  { slug: 'emotional', label: 'Emotional', blurb: 'It gets you. Bring tissues.' },
  { slug: 'thoughtful', label: 'Thoughtful', blurb: 'Ideas and questions that linger.' },
  { slug: 'funny', label: 'Funny', blurb: 'Light, silly and genuinely amusing.' },
  { slug: 'mystery', label: 'Mysterious', blurb: 'Puzzles, suspense and things unsaid.' },
  { slug: 'inspiring', label: 'Inspiring', blurb: 'Leaves you wanting to do something.' },
  { slug: 'dark', label: 'Dark', blurb: 'Heavy, serious and unflinching.' },
  { slug: 'adventure', label: 'Adventurous', blurb: 'Journeys, scale and momentum.' },
  { slug: 'romantic', label: 'Romantic', blurb: 'Sweet, tender and a little aching.' },
  { slug: 'magical', label: 'Magical', blurb: 'Whimsical, strange and wonderful.' },
  { slug: 'nostalgic', label: 'Nostalgic', blurb: 'It feels like somewhere you have been.' },
];

const BY_SLUG = new Map(MOODS.map((m) => [m.slug, m]));

function isValid(slug) {
  return BY_SLUG.has(String(slug || '').toLowerCase());
}

function get(slug) {
  return BY_SLUG.get(String(slug || '').toLowerCase()) || null;
}

/** One vote per person per title — people can change their mind, not stuff the box. */
async function vote(userId, malId, moodSlug, deps) {
  const run = (deps && deps.query) || query;
  const write = (deps && deps.execute) || execute;
  if (!isValid(moodSlug)) throw new Error('Unknown mood.');
  const rows = await run('SELECT id FROM anime WHERE mal_id = ? LIMIT 1', [malId]);
  if (!rows.length) throw new Error('Unknown anime.');
  const animeId = rows[0].id;

  // Tapping a mood you already picked removes it, so the chips toggle.
  const existing = await run(
    'SELECT id FROM mood_votes WHERE user_id = ? AND anime_id = ? AND mood = ? LIMIT 1',
    [userId, animeId, moodSlug]
  );
  if (existing.length) {
    await write('DELETE FROM mood_votes WHERE id = ?', [existing[0].id]);
    return { mal_id: malId, mood: moodSlug, action: 'removed' };
  }

  const counted = await run(
    'SELECT COUNT(*) AS c FROM mood_votes WHERE user_id = ? AND anime_id = ?',
    [userId, animeId]
  );
  if (Number(counted[0] && counted[0].c) >= MAX_MOODS) {
    const err = new Error('You can pick up to ' + MAX_MOODS + ' moods for a title. Tap one to remove it first.');
    err.code = 'MOOD_LIMIT';
    err.limit = MAX_MOODS;
    throw err;
  }

  // INSERT IGNORE: two rapid taps cannot create a duplicate row.
  await write(
    'INSERT IGNORE INTO mood_votes (user_id, anime_id, mood) VALUES (?, ?, ?)',
    [userId, animeId, moodSlug]
  );
  return { mal_id: malId, mood: moodSlug, action: 'added' };
}

/** What people felt about one title. */
async function forAnime(malId, userId, deps) {
  const run = (deps && deps.query) || query;
  const empty = { total: 0, voters: 0, distribution: [], top: null, mine: [], max: MAX_MOODS, remaining: MAX_MOODS };
  let rows;
  try {
    rows = await run('SELECT id FROM anime WHERE mal_id = ? LIMIT 1', [malId]);
  } catch (err) {
    // database unreachable — an empty aggregate beats a 500
    return empty;
  }
  if (!rows.length) return empty;
  const animeId = rows[0].id;

  const counts = await run(
    `SELECT mood, COUNT(*) AS c
       FROM mood_votes WHERE anime_id = ?
      GROUP BY mood ORDER BY c DESC`,
    [animeId]
  );
  const total = counts.reduce((sum, r) => sum + Number(r.c), 0);

  // One person can now pick several moods, so a share has to be measured
  // against the number of people — otherwise the bars would sum past 100%.
  const voterRows = await run(
    'SELECT COUNT(DISTINCT user_id) AS v FROM mood_votes WHERE anime_id = ?',
    [animeId]
  );
  const voters = Number(voterRows[0] && voterRows[0].v) || 0;

  const distribution = counts.map((r) => {
    const meta = get(r.mood) || { slug: r.mood, label: r.mood };
    return {
      slug: meta.slug,
      label: meta.label,
      count: Number(r.c),
      pct: voters ? Math.round((Number(r.c) / voters) * 100) : 0,
    };
  });

  let mine = [];
  if (userId) {
    const own = await run(
      'SELECT mood FROM mood_votes WHERE user_id = ? AND anime_id = ? ORDER BY id ASC',
      [userId, animeId]
    );
    mine = own.map((r) => r.mood);
  }

  return {
    total,
    voters,
    distribution,
    top: distribution[0] || null,
    mine,
    max: MAX_MOODS,
    remaining: Math.max(0, MAX_MOODS - mine.length),
  };
}

/**
 * Titles the crowd most associates with a mood — the "find anime by feeling"
 * list, which is the query no catalogue site can answer.
 */
async function animeForMood(slug, limit = 60) {
  if (!isValid(slug)) return [];
  const rows = await query(
    `SELECT a.mal_id, a.title_en, a.title, a.title_jp, a.poster_image_url,
            a.average_rating, a.anime_year, a.episodes,
            COUNT(*) AS votes
       FROM mood_votes v
       JOIN anime a ON a.id = v.anime_id
      WHERE v.mood = ?
      GROUP BY a.id
      ORDER BY votes DESC, a.average_rating DESC
      LIMIT ?`,
    [slug, limit]
  );
  return rows.map((r) => ({
    mal_id: r.mal_id,
    title: r.title_en || r.title || r.title_jp,
    poster: r.poster_image_url,
    rating: r.average_rating,
    year: r.anime_year,
    episodes: r.episodes,
    votes: Number(r.votes),
  }));
}

/** How many votes exist in total — used to decide whether the layer is live yet. */
async function totalVotes() {
  const rows = await query('SELECT COUNT(*) AS c FROM mood_votes');
  return Number(rows[0].c || 0);
}

/**
 * The seeding queue: everything this person has tracked but not yet given a
 * mood. Filling this in is what turns the mood pages from an empty state into
 * an answer, and it is the one job only the site owner can do.
 */
async function queue(userId, limit = 40) {
  try {
    return await query(
      `SELECT a.mal_id, a.title_en, a.title, a.title_jp, a.poster_image_url,
              a.average_rating, a.anime_year, t.status, t.current_episode
         FROM user_anime_tracking t
         JOIN anime a ON a.id = t.anime_id
         LEFT JOIN mood_votes v ON v.anime_id = a.id AND v.user_id = t.user_id
        WHERE t.user_id = ? AND v.id IS NULL
        ORDER BY t.id DESC
        LIMIT ?`,
      [userId, limit]
    ).then((rows) => rows.map((r) => ({
      mal_id: r.mal_id,
      title: r.title_en || r.title || r.title_jp,
      poster: r.poster_image_url,
      rating: r.average_rating,
      year: r.anime_year,
      status: r.status,
      progress: r.current_episode,
    })));
  } catch (err) {
    return [];
  }
}

/** How many moods this person has logged, for the progress readout. */
async function myCount(userId) {
  try {
    const rows = await query('SELECT COUNT(*) AS c FROM mood_votes WHERE user_id = ?', [userId]);
    return Number(rows[0].c || 0);
  } catch (err) {
    return 0;
  }
}

module.exports = { MOODS, MAX_MOODS, get, isValid, vote, forAnime, animeForMood, totalVotes, queue, myCount };
