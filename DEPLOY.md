# Putting Nikkilog online

A practical guide. Read the first section before you spend any money — it lists
what genuinely has to change, and one question only you can answer.

---

## Keeping the catalogue fresh

`npm run update-anime` pulls the current season from Jikan and adds only what is
missing. It is a dry run by default; `--apply` writes. Add it to cron if you want
it automatic — but note that **Jikan is a volunteer-run service** and asks for
gentle use (roughly 3 requests a second), which the client already throttles to.
Once a week is plenty.

Be aware of what this means for the provenance question below: every refresh
pulls more of the same unlicensed data in. That is a reason to keep this personal
and non-commercial, not a reason to stop crediting anyone.

## 0d. Filling a gap in the catalogue

`npm run update-anime` asks the API for **the season currently airing**. In
October 2026 that is Fall 2026 — so a title that finished in Winter, Spring or
Summer 2026 is not in that answer, and re-running the command never picks it up.
It looks broken. It is not; it is asking a narrower question than you think.

To backfill, fetch whole years:

```
npm run update-anime:year            # show what the whole current year would add
npm run update-anime:year:apply      # insert it
node scripts/update-anime.js --year 2025,2026 --apply
node scripts/update-anime.js --year 2024-2026
```

That walks every season of each year (winter, spring, summer, fall) and collapses
the repeats, because a two-cour show is listed in both the season it started and
the one it ran into. The run prints a per-season count so you can see what came
back rather than guessing.

Expect it to take a while: four seasons is roughly twenty-odd API pages at the
configured rate limit. Use `--apply` only once you have looked at the dry run.

The fetching lives in `src/services/animeFetch.js`, deliberately separate from
the HTTP client (`animeApi.js`) and the database writer (`animeUpdate.js`).

## 0c. The reset policy (decide this before you have users)

**Never reset a password because someone asked.**

Nothing verifies who is asking. Anyone can claim to be anyone, so a reset on
request hands the account to whoever asked. There is now a proper path instead:

- **Signed in** — they change it themselves on `/settings`.
- **Forgotten it** — they use a recovery code at `/recover`. Each account gets
  **two** 16-digit codes, shown once at signup, stored hashed, and each is
  consumed on use. The endpoint allows five attempts an hour.
- **Lost both codes** — the account cannot be recovered. Say so plainly.

Using one code does **not** invalidate the other, so an attacker who recovers an
account with one code cannot lock the real owner out — the owner uses the spare
and changes the password.

`npm run set-password` remains for recovering **your own** account, not a support
tool. Existing accounts have no recovery code until one is generated on
`/settings`.

`npm run set-password` is for recovering **your own** account, not a support tool.

## 0b. After you migrate: usernames

`npm run migrate` now does one thing it did not do before — it **writes to your
`users` table**. Accounts with no username are given one, derived from their
email, then their display name, then their id. It fills a blank; it never
overwrites a value. It also reports any duplicated usernames instead of merging
them, and only adds the unique index when there are none.

If you had an account before this change, your username is whatever the migration
derived — run `npm run set-password` with no arguments to list every account and
its username.

## 0a. The production config that must be right

Four settings decide whether production behaves correctly. Getting any of them
wrong fails quietly rather than loudly:

```env
NODE_ENV=production
BASE_URL=https://yourdomain.com     # must be the real https address
SECRET_KEY=<64 hex characters>      # npm run gen-secret
COOKIE_SECURE=true
```

`BASE_URL` is the one people miss. The sitemap, every canonical URL and every
share preview are built from it, so if it still says `127.0.0.1` you have
published a sitemap pointing at localhost.

`TRUST_PROXY` matters if you deploy behind a reverse proxy (nginx, or most PaaS
routers). It defaults to on in production, and it must be a **hop count as a
number**. Express reads a string value as a list of IP addresses, so a string
`"1"` trusts nothing — HSTS never fires and rate limiting sees every visitor as
the proxy. `parseTrustProxy` in `src/config/env.js` types it correctly, and
`tests/proxy.test.js` proves HSTS arrives behind an HTTPS proxy.

