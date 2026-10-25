/* One-tap mood voting on an anime page. Generates the site's only unique data. */
'use strict';

(function () {
  const root = document.getElementById('moodVote');
  if (!root) return;

  const animeId = root.getAttribute('data-anime-id');
  const optionsEl = document.getElementById('moodOptions');
  const aggregateEl = document.getElementById('moodAggregate');
  let vocabulary = [];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderOptions(mine, max) {
    const picked = Array.isArray(mine) ? mine : (mine ? [mine] : []);
    const limit = max || 4;
    const full = picked.length >= limit;

    optionsEl.innerHTML = '';
    vocabulary.forEach((m) => {
      const on = picked.indexOf(m.slug) !== -1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mood-vote-btn' + (on ? ' is-mine' : '');
      // Once the limit is reached, unpicked chips are inert rather than
      // failing on the server when tapped.
      if (!on && full) {
        btn.classList.add('is-locked');
        btn.disabled = true;
      }
      btn.textContent = m.label;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.addEventListener('click', () => cast(m.slug));
      optionsEl.appendChild(btn);
    });

    const counter = document.getElementById('moodCount');
    if (counter) {
      counter.textContent = picked.length
        ? picked.length + ' of ' + limit + ' picked'
        : 'Up to ' + limit + ' — tap to add, tap again to remove';
    }
  }

  function renderAggregate(data) {
    if (!data.total) {
      aggregateEl.innerHTML = '<p class="side-empty">No one has logged a mood yet. Be the first — it takes one tap.</p>';
      return;
    }
    const top = data.distribution[0];
    const people = data.voters || data.total;
    aggregateEl.innerHTML =
      '<p class="mood-top"><strong>' + esc(top.label) + '</strong> — ' +
      top.pct + '% of ' + people + ' ' + (people === 1 ? 'viewer' : 'viewers') + '</p>' +
      data.distribution.slice(0, 5).map((d) =>
        '<div class="mood-bar"><span>' + esc(d.label) + '</span>' +
        '<span class="mood-bar-track"><span class="mood-bar-fill" style="width:' + Math.min(100, d.pct) + '%"></span></span>' +
        '<span class="mood-bar-pct">' + d.pct + '%</span></div>'
      ).join('');
  }

  async function load() {
    try {
      const [vocabRes, dataRes] = await Promise.all([
        fetch('/api/mood'),
        fetch('/api/mood/' + animeId),
      ]);
      const vocab = await vocabRes.json();
      const data = await dataRes.json();
      vocabulary = vocab.moods || [];
      renderOptions(data.mine, data.max);
      renderAggregate(data);
    } catch (e) {
      aggregateEl.innerHTML = '<p class="side-empty">Couldn\'t load moods just now.</p>';
    }
  }

  async function cast(slug) {
    try {
      const res = await fetch('/api/mood/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: Number(animeId), mood: slug }),
      });
      if (res.status === 401) {
        aggregateEl.innerHTML = '<p class="side-empty"><a href="/login">Log in</a> to add how this felt.</p>';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save that.');
      renderOptions(data.mine, data.max);
      renderAggregate(data);
    } catch (e) {
      aggregateEl.innerHTML = '<p class="side-empty">' + esc(e.message) + '</p>';
    }
  }

  load();
})();
