/* ==========================================================================
   Nikkilog — Home page
   Wires the new home layout to the existing API. Sections with no data
   are hidden rather than faked.
   ========================================================================== */
'use strict';

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function currentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  let season = 'fall';
  if (month <= 3) season = 'winter';
  else if (month <= 6) season = 'spring';
  else if (month <= 9) season = 'summer';
  return { year: now.getFullYear(), season };
}

const isLoggedIn = window.isLoggedIn === true || window.isLoggedIn === 'true';

/* -------------------------------------------------------------------------
   Live search (header + hero)
   ------------------------------------------------------------------------- */
function wireSearch(inputId, dropdownId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  const run = debounce(async (q) => {
    if (!q || q.length < 2) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; return; }
    try {
      const res = await fetch(`/api/anime?search=${encodeURIComponent(q)}&limit=6`);
      const data = res.ok ? await res.json() : {};
      const list = data.anime || [];
      if (!list.length) {
        dropdown.innerHTML = '<div class="search-empty">No matches found.</div>';
        dropdown.classList.add('open');
        return;
      }
      dropdown.innerHTML = list.map((a) => `
        <a class="search-row" href="/anime/${a.mal_id}">
          <img src="${escapeHtml(a.poster_image_url || '')}" alt="">
          <div>
            <div class="search-row-title">${escapeHtml(a.title_en || a.title || a.title_jp || 'Untitled')}</div>
            <div class="search-row-meta">${escapeHtml(a.anime_type || '')}${a.anime_year ? ' • ' + escapeHtml(a.anime_year) : ''}</div>
          </div>
        </a>`).join('');
      dropdown.classList.add('open');
    } catch (e) {
      dropdown.classList.remove('open');
    }
  }, 280);

  input.addEventListener('input', (e) => run(e.target.value.trim()));
  input.addEventListener('focus', () => { if (dropdown.innerHTML) dropdown.classList.add('open'); });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== input) dropdown.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dropdown.classList.remove('open'); });
}

wireSearch('homeSearch', 'homeSearchResults');
wireSearch('heroSearch', 'heroSearchResults');

const heroExplore = document.getElementById('heroExplore');
if (heroExplore) heroExplore.addEventListener('click', () => { window.location.href = '/browse?category=all'; });
const heroSearchInput = document.getElementById('heroSearch');
if (heroSearchInput) {
  heroSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.location.href = '/browse?category=all';
  });
}

/* -------------------------------------------------------------------------
   Hero stat pill — real catalogue size
   ------------------------------------------------------------------------- */
(async function heroStat() {
  try {
    const res = await fetch('/api/anime?limit=1');
    if (!res.ok) return;
    const data = await res.json();
    const count = data.total_anime_count;
    if (!count) return;
    const pill = document.getElementById('heroPill');
    const text = document.getElementById('heroPillText');
    if (pill && text) {
      text.textContent = `${Number(count).toLocaleString()} titles in the library`;
      pill.hidden = false;
    }
  } catch (e) { /* leave the pill hidden */ }
})();

/* -------------------------------------------------------------------------
   Currently Watching
   ------------------------------------------------------------------------- */
const STATUS_LABELS = {
  watching: 'Watching', completed: 'Completed', 'on-hold': 'On hold',
  dropped: 'Dropped', 'plan-to-watch': 'Plan to watch',
};
const STATUS_DOTS = {
  watching: 'var(--secondary)', completed: 'var(--primary)',
  'on-hold': 'var(--outline)', dropped: 'var(--outline)', 'plan-to-watch': 'var(--primary-fixed-dim)',
};

