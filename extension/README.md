# Nikkilog Sync — browser extension

Logs what you watch to **your own** Nikkilog tracker, from any streaming site.
Silently. No pop-ups, no dialogs, nothing that interrupts playback.

## Why this exists

MAL-Sync and friends sync to *hosted* services — MyAnimeList, AniList, Kitsu,
Simkl. None of them syncs to a tracker **you** run. This does.

The other difference is how it recognises a page. MAL-Sync maintains a separate
adapter for each of 100+ sites, which is why it has 170 contributors and a
permanent maintenance load. This extension has none. It reads what the page
already tells it — the title, the heading, the `og:title`, the URL — and parses
out the show and episode number. That works on sites nobody has written an
adapter for, including ones that appear next week.

## Install (unpacked, for now)

1. Start your Nikkilog server and open it.
2. Go to **/settings** and click **Create token**. Copy it — it is shown once.
3. In Chrome, open `chrome://extensions`, turn on **Developer mode**.
4. **Load unpacked** → choose this `extension/` folder.
5. Click the extension icon, paste your server URL and token, then **Save**.
   Chrome will ask for permission to reach your server — accept it.

Firefox: `about:debugging` → **This Firefox** → **Load Temporary Add-on** →
pick `manifest.json`.

## How it behaves

| Situation | What you see |
| --- | --- |
| Page is not an episode | Nothing at all. No UI, no requests. |
| Confident match, auto-log on | A one-line toast fades in when the episode is logged. |
| Not sure which show it is | A small chip asks once. Ignore it and it goes away. |
| Already logged | Nothing. |
| Server unreachable / bad token | One quiet message, then silence. |

**What counts as watched:** 85% of the video by default, configurable. If the
player sits inside a cross-origin iframe — common on these sites — the extension
cannot read playback, so it falls back to "the tab was open and visible for N
minutes", which you can also configure. That fallback is a guess, and it is
labelled as one rather than pretending to be precise.

## Permissions, honestly

- **Read pages on all sites** — it has to, to work on arbitrary streaming sites.
  It reads the page title and looks for a `<video>`. It sends nothing except the
  title it parsed and the episode number.
- **Your server origin** — requested at runtime, only for the URL you enter.
- The token is stored in Chrome's synced extension storage and is only ever sent
  to your own server. The page itself never sees it: all requests go through the
  extension's background worker.

## Notes

- Chrome Web Store review can reject extensions that facilitate access to
  infringing sites. Keep the unpacked/GitHub install path working.
- The tracker logs a number about your own viewing. It does not touch, copy or
  download any video.
