# Learning SEO with this site

Deploying a real site is the *only* way to learn SEO — you cannot learn it on
localhost. This guide covers what the site now does, what it deliberately does
not, and the honest problem you will hit if you point a crawler at it.

---

## 1. The 20% I built (technical SEO)

These are table stakes. They are not what makes you rank, but their absence
makes everything else harder. All of it is tested in `tests/seo.test.js`.

**`/robots.txt`** — tells crawlers what to fetch and, more usefully, what to
ignore. `/api/`, `/settings`, `/admin/`, `/login`, `/register` and `/profile`
are excluded: they are either private or infinite. (An infinite crawl space —
like a URL that generates new pages from query strings forever — is called a
*crawl trap*, and it wastes your crawl budget.)

**`/sitemap.xml`** — a machine-readable list of every page worth indexing, built
from the catalogue. Google will find pages by following links, but a sitemap
tells it the whole set at once and is how you get new pages noticed quickly.

**Canonical URLs** — every page declares its one true address. Without this,
`/browse`, `/browse?category=all` and `/browse?page=2` can look like three
different pages with the same content, and the ranking signals get split between
them.

**Structured data (JSON-LD)** — schema.org markup in the page that describes
*what the page is*, not just what it says. Anime pages now declare `TVSeries`
with the episode count, genres and rating; the home page declares `WebSite`.
This is what earns rich results — the star ratings and episode counts you see in
search results. You can test any page with Google's Rich Results Test.

**Server-rendered content** — this was the big one. The anime pages used to be
empty shells: the title, synopsis and genres were fetched by JavaScript and
injected after load. Google *can* render JavaScript, but it is slower, it is a
second pass, and most other crawlers — and every social-media preview scraper —
do not run JS at all. The content is now in the HTML the server sends, and the
page script enhances it afterwards. Same page, same behaviour, but a crawler
sees a real document.

**One `<h1>` per page**, real `<a href>` links, and `alt` text on images.

### What is still missing, on purpose

- **No sitemap index.** A sitemap holds 50,000 URLs; above that you split into
  several and list them in an index file. Worth doing if your catalogue is huge.
- **No `hreflang`.** Only needed for multi-language sites.
- **No Core Web Vitals work.** The site is server-rendered with one small script
  per page, so it is probably fine — but measure it in PageSpeed Insights rather
  than assume.

---

## 2. The honest problem with *this* site

Here is the thing nobody tells you when they say "just build a site and learn
SEO": **the hard part is not technical. It is having something worth ranking.**

This catalogue is MyAnimeList's data. Every synopsis, score and episode count on
your pages already exists on MAL, AniList, Wikipedia, Fandom, IMDb, and several
hundred other sites. Google calls this **duplicate content**, and when a page has
no original value, there is no reason to rank it above the source it was copied
from. You will not outrank MAL for "Frieren synopsis" — and you shouldn't expect
to.

Worse, publishing thousands of near-identical pages built from someone else's
database edges towards what Google's spam policies call **scaled content abuse**
and **scraped content**. That is a manual-action risk, and it is exactly the
wrong lesson to learn from.

There is also the licensing question, which `README.md` covers: MAL's terms
restrict redistribution of their data.

**So if you deploy this as-is and try to rank it, you will mostly learn what
failure looks like.** That is a real lesson, but an expensive one.

---

## 3. The lesson that is actually worth learning

**SEO rewards unique value.** That is the whole discipline in one sentence.
Everything else — sitemaps, schema, page speed — is plumbing that makes a good
page easier to find.

And here is the useful part: your site *already has* a source of unique value.
It is the thing that made it different from MAL in the first place — the mood
field, the private notes, the reflection. Nobody else has that data, because
nobody else asked for it.

So the honest plan is not "index 12,000 anime pages". It is:

1. **Do not try to win head terms.** "best anime 2024" is a fight between
   MAL, Crunchyroll, Reddit and IGN. You will lose, and you will learn nothing
   from losing.
2. **Target long-tail queries** — the specific, low-competition, high-intent
   phrases. "anime like Frieren that are slow and quiet" is a real search that
   has a real answer and almost no competition. This is the single most
   transferable skill in SEO: *find the query where you can genuinely be the
   best result, then be it.*
