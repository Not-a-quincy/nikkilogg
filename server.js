'use strict';

const app = require('./src/app');
const config = require('./src/config/env');
const { ensureSchema } = require('./src/config/schema');
const { query, describeDbError } = require('./src/config/db');

/**
 * Check the database on boot and say plainly what's wrong if it can't connect.
 * Runs in the background so the server still starts either way.
 */
async function checkDatabase() {
  try {
    await query('SELECT 1');
    const changes = await ensureSchema();
    if (changes.length) console.log('Schema updated:', changes.join(', '));
    console.log('Database: connected.');
  } catch (err) {
    const d = describeDbError(err);
    console.warn('');
    console.warn('  Could not reach the database.');
    console.warn('');
    console.warn(`  Reason : ${d.message}${d.code ? `  (${d.code})` : ''}`);
    console.warn(`  Likely : ${d.hint}`);
    console.warn('  Check  : DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in your .env file');
    console.warn(`  Detail : open http://127.0.0.1:${config.port}/api/health`);
    console.warn('');
    console.warn('  The site will still load, but anything needing data will fail until this is fixed.');
    console.warn('');
  }
}

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Nikkilog (Express) listening on http://127.0.0.1:${config.port}`);
  console.log('Sign-in: email + password  (/login and /register)');
  checkDatabase();
});