## 0. What the site says about itself (do this first)

A public site that collects email addresses and republishes another site's
catalogue should say so plainly, in the product, not just in a repo. Three
things now do that, and all of them are tested:

- **`/about`** — what Nikkilog is, why it exists, who runs it, and explicitly
  what it is *not* (not a company, not affiliated with MyAnimeList, not a
  streaming service, not a community site).
- **`/privacy`** — what is stored (email, a scrypt hash, your list, your moods),
  what is never done with it (no ads, no analytics, no selling), the single
  session cookie, and how to have everything deleted.
- **The footer, on every page** — a standing attribution to MyAnimeList and a
  non-affiliation notice.

**Set `CONTACT_TWITTER` in `.env`.** Both pages show the handle and link to it.
No email address is published anywhere — the tests assert that.

### About the MyAnimeList data — read this honestly

Crediting the source is the right thing to do, and it is the *only* use of
MyAnimeList's name their developer agreement permits. But be clear-eyed:

**Attribution is not a licence.** Saying "data from MyAnimeList" does not grant
permission to republish their content. MyAnimeList's own Terms of Use say you
agree "not to collate or aggregate any of the content available through the
Service for use elsewhere", and that scraping or extraction is not allowed
without prior written consent. Their API agreement likewise permits use only for
developing applications that talk to their API, not for rebuilding their
catalogue elsewhere.

So the honest position is:

- **Credit them, prominently.** It is truthful and it is required by their terms
  as the only sanctioned use of their marks.
- **Do not claim to be licensed by them**, and do not imply endorsement.
- **Non-commercial matters.** A personal project with no ads and no revenue sits
  very differently from a monetised one. If you ever add ads, subscriptions or
  affiliate links, revisit this — their agreement explicitly calls out
  applications becoming commercial.
- **Have a removal route and honour it immediately.** `/about` promises this.
  Keep the promise.
- **If they ask you to stop, stop.** They can revoke access and require you to
  destroy the material.

None of this is legal advice, and the pages say as much. If this ever becomes
more than a personal project, talk to a lawyer rather than to me.

### An import that skips a few titles

The import matches on MAL id, so anything not already in the catalogue is
reported rather than dropped. Add those titles, then import again:

```bash
npm run add-anime 52991 20 30
```

Expect a handful on any list — the catalogue was built from one API walk, so
specials, OVAs and older entries are the usual gaps.

### The metadata source moved (important)

**Jikan's public API was discontinued on 1 October 2026.** `api.jikan.moe` no
longer answers, which is why `npm run update-anime` failed with a network error.
That was not a fault in your setup.

The updater now defaults to **Tenrai** (`https://api.tenrai.org/v1`), the
drop-in successor: same paths, same `{ pagination, data }` envelope, same
`mal_id` and field names. The base URL is configurable:

```env
ANIME_API_BASE_URL=https://api.tenrai.org/v1
```

Check it any time:

```bash
npm run update-anime:check
```

On Windows, prefer the aliases (`update-anime:check`, `update-anime:apply`,
`update-anime:upcoming`) over flags. PowerShell reads a leading `--` as its
decrement operator and refuses to parse the line before npm ever runs. Anything
not covered by an alias can be called directly: `node scripts/update-anime.js
--season 2026/fall`.

That reports the source, DNS, and an actual request, in that order, so a failure
tells you which step broke. If Tenrai is ever unavailable, point this at a
self-hosted Jikan instance or anything else speaking the same schema — no code
change needed.

### Where the catalogue actually came from

Worth writing down, because it changes nothing about the above but everything
about how carefully to treat it. The script that built this catalogue
(`populate_anime_db.py`) fetches from **Jikan**, and new titles now come from
**Tenrai**. Both are unofficial, community-run APIs that read MyAnimeList. So the
chain is: MyAnimeList → a volunteer-run proxy → this database.

