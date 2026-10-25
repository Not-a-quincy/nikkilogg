/* Log moods on everything you've tracked, one tap at a time. */
'use strict';

(function () {
  const cardEl = document.getElementById('seedCard');
  const countEl = document.getElementById('seedCount');
  if (!cardEl) return;

  let vocabulary = [];
  let queue = [];
  let logged = 0;
  let index = 0;
  let busy = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function render() {
    countEl.textContent = logged;

    if (index >= queue.length) {
      cardEl.innerHTML =
        '<div class="empty-state"><span class="material-symbols-outlined">task_alt</span>' +
        '<p>That is everything you have tracked.</p>' +
        '<p class="muted">Add more shows to your list and come back — each one you rate makes the mood pages better.</p>' +
        '<a class="btn btn-primary" href="/browse?category=all">Browse anime</a></div>';
      return;
    }

    const a = queue[index];
    cardEl.innerHTML =
      '<article class="seed-card">' +
        '<img src="' + esc(a.poster || '') + '" alt="' + esc(a.title) + '">' +
        '<div class="seed-body">' +
          '<h2 class="seed-title">' + esc(a.title) + '</h2>' +
          '<p class="muted seed-meta">' + esc(a.year || '') +
            (a.rating ? ' · ★ ' + Number(a.rating).toFixed(2) : '') +
            (a.progress ? ' · episode ' + a.progress : '') + '</p>' +
          '<div class="mood-vote-options" id="seedOptions"></div>' +
          '<button class="btn-mini seed-skip" id="seedSkip" type="button">Skip this one</button>' +
        '</div>' +
      '</article>';

    const options = document.getElementById('seedOptions');
    vocabulary.forEach((m, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mood-vote-btn';
      btn.textContent = m.label;
      if (i < 9) btn.title = 'Press ' + (i + 1);
      btn.addEventListener('click', () => cast(m.slug));
      options.appendChild(btn);
    });
    document.getElementById('seedSkip').addEventListener('click', next);
  }

  function next() {
    index += 1;
    render();
  }

  async function cast(slug) {
    if (busy) return;
    busy = true;
    const a = queue[index];
    try {
      const res = await fetch('/api/mood/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: a.mal_id, mood: slug }),
      });
      if (res.ok) { logged += 1; next(); }
      else { cardEl.insertAdjacentHTML('afterbegin', '<p class="side-empty">Could not save that one.</p>'); }
    } catch (e) {
      cardEl.insertAdjacentHTML('afterbegin', '<p class="side-empty">Could not reach the server.</p>');
    } finally {
      busy = false;
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 's' || e.key === 'S') { next(); return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && vocabulary[n - 1]) cast(vocabulary[n - 1].slug);
  });

  async function load() {
    try {
      const [vocabRes, queueRes] = await Promise.all([
        fetch('/api/mood'),
        fetch('/api/mood/queue?limit=200'),
      ]);
      vocabulary = (await vocabRes.json()).moods || [];
      const data = await queueRes.json();
      queue = data.items || [];
      logged = data.logged || 0;
      render();
    } catch (e) {
      cardEl.innerHTML = '<p class="muted">Could not load your list just now.</p>';
    }
  }

  load();
})();
