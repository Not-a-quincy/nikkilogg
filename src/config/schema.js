'use strict';

const { query, execute } = require('./db');
const usernames = require('../services/username');

/**
 * Tiny, idempotent startup migration. Safe to run on every boot.
 *
 *  - adds `users.password_hash` (email + password sign-in)
 *  - creates the `promos` table (events / announcements / sponsors)
 */

async function columnExists(table, column) {
  const rows = await query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(table, index) {
  const rows = await query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

async function tableExists(table) {
  const rows = await query(
    `SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}


// Columns the app reads or writes on `users`. Older databases (from the Flask
// version) may not have all of them, so we add whatever is missing on boot.
const USER_COLUMNS = [
  ['username', 'VARCHAR(80) NULL'],
  ['email', 'VARCHAR(255) NULL'],
  ['display_name', 'VARCHAR(80) NULL'],
  ['password_hash', 'VARCHAR(255) NULL'],
  // Recovery codes: the only way back into an account with no email address.
  // Two of them, each usable once. `recovery_hash` keeps its name so codes issued
  // before the second slot existed still work.
  ['recovery_hash', 'VARCHAR(255) NULL'],
  ['recovery_hash_2', 'VARCHAR(255) NULL'],
  ['recovery_created_at', 'DATETIME NULL'],
  ['country', 'VARCHAR(80) NULL'],
  ['state', 'VARCHAR(80) NULL'],
  ['bio', 'TEXT NULL'],
  ['profile_pic', 'VARCHAR(500) NULL'],
  ['bg_image', 'VARCHAR(500) NULL'],
  ['is_admin', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['is_early_user', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['created_at', 'DATETIME NULL'],
  ['last_login_at', 'DATETIME NULL'],
  ['profile_last_updated', 'DATETIME NULL'],
  ['updated_at', 'DATETIME NULL'],
];

async function ensureSchema() {
  const applied = [];

  if (!(await tableExists('users'))) {
    applied.push('WARNING: no users table found — is DB_NAME pointing at the right database?');
    return applied;
  }

  for (const [column, definition] of USER_COLUMNS) {
    if (!(await columnExists('users', column))) {
      await execute(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
      applied.push('added users.' + column);
    }
  }

  if (!(await tableExists('mood_votes'))) {
    await execute(`
      CREATE TABLE mood_votes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        anime_id INT NOT NULL,
        mood VARCHAR(32) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_mood_per_user (user_id, anime_id, mood),
        INDEX idx_mood_anime (anime_id, mood),
        INDEX idx_mood_only (mood)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    applied.push('created mood_votes table');
  }

  // Up to four moods per title are allowed now, so the original
  // (user_id, anime_id) unique key has to widen. Existing rows were unique on
  // the pair, so they are also unique on the triple — nothing can collide.
  if (await tableExists('mood_votes')) {
    if (await indexExists('mood_votes', 'uniq_mood_vote')) {
      await execute('ALTER TABLE mood_votes DROP INDEX uniq_mood_vote');
      applied.push('mood_votes: lifted the one-mood-per-title limit');
    }
    if (!(await indexExists('mood_votes', 'uniq_mood_per_user'))) {
      await execute(
        'ALTER TABLE mood_votes ADD UNIQUE KEY uniq_mood_per_user (user_id, anime_id, mood)'
      );
      applied.push('mood_votes: one row per mood, up to four per title');
    }
  }

  if (!(await tableExists('api_tokens'))) {
    await execute(`
      CREATE TABLE api_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(80) NULL,
        token_hash CHAR(64) NOT NULL,
        prefix VARCHAR(16) NOT NULL,
        last_used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME NULL,
        UNIQUE KEY uniq_token_hash (token_hash),
        INDEX idx_token_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    applied.push('created api_tokens table');
  }

  // ---------------------------------------------------------------------------
  // Usernames are the login key now, so every account needs one and it needs an
  // index. Without the index the live availability check is a full table scan on
  // every keystroke, which is the whole reason it has to be indexed.
  // ---------------------------------------------------------------------------
  if ((await tableExists('users')) && (await columnExists('users', 'username'))) {
    const blanks = await query(
      `SELECT id, email, display_name FROM users
        WHERE username IS NULL OR username = '' ORDER BY id`
    );

    if (blanks.length) {
      const takenRows = await query(
        `SELECT username FROM users WHERE username IS NOT NULL AND username <> ''`
      );
      const taken = new Set(takenRows.map((r) => String(r.username).toLowerCase()));
      let filled = 0;

      for (const row of blanks) {
        // Derive from the email, then the display name, then the id. This fills a
        // blank rather than overwriting anything, so no data is lost.
        const seed = usernames.normalise(
          String(row.email || '').split('@')[0] || row.display_name || 'user' + row.id
        ).replace(/[^a-z0-9_-]/g, '') || 'user' + row.id;

        let candidate = seed;
        let n = 2;
        while (taken.has(candidate) || !usernames.validate(candidate).ok) {
          candidate = (seed + n).slice(0, usernames.MAX_LENGTH);
          n += 1;
          if (n > 200) break;
        }
        await execute('UPDATE users SET username = ? WHERE id = ?', [candidate, row.id]);
        taken.add(candidate);
        filled += 1;
      }
      applied.push(`users: gave ${filled} account(s) a username so they can log in`);
    }

    // Email is no longer collected, so the column has to accept NULL or the
    // insert will fail. Making a column nullable never breaks existing rows.
    const emailCol = await query(
      `SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email' LIMIT 1`
    );
    if (emailCol.length && emailCol[0].nullable === 'NO') {
      await execute('ALTER TABLE users MODIFY email VARCHAR(255) NULL');
      applied.push('users: email is optional now that usernames are the login key');
    }

    const dupes = await query(
      `SELECT LOWER(username) AS u, COUNT(*) AS c FROM users
        WHERE username IS NOT NULL AND username <> ''
        GROUP BY LOWER(username) HAVING c > 1`
    );

    if (dupes.length) {
      applied.push(
        `WARNING: ${dupes.length} duplicated username(s): ${dupes.map((d) => d.u).join(', ')} — ` +
          'resolve these, then re-run npm run migrate to add the unique index.'
      );
    } else if (!(await indexExists('users', 'uniq_username'))) {
      await execute('ALTER TABLE users ADD UNIQUE KEY uniq_username (username)');
      applied.push('users: unique index on username (keeps the live availability check fast)');
    }
  }

  if (!(await tableExists('anime_staff'))) {
    await execute(
      `CREATE TABLE anime_staff (
        id INT AUTO_INCREMENT PRIMARY KEY,
        anime_id INT NOT NULL,
        person_mal_id INT NOT NULL,
        person_name VARCHAR(160) NOT NULL,
        person_url VARCHAR(255) NULL,
        image_url VARCHAR(255) NULL,
        positions VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_anime_staff (anime_id, person_mal_id),
        INDEX idx_staff_anime (anime_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    applied.push('created anime_staff table');
  }

  if (!(await tableExists('promos'))) {
    await execute(`
      CREATE TABLE promos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kind VARCHAR(20) NOT NULL DEFAULT 'event',
        title VARCHAR(160) NOT NULL,
        subtitle VARCHAR(255) NULL,
        body TEXT NULL,
        date_label VARCHAR(80) NULL,
        url VARCHAR(500) NULL,
        image_url VARCHAR(500) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_kind_active (kind, active, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    applied.push('created promos table');
  }

  return applied;
}

module.exports = { ensureSchema };
