/* ==========================================================================
   Nikkilog Sync — content script

   Design rules, deliberately:
     • Never a modal. Never a dialog. Never anything that pauses playback.
     • If we are not confident, ask once with a small chip you can ignore.
     • If we are confident, log it silently and fade a one-line toast.
     • If the page is not an episode, do nothing at all — no UI, no requests.
   ========================================================================== */
'use strict';

(function () {
  const M = window.NikkilogMatcher;
  if (!M) return;

  const state = {
    settings: null,
    match: null,
    lookup: null,
    loggedEpisode: null,
    startedAt: Date.now(),
    finished: false,
  };

  // ------------------------------------------------------------------ UI ---
  let shadow = null;

  function ui() {
    if (shadow) return shadow;
    const host = document.createElement('div');
    host.id = 'nikkilog-sync-root';
    host.style.cssText = 'position:fixed;z-index:2147483647;bottom:18px;right:18px;pointer-events:none;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .wrap { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; display:flex; flex-direction:column; gap:8px; align-items:flex-end; }
        .card {
          pointer-events:auto; max-width:320px; padding:10px 14px; border-radius:12px;
          background:#1b1d2b; color:#f3f2fb; font-size:13px; line-height:1.45;
          box-shadow:0 8px 28px rgba(0,0,0,.32); opacity:0; transform:translateY(6px);
          transition:opacity .18s ease, transform .18s ease;
        }
        .card.show { opacity:1; transform:none; }
        .title { font-weight:650; }
        .sub { opacity:.72; font-size:12px; margin-top:2px; }
        .row { display:flex; gap:8px; margin-top:9px; }
        button {
          pointer-events:auto; font:inherit; font-size:12px; font-weight:600;
          padding:5px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.22);
          background:transparent; color:inherit; cursor:pointer;
        }
        button.primary { background:#6063ee; border-color:#6063ee; }
        button:hover { border-color:#fff; }
        .ok { color:#8ef0c0; }
        .bad { color:#ffb3b3; }
      </style>
      <div class="wrap" id="wrap"></div>`;
    document.documentElement.appendChild(host);
    return shadow;
  }

  function card(html, { autoHide = 0 } = {}) {
    const wrap = ui().getElementById('wrap');
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = html;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const remove = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    };
    if (autoHide) setTimeout(remove, autoHide);
    return { el, remove };
  }

  function toast(html, ms = 5000) {
    return card(html, { autoHide: ms });
  }

  // --------------------------------------------------------------- page ---
  function pageInfo() {
    const heading = document.querySelector('h1') ? document.querySelector('h1').textContent : '';
    const og = document.querySelector('meta[property="og:title"]');
    return {
      title: document.title,
      heading,
      ogTitle: og ? og.getAttribute('content') : '',
      urlSlug: M.slugFromUrl(location.href),
    };
  }

  // ----------------------------------------------------------- playback ---
  /** Finds a <video> we can actually observe (same-origin only). */
  function findVideo() {
    const direct = Array.from(document.querySelectorAll('video'));
    for (const v of direct) {
      if (v.duration || v.readyState > 0) return v;
    }
    return direct[0] || null;
  }

  function watchVideo(video, threshold, onDone) {
    let fired = false;
    const check = () => {
      if (fired || !video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      if (pct >= threshold) {
        fired = true;
        video.removeEventListener('timeupdate', check);
        onDone();
      }
    };
    video.addEventListener('timeupdate', check);
    check();
  }

  /**
   * Fallback for players inside a cross-origin iframe, which we cannot read.
   * We can only know the tab was open and visible — so we wait, and we say so.
   */
  function watchIdle(minutes, onDone) {
    let visibleMs = 0;
    let last = Date.now();
    const target = minutes * 60 * 1000;
    const tick = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible') visibleMs += now - last;
      last = now;
      if (visibleMs >= target) {
        clearInterval(tick);
        onDone();
      }
    }, 5000);
  }

  // --------------------------------------------------------------- log ---
  function send(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (reply) => resolve(reply || { ok: false, error: 'No response' }));
    });
  }

  async function logEpisode(anime, episode, { quiet } = {}) {
    if (state.loggedEpisode === episode) return;
    state.loggedEpisode = episode;

    const reply = await send({
      type: 'progress',
      payload: { mal_id: anime.mal_id, episode, status: 'watching' },
    });

    if (!reply.ok) {
      toast(`<div class="title bad">Nikkilog couldn't log that</div><div class="sub">${escapeHtml(reply.error || '')}</div>`, 7000);
      return;
    }
    if (!quiet) {
      toast(`<div class="title ok">Logged ✓</div><div class="sub">${escapeHtml(anime.title)} — episode ${episode}</div>`, 4500);
    }
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // -------------------------------------------------------------- flow ---
  async function init() {
    if (state.finished) return;

    const settingsReply = await send({ type: 'settings' });
    state.settings = settingsReply.data || {};
    if (!state.settings.enabled || !state.settings.token) return;

    const info = pageInfo();
    const match = M.parse(info);
    state.match = match;

    // Not an episode page — stay completely silent.
    if (!match.series || match.episode === null) return;

    const reply = await send({ type: 'lookup', title: match.series });
    if (!reply.ok) {
      // A broken token or unreachable server is worth saying once, quietly.
      if (/token|server|fetch|Failed/i.test(reply.error || '')) {
        toast(`<div class="title bad">Nikkilog: not connected</div><div class="sub">${escapeHtml(reply.error)}</div>`, 8000);
        state.finished = true;
      }
      return;
    }

    const data = reply.data || {};
    const best = data.best;
    if (!best) return;

    const alreadyAt = best.tracking && Number(best.tracking.current_episode) >= match.episode;
    if (alreadyAt) {
      state.finished = true;
      return; // already logged; say nothing
    }

    state.lookup = best;

    if (data.confident && state.settings.autoLog) {
      startWatching(best, match.episode, { quiet: false });
      return;
    }

    // Not confident — ask once, small and ignorable.
    const chip = card(`
      <div class="title">Is this ${escapeHtml(best.title)}?</div>
      <div class="sub">Nikkilog will log episode ${match.episode} to your list.</div>
      <div class="row">
        <button class="primary" id="yes">Yes, log it</button>
        <button id="no">Not this</button>
      </div>`, { autoHide: 25000 });

    chip.el.querySelector('#yes').addEventListener('click', () => {
      chip.remove();
      startWatching(best, match.episode, { quiet: false });
    });
    chip.el.querySelector('#no').addEventListener('click', () => {
      chip.remove();
      state.finished = true;
    });
  }

  function startWatching(anime, episode, opts) {
    const threshold = Number(state.settings.threshold) || 85;
    const video = findVideo();

    if (video) {
      watchVideo(video, threshold, () => logEpisode(anime, episode, opts));
    } else {
      // Cross-origin player: we cannot read progress, so we wait instead.
      watchIdle(Number(state.settings.idleMinutes) || 8, () => logEpisode(anime, episode, opts));
    }
  }

  // Streaming sites are often single-page apps — re-run when the URL changes.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      state.match = null;
      state.lookup = null;
      state.loggedEpisode = null;
      state.finished = false;
      state.startedAt = Date.now();
      init();
    }
  }, 2000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
