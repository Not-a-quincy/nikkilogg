'use strict';

const mysql = require('mysql2/promise');
const config = require('./env');

// Connection pool — the Express equivalent of the Flask app's
// mysql.connector connections (get_db_connection) plus SQLAlchemy.
const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Return DATETIME/DATE columns as JS Date objects (mirrors mysql.connector).
  dateStrings: false,
});

/**
 * Run a parameterised query. Use `?` placeholders.
 * @returns {Promise<Array>} rows (objects), like a MySQL "dictionary cursor".
 */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Run a query and return the raw result packet (for INSERT/UPDATE/DELETE,
 * where you need `insertId` or `affectedRows`).
 */
async function execute(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** Run several statements inside a transaction. */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Turn a raw MySQL error into a plain-English explanation + a suggested fix.
 */
function describeDbError(err) {
  // mysql2 sometimes wraps connection errors in an AggregateError; unwrap it.
  if (err && err.name === 'AggregateError' && Array.isArray(err.errors) && err.errors.length) {
    err = err.errors[0];
  }
  const code = err && (err.code || err.errno);
  const map = {
    ECONNREFUSED: 'MySQL refused the connection. The database server is probably not running on the host/port below.',
    ETIMEDOUT: 'Timed out reaching MySQL. Check the host and port, and any firewall.',
    ENOTFOUND: 'The database host name could not be resolved. Check DB_HOST.',
    EHOSTUNREACH: 'The database host is unreachable. Check DB_HOST and your network.',
    ER_ACCESS_DENIED_ERROR: 'MySQL rejected the username or password. Check DB_USER and DB_PASSWORD.',
    ER_DBACCESS_DENIED_ERROR: 'This user is not allowed to use that database. Check DB_NAME and the user\u2019s permissions.',
    ER_BAD_DB_ERROR: 'That database does not exist. Check DB_NAME.',
    ER_NO_SUCH_TABLE: 'Connected to MySQL, but a required table is missing. Is DB_NAME pointing at your Nikkilog database?',
    PROTOCOL_CONNECTION_LOST: 'The connection to MySQL dropped. Is the server still running?',
  };
  return {
    code: code || null,
    message: err && err.message ? err.message : String(err),
    hint: map[code] || 'Check your DB_* settings in the .env file and that MySQL is running.',
  };
}

module.exports = { pool, query, execute, withTransaction, describeDbError };