Two consequences:

- **The attribution to MyAnimeList is correct**, but the proxy in the middle is
also owed a mention if you are being precise about provenance. It is run by
volunteers and asks for rate-limited use.
- **This is a scrape of a scrape.** It is not licensed data at any point in the
  chain. For a personal project that changes little; for anything public it makes
  the position weaker rather than stronger, and it is another reason not to
  monetise without revisiting this.

The mood data is a different matter — it is generated by users here and is not
copied from anyone. That is the part of the site with no such question hanging
over it.

## 1. Before you go public

These are not "nice to have". Each one will bite you on the day a stranger
signs up.

| # | Problem | Why it matters | Status |
| --- | --- | --- | --- |
| 1 | **No password reset** | Anyone who forgets their password is locked out forever, and only you can fix it from the command line. Needs an email sender. | Not built |
| 2 | **Sessions in the database** | Fine — but the `sessions` table grows forever unless expired rows are cleared. Handled automatically. | Done |
| 3 | **HTTPS + secure cookies** | Without HTTPS, passwords travel in clear text. The app now refuses to start in production without an `https://` URL and a long secret key. | Done |
| 4 | **Uploads on local disk** | Profile pictures live in `public/uploads`. They vanish on redeploy unless that folder is a mounted volume. | Config ready |
| 5 | **Backups** | One MySQL with no backups is one bad day from losing everything. | Your job |
| 6 | **Moderation** | You have a reports queue and no one to work it. One report queue for one admin is fine — for a public site it is not. | Your call |
| 7 | **Legal** | Your data came from MyAnimeList, whose terms restrict scraping and redistribution. Also: a public site that collects emails needs a privacy policy. | **Decide first** |

**The question only you can answer:** do you want a *public site with strangers
on it*, or a *personal site you can reach from anywhere*?

If it's the second — which is honestly what this app is built for — you can skip
almost all of the above. Put it behind a login, don't let anyone register, and
you have a private diary reachable from your phone. That is a weekend job.

If it's the first, do items 1, 5 and 7 before you announce anything.

---

## 2. What it costs

| Item | Typical price | Notes |
| --- | --- | --- |
| Domain | ₹900–1,200 / year | `.com`. Cloudflare Registrar sells at cost. |
| VPS | ₹350–600 / month | Hetzner (~€4.5), Contabo, DigitalOcean (~$6). |
| Managed MySQL | ₹500–1,500 / month | Skip it — run MySQL on the VPS instead. |
| Email sending | Free tier | Resend / Brevo: a few thousand emails a month free. |
| Cloudflare | Free | DNS, CDN, DDoS protection, SSL. |
| Backups | ₹100–200 / month | Object storage (Backblaze B2, S3). |

**Realistic total: ₹500–1,000 per month plus the domain.**

A free PaaS tier exists but usually sleeps the app after inactivity — bad for a
site people actually use.

---

## 3. Path A — VPS with Docker (recommended, least fiddly)

You need a VPS running Ubuntu 22.04 or 24.04 and a domain pointing at it.

**1. Point your domain at the server.** In Cloudflare (or your registrar), add an
`A` record for `nikkilog.yourdomain.com` → your server's IP.

**2. Log in and install Docker.**

```bash
ssh root@YOUR_SERVER_IP

curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
```

**3. Get the code onto the server.** From your own machine:

```bash
scp nikkilog-express.zip root@YOUR_SERVER_IP:/root/
```

Then on the server:

```bash
cd /root
apt install -y unzip
unzip nikkilog-express.zip
cd nikkilog-express
```

**4. Create the config.**

```bash
cp .env.example .env
nano .env
```

Set these — everything else can stay as it is:

```
NODE_ENV=production
BASE_URL=https://nikkilog.yourdomain.com
SECRET_KEY=<paste a long random string>
DB_USER=nikkilog
DB_PASSWORD=<a strong password>
DB_NAME=anime_tracker_db
MYSQL_ROOT_PASSWORD=<another strong password>
```

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**5. Start it.**

