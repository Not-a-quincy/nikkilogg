'use strict';

const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { pool } = require('./config/db');
const { resilientStore } = require('./services/sessionStore');

const config = require('./config/env');
const { parseTrustProxy } = require('./config/env');
const { attachUser } = require('./middleware/auth');
const { securityHeaders, sameOrigin } = require('./middleware/security');

const pagesRouter = require('./routes/pages');
const authRouter = require('./routes/auth');
const healthRouter = require('./routes/health');
const promosRouter = require('./routes/promos');
const tokensRouter = require('./routes/tokens');
const seoRouter = require('./routes/seo');
const moodsRouter = require('./routes/moods');
const importRouter = require('./routes/import');
const animeRouter = require('./routes/anime');
const trackingRouter = require('./routes/tracking');
const favoritesRouter = require('./routes/favorites');
const recommendationsRouter = require('./routes/recommendations');
const themesRouter = require('./routes/themes');
const profileRouter = require('./routes/profile');
const { uploadErrorHandler } = require('./middleware/upload');
const commentsRouter = require('./routes/comments');
const adminRouter = require('./routes/admin');

const app = express();

// Behind nginx / a PaaS router, trust the proxy's forwarded headers.
//
// The value has to be typed correctly. Express reads a *string* as a
// comma-separated list of IP addresses or subnets — so the string "1" matches no
// address at all and the proxy is silently never trusted, which turns off HSTS
// and makes rate limiting see every visitor as the proxy. A bare number is a hop
// count and must be passed as a number.
const trustProxy = parseTrustProxy(config.trustProxy);
if (trustProxy !== null) app.set('trust proxy', trustProxy);

// --- Security headers + same-origin check for state-changing requests ---
app.use(securityHeaders);
app.use(sameOrigin);

// --- View engine (EJS, the closest analogue to Jinja2) ---
app.set('view engine', 'ejs');
app.set('views', config.viewsDir);

// --- Static assets ---
// Served at both `/` and `/static` so URLs already stored in the database
// (e.g. "/static/uploads/xyz.jpg") keep resolving.
app.use(express.static(config.publicDir));
app.use('/static', express.static(config.publicDir));

// --- Body parsers ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Sessions (replaces Flask-Login's session cookie) ---
// Sessions live in MySQL, so logins survive a restart and we never touch the
// filesystem (the file store raced on Windows and threw EPERM on rename).
let sessionStore;
try {
  sessionStore = new MySQLStore(
    {
      createDatabaseTable: true,
      clearExpired: true,
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: 30 * 24 * 60 * 60 * 1000,
      schema: {
        tableName: 'sessions',
        columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' },
      },
    },
    pool
  );
  sessionStore.on('error', (e) => console.error('Session store error:', e.code || e.message));
  sessionStore = resilientStore(sessionStore);
} catch (err) {
  console.error('Could not start the database session store:', err.message);
  console.error('Falling back to in-memory sessions — logins will not survive a restart.');
}

app.use(
  session({
    name: 'nikkilog.sid',
    secret: config.secretKey,
    store: sessionStore, // undefined falls back to express-session's memory store
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // HTTPS-only in production (COOKIE_SECURE overrides if needed)
      secure: config.cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

// --- Values every template can use (absolute URLs for share previews) ---
app.use((req, res, next) => {
  res.locals.siteUrl = config.baseUrl;
  res.locals.currentPath = req.originalUrl.split('?')[0];
  next();
});

// --- Load current user for every request (Flask-Login current_user) ---
app.use(attachUser);

// --- Routes ---
app.use('/api', authRouter); // /api/auth/register, /login, /logout, /me
app.use(healthRouter);
app.use('/api', promosRouter); // /api/promos + /api/admin/promos
app.use('/api', tokensRouter); // /api/tokens + /api/extension/*
app.use('/api', moodsRouter); // /api/mood + /api/mood/vote
app.use('/api', importRouter); // /api/import/preview + /api/import/apply
app.use(seoRouter); // /robots.txt + /sitemap.xml      // /api/health (self-diagnosis)
app.use(pagesRouter); // /, /login, /browse, /anime/:id, /profile, /logout, /api/context
app.use('/api', animeRouter);
app.use('/api', trackingRouter);
app.use('/api', favoritesRouter);
app.use('/api', recommendationsRouter);
app.use('/api', themesRouter);
app.use('/api', profileRouter);
app.use('/api', commentsRouter);
app.use(adminRouter); // /admin/reports...

// --- 404 ---
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(404).send('Not Found');
});

// --- Error handler ---
// eslint-disable-next-line no-unused-vars
// --- Upload errors become JSON, not a 500 ---
app.use(uploadErrorHandler);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  // The response may already be on its way (e.g. an error during streaming).
  // Hand it back to Express rather than trying to send a second response.
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({ error: 'An internal server error occurred.' });
  }
  return res.status(err.status || 500).send('An internal server error occurred.');
});

module.exports = app;
