# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Instead, use GitHub's private reporting: go to the **Security** tab of this
repository and choose **Report a vulnerability**. If that is unavailable, email
the maintainer at **REPLACE-WITH-YOUR-EMAIL**.

Please include what you did, what happened, and how someone could abuse it.
You will get a reply as soon as possible. There is no bug bounty — this is a
hobby project — but you will be credited in the fix if you would like.

## What counts

- Authentication or session flaws (logging in as someone else, session fixation)
- SQL injection
- Cross-site scripting, or stored content that runs as script
- Anything that exposes another user's private data
- Path traversal in uploads
- Ways to bypass the rate limiting or the same-origin checks

## What does not

- Missing security headers on a deployment you configured yourself
- Findings that require an already-compromised machine or database
- Denial of service by simply sending a lot of traffic (there is no CDN here)

## How this project protects users

- Passwords are hashed with **scrypt** and a per-user salt, never stored or
  logged in plain text.
- Sessions are HTTP-only cookies, `SameSite=Lax`, and `Secure` in production.
- State-changing requests are checked against the request's origin.
- All database access uses parameterised queries.
- Login and registration are rate limited.
- In production the app **refuses to start** with a short secret key, a
  non-HTTPS `BASE_URL`, or insecure cookies.

## If you are running this yourself

- Set `NODE_ENV=production` and serve it over HTTPS — the app will then enforce
  the safety checks above.
- Never commit `.env`.
- Keep Node, MySQL and your dependencies up to date: `npm audit`.

## The session store contract

`src/services/sessionStore.js` wraps the MySQL session store so a database blip
degrades to in-memory sessions instead of a 500 on every request. It has caused
two login-breaking bugs, both now understood and covered by tests.

**Bug 1 — a hand-written interface.** The wrapper listed the store's methods by
hand and silently dropped `regenerate`, which broke every login with
`this.req.sessionStore.regenerate is not a function`. It now **proxies every
method the underlying store provides**, so it cannot drop part of the interface
again.

**Bug 2 — the wrong signature and the wrong target.** `regenerate` is easy to get
wrong, and the second attempt did:

- express-session calls it as **`regenerate(req, fn)`** with the *request*, not
  with a session id.
- Its base implementation then calls **`this.generate(req)`** — and `generate`
  is a function **express-session attaches to the store object it was handed**,
  which is this wrapper, *not* the underlying store.
- The MySQL store inherits that base `regenerate` but has no `generate` of its
  own, so delegating to it throws `self.generate is not a function`.

So the wrapper now implements `regenerate` itself: drop the old session from both
the database and memory, then call the `generate` that express-session attached,
which issues the fresh session id. That is the session-fixation defence, and
`tests/sessiontest.js` asserts the id actually changes — not merely that no error
is thrown.

**The testing lesson, which matters more than the fix.** The first test suite
passed while login was broken, because it used a *fake* store that implemented
`regenerate` properly — a fake more capable than the real thing. The suite now
builds a store shaped exactly like `express-mysql-session`'s (inherits the base
`regenerate`, defines no `generate`), so it fails when the real one would.

If you add a method to a store, you do not need to touch the wrapper.

## Dependencies and `npm audit`

Run it any time:

```bash
npm audit            # everything, including test tooling
npm run audit:prod   # only what a server actually installs
```

**`npm run audit:prod` reports zero vulnerabilities.** That is the number that
matters: `puppeteer-core` is a devDependency, so `npm ci --omit=dev` on a server
never installs it, and neither does anything it depends on.

**Do not run `npm audit fix --force` on this project.** npm's suggested fix here
is to *downgrade* two things: `express-mysql-session` to 2.1.8 (which breaks the
session store) and `puppeteer-core` to 19.8.3 (which breaks the UI tests). npm
picks the lowest version that satisfies an advisory, and older is not safer. It
would trade two working things for a clean-looking report.

### What is runtime and what is not

`npm ci --omit=dev` — what a server actually installs — is clean:

```
dotenv  ejs  express  express-mysql-session  express-session  multer  mysql2  node-cache
```

Everything else the audit reports is under **`puppeteer-core`**, which is a
**devDependency**. It drives a headless Chrome for the UI test suites. It is
never installed in production and never runs on a server.

As of this writing `npm audit` reports 9 advisories, all of them in that chain
(`basic-ftp`, `get-uri`, `pac-proxy-agent`, `proxy-agent`, `@puppeteer/browsers`,
`chromium-bidi`, `extract-zip`, `zod`, `puppeteer-core`). Every one requires you
to point your *test tooling* at a hostile server — a malicious FTP host, a
malicious zip, a malicious proxy. That is not a realistic threat for a local
test run.

**If you want them gone anyway**, `puppeteer-core@25.16.0` fixes all nine. It
requires **Node ≥ 22.12**, so bump `engines.node` in `package.json` at the same
time:

```bash
npm install -D puppeteer-core@^25.16.0
```

We stay on 23.x because it runs on Node 20, which keeps the project easier to
contribute to.

### The mysql2 override

`express-mysql-session` pins `mysql2` to one exact version (3.10.2), which is
older than the patched releases, so npm installed a second, vulnerable copy
nested inside it. The `overrides` block in `package.json` forces that nested copy
up to the same patched version as the top-level one:

```json
"overrides": { "express-mysql-session": { "mysql2": "$mysql2" } }
```

`$mysql2` means "whatever version the direct dependency uses", so the two can
never drift apart. The two advisories this closes both required a hostile
database server to exploit — unlikely with a local MySQL, but worth closing.

**If the session store ever misbehaves** (logins failing oddly, sessions not
saving), the first thing to try is removing that `overrides` block and running
`npm install`. It is the only place in this project where a dependency is forced
against what its parent asked for.
