'use strict';

/**
 * The numbers behind the profile Overview tab.
 *
 * Rendered on the server so the tab has content immediately, rather than showing
 * a spinner and then fetching. The shaping (rounding, percentages, formatting)
 * is separated from the query so it can be tested without a database.
 */

const STATUS_ORDER = ['watching', 'completed', 'on-hold', 'dropped', 'plan-to-watch'];

const STATUS_LABELS = {
  watching: 'Watching',
  completed: 'Completed',
  'on-hold': 'On hold',
  dropped: 'Dropped',
  'plan-to-watch': 'Plan to watch',
};

/** A watch time a person can read: minutes -> "3.2 days" / "5h 20m". */
function formatWatchTime(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (mins < 60) return mins + 'm';
  const hours = mins / 60;
  if (hours < 48) {
    const whole = Math.floor(hours);
    const rest = mins - whole * 60;
    return rest ? whole + 'h ' + rest + 'm' : whole + 'h';
  }
  const days = hours / 24;
  return (days < 10 ? days.toFixed(1) : String(Math.round(days))) + ' days';
}

function percent(part, total) {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((p / t) * 100)));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {number} userId
 * @param {Function} queryFn  (sql, params) => rows — injected so this is testable
 */
async function buildOverview(userId, queryFn) {
  const totals = await queryFn(
    `SELECT
        COUNT(*)                                        AS total,
        SUM(uat.status = 'watching')                    AS watching,
        SUM(uat.status = 'completed')                   AS completed,
        SUM(uat.status = 'on-hold')                     AS on_hold,
        SUM(uat.status = 'dropped')                     AS dropped,
        SUM(uat.status = 'plan-to-watch')               AS plan_to_watch,
        SUM(COALESCE(uat.current_episode, 0))           AS episodes,
        SUM(COALESCE(uat.current_episode, 0) *
            COALESCE(NULLIF(CAST(SUBSTRING_INDEX(a.duration, ' ', 1) AS UNSIGNED), 0), 24)) AS minutes,
        SUM(uat.user_rating > 0)                        AS scored,
        ROUND(AVG(NULLIF(uat.user_rating, 0)), 2)       AS mean_score
     FROM user_anime_tracking uat
     JOIN anime a ON uat.anime_id = a.id
     WHERE uat.user_id = ?`,
    [userId]
  );

  const r = (totals && totals[0]) || {};
  const total = num(r.total);
  const episodes = num(r.episodes);
  const minutes = num(r.minutes);

  const byStatus = STATUS_ORDER.map((key) => {
    const column = { 'on-hold': 'on_hold', 'plan-to-watch': 'plan_to_watch' }[key] || key;
    const count = num(r[column]);
    return {
      key,
      label: STATUS_LABELS[key],
      count,
      percent: percent(count, total),
    };
  });

  // The most recently touched entries — the "what was I doing?" list.
  const recentRows = await queryFn(
    `SELECT a.mal_id, a.title_en, a.title, a.title_jp, a.poster_image_url,
            uat.status, uat.current_episode, uat.user_rating, uat.updated_at
       FROM user_anime_tracking uat
       JOIN anime a ON uat.anime_id = a.id
      WHERE uat.user_id = ?
      ORDER BY uat.updated_at DESC
      LIMIT 6`,
    [userId]
  );

  const recent = (recentRows || []).map((row) => ({
    malId: row.mal_id,
    title: row.title_en || row.title || row.title_jp || 'Untitled',
    poster: row.poster_image_url || '',
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    episodes: num(row.current_episode),
    score: num(row.user_rating) || null,
  }));

  return {
    total,
    episodes,
    minutes,
    watchTime: formatWatchTime(minutes),
    meanScore: num(r.mean_score) ? Number(r.mean_score).toFixed(2) : null,
    scored: num(r.scored),
    byStatus,
    recent,
    // a small nudge on an empty list, rather than a wall of zeroes
    isEmpty: total === 0,
  };
}

module.exports = { buildOverview, formatWatchTime, percent, STATUS_ORDER, STATUS_LABELS };
