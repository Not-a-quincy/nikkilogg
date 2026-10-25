/* Importing a MyAnimeList export: preview first, write only on purpose. */
'use strict';

(function () {
  const input = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const dropLabel = document.getElementById('dropLabel');
  const statusEl = document.getElementById('status');
  const previewPanel = document.getElementById('previewPanel');
  const previewBody = document.getElementById('previewBody');
  const applyBtn = document.getElementById('applyBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const donePanel = document.getElementById('donePanel');
  const doneTitle = document.getElementById('doneTitle');
  const doneBody = document.getElementById('doneBody');
  if (!input) return;

  let token = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STATUS_LABEL = {
    watching: 'Watching', completed: 'Completed', 'on-hold': 'On hold',
    dropped: 'Dropped', 'plan-to-watch': 'Plan to watch',
  };

  function say(message, kind) {
    statusEl.hidden = false;
    statusEl.className = 'import-status' + (kind ? ' is-' + kind : '');
    statusEl.textContent = message;
  }

  function reset() {
    token = null;
    previewPanel.hidden = true;
    donePanel.hidden = true;
  }

  async function preview(file) {
    reset();
    say('Reading ' + file.name + '…');
    const body = new FormData();
    body.append('file', file);

    let res;
    try {
      res = await fetch('/api/import/preview', { method: 'POST', body });
    } catch (e) {
      return say('Could not reach the server.', 'bad');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      say(data.error || 'That file could not be read.', 'bad');
      if (data.problems && data.problems.length) {
        previewBody.innerHTML = '<ul class="import-problems">' + data.problems.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>';
        previewPanel.hidden = false;
      }
      return;
    }

    token = data.token;
    statusEl.hidden = true;
    render(data);
    previewPanel.hidden = false;
    previewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function render(d) {
    const rows = [];
    rows.push('<p class="import-lead">Read <strong>' + d.total + '</strong> ' +
      (d.total === 1 ? 'entry' : 'entries') + ' from your ' + (d.format === 'csv' ? 'CSV' : 'MyAnimeList export') + '.</p>');

    rows.push('<div class="import-stats">' +
      '<div><b>' + d.matched + '</b><span>found in the catalogue</span></div>' +
      '<div><b>' + d.newEntries + '</b><span>new to your list</span></div>' +
      '<div><b>' + d.alreadyTracked + '</b><span>will be updated</span></div>' +
      (d.unmatched ? '<div class="is-warn"><b>' + d.unmatched + '</b><span>not in the catalogue</span></div>' : '') +
      '</div>');

    const byStatus = Object.entries(d.byStatus || {});
    if (byStatus.length) {
      rows.push('<h3 class="import-sub">By status</h3><div class="import-chips">' +
        byStatus.map(([s, n]) => '<span class="import-chip">' + esc(STATUS_LABEL[s] || s) + ' · ' + n + '</span>').join('') +
        '</div>');
    }

    if (d.unmatched && d.unmatchedSample && d.unmatchedSample.length) {
      rows.push('<h3 class="import-sub">' + d.unmatched + ' not in the catalogue</h3>' +
        '<p class="muted import-note">These are on your MyAnimeList list but not in the Nikkilog catalogue, so they cannot be imported:</p>' +
        '<ul class="import-problems">' + d.unmatchedSample.map((u) => '<li>' + esc(u.title || ('MAL #' + u.malId)) + '</li>').join('') +
        (d.unmatched > d.unmatchedSample.length ? '<li>…and ' + (d.unmatched - d.unmatchedSample.length) + ' more</li>' : '') + '</ul>' +
        '<p class="muted import-note">They cannot import until the catalogue has them. ' +
        'Add the ones you want, then import again:<br>' +
        '<code class="import-cmd">npm run add-anime ' + d.unmatchedSample.map((u) => u.malId).join(' ') +
        (d.unmatched > d.unmatchedSample.length ? ' …' : '') + '</code></p>');
    }

    if (d.notImported && d.notImported.length) {
      rows.push('<h3 class="import-sub">What does not come across</h3>' +
        '<p class="muted import-note">MyAnimeList holds these and Nikkilog does not yet, so they are left behind rather than guessed at: ' +
        esc(d.notImported.join(', ')) + '.</p>');
    }

    if (d.problemCount) {
      rows.push('<h3 class="import-sub">' + d.problemCount + ' line' + (d.problemCount === 1 ? '' : 's') + ' could not be read</h3>' +
        '<ul class="import-problems">' + (d.problems || []).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>');
    }

    previewBody.innerHTML = rows.join('');
    applyBtn.disabled = d.matched === 0;
    applyBtn.textContent = d.matched ? 'Import ' + d.matched + ' ' + (d.matched === 1 ? 'entry' : 'entries') : 'Nothing to import';
  }

  async function apply() {
    if (!token) return;
    applyBtn.disabled = true;
    applyBtn.textContent = 'Importing…';
    try {
      const res = await fetch('/api/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        say(data.error || 'The import could not be completed.', 'bad');
        applyBtn.disabled = false;
        return;
      }
      previewPanel.hidden = true;
      statusEl.hidden = true;
      doneTitle.textContent = 'Imported ' + data.imported + ' ' + (data.imported === 1 ? 'entry' : 'entries');
      doneBody.innerHTML = '<p class="import-lead">' + data.inserted + ' added, ' + data.updated +
        ' updated. Nothing else on your list was touched.</p>';
      donePanel.hidden = false;
      donePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      say('Could not reach the server.', 'bad');
      applyBtn.disabled = false;
    }
  }

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) preview(file);
  });

  ['dragenter', 'dragover'].forEach((ev) => dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((ev) => dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-over');
  }));
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      dropLabel.textContent = file.name;
      preview(file);
    }
  });

  applyBtn.addEventListener('click', apply);
  cancelBtn.addEventListener('click', () => { reset(); input.value = ''; dropLabel.textContent = 'Choose your export file, or drop it here'; });
})();