function watchCard(item) {
  const total = Number(item.total_episodes) || 0;
  const current = Number(item.current_episode) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const status = item.status || 'watching';
  const el = document.createElement('div');
  el.className = 'watch-card';
  el.dataset.malId = item.mal_id;
  el.dataset.current = current;
  el.dataset.total = total;
  el.innerHTML = `
    <div class="watch-media">
      <img src="${escapeHtml(item.poster_image_url || '')}" alt="${escapeHtml(item.title_en || '')}">
      <span class="watch-status">
        <span class="dot" style="background:${STATUS_DOTS[status] || 'var(--secondary)'}"></span>
        ${escapeHtml(STATUS_LABELS[status] || status)}
      </span>
    </div>
    <h3 class="watch-title" title="${escapeHtml(item.title_en || item.title_jp || '')}">
      ${escapeHtml(item.title_en || item.title_jp || 'Untitled')}
    </h3>
    <p class="watch-ep">Episode ${current} of ${total || '?'}</p>
    <div class="rail"><div style="width:${pct}%"></div></div>
    <div class="watch-foot">
      <span class="watch-pct">${pct}% Watched</span>
      <button class="ep-btn" type="button">
        <span class="material-symbols-outlined">add</span> +1 Ep
      </button>
    </div>`;

  el.querySelector('.ep-btn').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const newEp = (Number(el.dataset.current) || 0) + 1;
    if (el.dataset.total && newEp > Number(el.dataset.total)) return;
    btn.disabled = true;
    try {
      const res = await fetch('/api/update-user-anime-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: Number(item.mal_id), status: 'watching', current_episode: newEp }),
      });
      if (!res.ok) throw new Error('failed');
      el.dataset.current = newEp;
      const total = Number(el.dataset.total) || 0;
      const pct = total > 0 ? Math.min(100, Math.round((newEp / total) * 100)) : 0;
      el.querySelector('.watch-ep').textContent = `Episode ${newEp} of ${total || '?'}`;
      el.querySelector('.rail > div').style.width = pct + '%';
      el.querySelector('.watch-pct').textContent = pct + '% Watched';
    } catch (e) {
      alert('Could not update this show. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });

  if (window.NikkilogCards) window.NikkilogCards.makeClickable(el, '/anime/' + (item.mal_id || ''));
  return el;
}

(async function currentlyWatching() {
  if (!isLoggedIn) return;
  try {
    const res = await fetch('/api/user/anime-list');
    if (!res.ok) return;
    const data = await res.json();
    const watching = (data.anime_list || []).filter((a) => a.status === 'watching').slice(0, 4);
    if (!watching.length) return;
    const grid = document.getElementById('watchingGrid');
    watching.forEach((item) => grid.appendChild(watchCard(item)));
    document.getElementById('watchingCount').textContent = `${watching.length} active`;
    document.getElementById('watchingSection').hidden = false;
  } catch (e) { /* leave hidden */ }
})();

/* -------------------------------------------------------------------------
   Seasonal Trends
   ------------------------------------------------------------------------- */
const seasonState = currentSeason();

function seasonCard(item) {
  const studio = (item.studio && item.studio[0] && item.studio[0].name) || '';
  const genres = (item.genre || []).slice(0, 3).map((g) => g.name);
  const rating = item.average_rating;
  const el = document.createElement('div');
  el.className = 'season-card';
  el.innerHTML = `
    <div class="season-poster">
      <img src="${escapeHtml(item.poster_image_url || '')}" alt="${escapeHtml(item.title_en || '')}">
      ${rating ? `<span class="season-rating"><span class="material-symbols-outlined">star</span>${escapeHtml(rating)}</span>` : ''}
      ${studio ? `<span class="season-studio">${escapeHtml(studio)}</span>` : ''}
    </div>
    <div class="season-body">
      <span class="season-meta">${escapeHtml((item.anime_type || '').toUpperCase())}${item.episodes ? ' • ' + item.episodes + ' Episodes' : ''}</span>
      <h3 class="season-title" title="${escapeHtml(item.title_en || item.title_jp || '')}">${escapeHtml(item.title_en || item.title_jp || item.title || 'Untitled')}</h3>
      <div class="season-tags">${genres.map((g) => `<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
      <button class="season-btn" type="button">
        <span class="material-symbols-outlined">bookmark_add</span> Want to Watch
      </button>
    </div>`;

  const btn = el.querySelector('.season-btn');
  btn.addEventListener('click', async () => {
    if (!isLoggedIn) { window.location.href = '/login'; return; }
    btn.disabled = true;
    try {
      const res = await fetch('/api/update-user-anime-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: Number(item.mal_id), status: 'plan-to-watch' }),
      });
      if (!res.ok) throw new Error('failed');
      btn.classList.add('done');
      btn.innerHTML = '<span class="material-symbols-outlined">check</span> On your list';
    } catch (e) {
      btn.disabled = false;
      alert('Could not add this show. Please try again.');
    }
  });

  if (window.NikkilogCards) window.NikkilogCards.makeClickable(el, '/anime/' + (item.mal_id || ''));
  return el;
}

async function loadSeasonal(orderBy) {
  const grid = document.getElementById('seasonalGrid');
  const section = document.getElementById('seasonalSection');
  if (!grid) return;
  grid.innerHTML = '<div class="search-empty">Loading…</div>';
  try {
    const qs = new URLSearchParams({
      year: seasonState.year, season: seasonState.season, limit: '8', order_by: orderBy,
    });
    const res = await fetch('/api/anime?' + qs.toString());
    if (!res.ok) throw new Error('failed');
    const data = await res.json();
    const list = data.anime || [];
    grid.innerHTML = '';
    if (!list.length) {
      section.hidden = true;
      return;
    }
    list.forEach((item) => grid.appendChild(seasonCard(item)));
    const title = document.getElementById('seasonalTitle');
    const label = seasonState.season.charAt(0).toUpperCase() + seasonState.season.slice(1);
    title.textContent = `${label} ${seasonState.year} — Seasonal Trends`;
    section.hidden = false;
  } catch (e) {
    section.hidden = true;
  }
}

const seasonalTabs = document.getElementById('seasonalTabs');
if (seasonalTabs) {
  seasonalTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    seasonalTabs.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    loadSeasonal(btn.dataset.order);
  });
}
loadSeasonal('members');

/* -------------------------------------------------------------------------
   Insights (Watching Habits) — logged-in only
   ------------------------------------------------------------------------- */
(async function insights() {
  if (!isLoggedIn) return;
  try {
    const res = await fetch('/api/user-stats');
    if (!res.ok) return;
    const d = await res.json();

    const section = document.getElementById('insightsSection');
    document.getElementById('insightHours').textContent = d.total_hours_watched ?? 0;
    document.getElementById('insightEpisodes').textContent =
      `${Number(d.total_episodes_watched || 0).toLocaleString()} episodes • ${d.total_anime_completed || 0} completed`;
    document.getElementById('insightScore').textContent =
      d.avg_score ? `Mean score ${d.avg_score}` : '';

    // Status distribution chart (real data)
    const counts = d.status_counts || {};
    const entries = Object.entries(counts).filter(([, v]) => v > 0);
    if (entries.length) {
      const max = Math.max(...entries.map(([, v]) => v));
      const chart = document.getElementById('insightChart');
      const labels = document.getElementById('insightChartLabels');
      entries.forEach(([status, value], i) => {
        const bar = document.createElement('div');
        bar.className = 'chart-bar' + (value === max ? ' is-peak' : (i === entries.length - 1 ? ' is-warm' : ''));
        bar.style.height = Math.max(6, Math.round((value / max) * 110)) + 'px';
        bar.title = `${STATUS_LABELS[status] || status}: ${value}`;
        chart.appendChild(bar);
        const lbl = document.createElement('span');
        lbl.textContent = STATUS_LABELS[status] || status;
        labels.appendChild(lbl);
      });
    }

    if (d.most_watched_genre && d.most_watched_genre !== 'N/A') {
      const chips = document.getElementById('insightGenres');
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = d.most_watched_genre;
      chips.appendChild(tag);
    }

    section.hidden = false;
  } catch (e) { /* leave hidden */ }
})();