3. **Write something only you can write.** Your reflection on episode 5 of a
   show, with the mood you logged — that is original content, and it is the only
   thing on the site a crawler cannot find elsewhere.
4. **Index selectively.** You do not have to submit everything. A site with 200
   genuinely good pages beats a site with 12,000 thin ones, and Google's
   behaviour will make that obvious to you within a few months.

---

## 3b. The mood layer — what was actually built

Everything above is plumbing. This is the part that answers a query nobody else
can, so it is worth understanding what makes it different.

Every other field on an anime page is a fact you can copy from MAL. **How a show
felt to the people who watched it is not a fact anyone else collects.** So:

- **`/mood/calm`, `/mood/emotional` and eleven more** are server-rendered pages
  listing titles ranked by what viewers actually logged. The titles, posters and
  vote counts are all in the HTML, each one a real `<a href>`, with
  `CollectionPage` + `ItemList` structured data.
- **A one-tap vote** on every anime page. No text box, no account wall to view,
  no effort. Cheap to give means it actually accumulates.
- **One vote per person per title**, so the aggregate cannot be stuffed.

Why this is the right shape for SEO, in three sentences. The query
*"anime that feel calm"* is real, and no catalogue site answers it, because
answering it requires data they don't have. You have it, and it grows every time
someone taps a button. The more people tap, the better your answer gets — which
is the one kind of advantage that compounds instead of decaying.

And the honest caveat: it starts empty. With no votes the mood pages show an
empty state and rank for nothing. That is not a bug, it is the cold start, and
the fix is the same as for any UGC — you are the first user. Log your own moods
for everything you have watched. A few hundred honest votes across the shows you
know well is enough to make the pages real.

## 4. How to actually run the experiment

**Before you start:**

1. Buy a domain. Everything below depends on owning it.
2. Deploy (see [DEPLOY.md](DEPLOY.md)) with `NODE_ENV=production` and HTTPS.
3. Set `BASE_URL` to your real `https://` address — the sitemap and canonicals
   are built from it, and wrong URLs there will quietly break everything.

**Then, in order:**

1. **Google Search Console** — verify the domain, submit `/sitemap.xml`.
2. **Bing Webmaster Tools** — same thing, five minutes, and it is a second
   dataset to learn from.
3. **Wait two weeks.** Nothing happens faster than that. This is the first
   lesson: SEO has a long feedback loop, and impatience is why most people quit
   before they learn anything.
4. **Read the Pages report.** How many pages are *indexed* vs *discovered*?
   "Discovered – currently not indexed" is Google telling you the pages are not
   worth the crawl. That is your duplicate-content problem, stated plainly.
5. **Look at the Performance report** — queries, impressions, clicks, average
   position. Sort by impressions with zero clicks: those are pages ranking on
   page two or three, and they are your easiest wins. Improve those first.
6. **Change one thing at a time** and note the date. SEO is an experiment, and
   if you change five things at once you learn nothing about any of them.

**What to watch over 3–6 months:** indexed page count, impressions trend,
average position, and click-through rate at a given position. Those four numbers
tell you almost everything.

---

## 5. What I would do next, in order

| # | Task | Why | Effort |
| --- | --- | --- | --- |
| 1 | Deploy with HTTPS and a real domain | Nothing works without it | One evening |
| 2 | Search Console + submit the sitemap | You are blind without it | 30 minutes |
| 3 | Log your own moods everywhere (the layer is built) | The only fix for duplicate content | Ongoing |
| 4 | Add internal links between related titles | Spreads authority, helps crawling | Small |
| 5 | Write ten genuinely good pages, not a thousand thin ones | Teaches you what ranking takes | Real work |
| 6 | Get one real backlink — a forum post, a Reddit comment, a friend's blog | Links are still the strongest signal | Hard |
| 7 | Measure, then improve your page-two pages | Highest return per hour | Ongoing |

**Item 5 is the whole game.** The rest is administration.

---

## 6. The one-sentence version

You cannot learn SEO from a sitemap; you learn it by publishing something that
deserves to rank, watching what Google does with it, and improving it. The
technical work in this repo is the easy half — and now it is done, so you can
spend your time on the half that actually matters.
