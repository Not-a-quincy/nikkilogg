# Contributing to Nikkilog

Thanks for wanting to help. This guide is written for people who are **not**
full-time developers — if something here is unclear, that is a bug in this
document, so please open an issue about it.

---

## First, one thing to read

Nikkilog started as a personal project and was ported to Node/Express from an
earlier Flask version. Before contributing, please read the
**Provenance and licensing** section of the [README](README.md). In short:

- The **code** here is MIT licensed (see [LICENSE](LICENSE)).
- The **anime data** comes from MyAnimeList and is **not** part of this
  repository. Do not commit database dumps, scraped data, or `.env` files.
- If you did not write the code you are contributing, say where it came from in
  the pull request.

---

## What this project is

A self-hosted anime tracker: browse a catalogue, track what you watch, rate it,
write reflections, and see your own statistics. It is deliberately a *personal*
tool rather than a social network — see the "What this is not" section of the
README before proposing large features, because a few things (a forum, an
algorithmic feed) are explicitly out of scope.

---

## Getting set up

You need **Node 20 or newer** and **MySQL 8** (or MariaDB 10.6+).

```bash
git clone https://github.com/YOUR-USERNAME/nikkilog-express.git
cd nikkilog-express
npm install
```

Create your config:

```bash
cp .env.example .env
```

Fill in at least:

```
SECRET_KEY=<any long random string>
DB_USER=<your mysql user>
DB_PASSWORD=<your mysql password>
DB_NAME=anime_tracker_db
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then either let the helper find your database, or import a dump:

```bash
npm run setup-db                     # asks for your password, writes .env
npm run import-db -- backup.sql      # restore a dump
npm start                            # http://127.0.0.1:5000
```

The tables the app needs (`promos`, `sessions`) and any missing `users` columns
are created automatically on first boot.

---

## Running the tests

```bash
npm test
```

That runs every suite. You can also run one:

```bash
npm test -- pagecheck
```

**You do not need a database.** The suites deliberately assert how the app
behaves when the database is *unreachable*, so a clean checkout with no MySQL
still passes.

**You do not need a browser.** The UI suites use whatever Chrome is already
installed; if none is found they print `SKIP` and count as passing. To point
them at a specific browser:

```bash
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome npm test
```

### The suites

| Suite | What it covers |
| --- | --- |
| `smoke` | Every page returns the right status and contains its key markup |
| `sessiontest` | The session store, including the database-down fallback |
| `dbtest` | The database setup helper: argument parsing, `.env` quoting |
| `authtest` | Register / login / logout, password rules, rate limiting |
| `csscheck` | Every stylesheet is served |
| `browsecheck` | Card hover behaviour, overlay scroll, card sizing |
| `animecheck` | The detail page renders from API data (hero, sidebar, charts) |
| `pagecheck` | Every page loads with no JavaScript errors and no overflow |
| `searchcheck` | The search overlay opens and the list reset applies |
| `profilecheck` | Profile grids, thumbnails, track cards and chart sizing |

**Add a test with your change.** If you fix a bug, the test should fail before
your fix and pass after. That is the single most valuable thing you can
contribute, because it stops the bug coming back.

---

## Project layout

```
server.js              entry point: database check, then listen
src/
  app.js               Express app: middleware, routes, error handling
  config/              env loading, database pool, startup migration
  middleware/          auth, security headers, uploads
  routes/              one file per feature area
  services/            password hashing, caching, session store, helpers
views/                 EJS templates (+ partials/ for the shared chrome)
public/
  css/tokens.css       the shared design system — start here for styling
  js/                  one script per page
tests/                 the suites above
```

Styling: every page loads `tokens.css` plus one page stylesheet. Shared
components (buttons, cards, tabs, empty states) live in `tokens.css`; put
page-specific rules in the page's own file.

---

## Picking something to work on

The [README roadmap](README.md#roadmap) lists what is missing, roughly in order
of value. Issues labelled **`good first issue`** are scoped to be a safe place
to start.

The four that would help most:

1. **Password reset** — needs an email sender (SMTP or an API like Resend).
2. **Airing calendar and notifications** — tell people when a new episode drops.
3. **MAL import/export** — so someone can move their existing list in.
4. **Deeper list fields** — rewatch counts, start/finish dates, tags, priority.

If you want to work on something big, **open an issue first** so we can agree on
the shape before you write a lot of code.

---

## Code style

There is no linter to fight. Just match what is around you:

- 2-space indent, semicolons, single quotes.
- `'use strict';` at the top of every file.
- Name things in plain English — this codebase is read by people who are
  learning, so clarity beats cleverness.
- Comment *why*, not *what*. A comment explaining a workaround is gold; a
  comment restating the next line is noise.
- Keep functions small and files focused.

**Security rules, no exceptions:** never commit credentials, never put secrets in
client-side code, always parameterise SQL (use `?` placeholders), and escape
anything from a user before it reaches HTML.

---

## Sending a pull request

1. Fork the repository and create a branch: `git checkout -b fix-card-overlap`.
2. Make your change, with tests.
3. Run `npm test` — it must pass.
4. If you changed the UI, include a screenshot in the pull request.
5. Open the PR and fill in the template.

Write commit messages in the imperative mood: `Fix card overlay capturing
scroll`, not `fixed the thing`. Small, focused PRs get reviewed much faster than
large ones.

A maintainer will get back to you. If a PR goes quiet, a polite nudge is
completely fine — nobody is ignoring you on purpose.

---

## Reporting a bug

Open an issue with the template. The two things that make a bug report
actionable:

1. **What you did** — exact steps.
2. **What happened** — the error text from your terminal or the browser console,
   and a screenshot if it is visual.

Please do not open a public issue for a security problem — see
[SECURITY.md](SECURITY.md) instead.