```bash
docker compose up -d
docker compose logs -f app
```

You should see `Nikkilog (Express) listening on http://127.0.0.1:5000` and
`Database: connected.` The database and the `sessions` / `promos` tables are
created on first boot.

**6. Put nginx and HTTPS in front.**

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/nikkilog`:

```nginx
server {
    listen 80;
    server_name nikkilog.yourdomain.com;

    client_max_body_size 12M;   # allow profile picture uploads

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and get a certificate:

```bash
ln -s /etc/nginx/sites-available/nikkilog /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d nikkilog.yourdomain.com
```

Certbot edits the config for you and renews automatically. Open
`https://nikkilog.yourdomain.com` — you're live.

**7. Firewall.**

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Note that port 5000 is bound to `127.0.0.1` only — it is not reachable from the
internet, which is what you want.

---

## 4. Path B — VPS without Docker

Same idea, no containers.

```bash
apt update && apt install -y nginx mysql-server unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
```

Create the database and a user:

```bash
mysql -u root -p
```

```sql
CREATE DATABASE anime_tracker_db CHARACTER SET utf8mb4;
CREATE USER 'nikkilog'@'localhost' IDENTIFIED BY 'a-strong-password';
GRANT ALL PRIVILEGES ON anime_tracker_db.* TO 'nikkilog'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Then:

```bash
cd /root/nikkilog-express
cp .env.example .env && nano .env     # NODE_ENV=production, DB_USER=nikkilog, ...
npm ci --omit=dev
pm2 start ecosystem.config.js
pm2 save && pm2 startup                # survive a reboot
```

Use the same nginx + certbot steps as Path A.

---

## 5. Path C — a PaaS (fastest, least control)

Render, Railway or Fly.io. Roughly:

1. Push the project to a **private** GitHub repository (never commit `.env`).
2. Create a new Web Service from the repo.
3. Add a managed MySQL database from the same provider.
4. Set the environment variables from `.env.example` in the dashboard —
   `NODE_ENV=production`, `BASE_URL`, `SECRET_KEY`, and the `DB_*` values the
   provider gives you.
5. Build command `npm ci --omit=dev`, start command `node server.js`.
6. Attach your domain and let the provider issue the certificate.

The catch: managed MySQL is the expensive part, and the free tiers sleep. For a
personal diary this is overkill; for a real public site it saves you the
server administration.

---

## 6. Backups

A VPS with one MySQL and no backups is a disaster waiting to happen. The
simplest thing that works:

```bash
mkdir -p /root/backups
crontab -e
```

Add:

```
0 3 * * * docker exec nikkilog-express-db-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" anime_tracker_db' | gzip > /root/backups/nikkilog-$(date +\%F).sql.gz
```

That writes a compressed dump every night at 3am. Copy them off the server
periodically (Backblaze B2 and S3 cost pennies), and **test a restore once** —
an untested backup is not a backup.

Also back up `public/uploads/`, which holds your users' pictures.

---

## 7. After it's live

- Set `NODE_ENV=production` — the app then refuses to start with an insecure
  config, which is exactly what you want.
- Watch the logs on the first real sign-up: `docker compose logs -f app`.
- Set up a free uptime monitor (UptimeRobot, Better Stack) pointed at
  `/api/health`. It returns the database status too.
- If the site grows past a few hundred users, the in-memory rate limiter and the
  response cache stop being correct across multiple instances — that's the point
  to move them to Redis.

---

## 8. The honest summary

Your app is deployable today. What it is **not** is a site you can open to
strangers, because of password reset and the data question.

- **Personal diary reachable anywhere** → Path A, close registration, done this
  weekend.
- **Public site** → build password reset with an email provider, write a privacy
  policy, settle the MyAnimeList data question, then deploy.
