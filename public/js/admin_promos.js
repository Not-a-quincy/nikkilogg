/* ==========================================================================
   Nikkilog — admin: manage events / announcements / sponsors
   ========================================================================== */
'use strict';

(function () {
  const form = document.getElementById('promoForm');
  const list = document.getElementById('promoList');
  const errorEl = document.getElementById('adminError');
  const submitBtn = document.getElementById('submitBtn');

  const KIND_LABEL = { announcement: 'Announcement', event: 'Event', partner: 'Partner' };

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }
  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.remove('show');
  }

  function row(p) {
    const el = document.createElement('div');
    el.className = 'promo-row' + (p.active ? '' : ' is-off');

    const main = document.createElement('div');
    main.className = 'promo-main';
    const kind = document.createElement('span');
    kind.className = 'promo-kind promo-kind-' + p.kind;
    kind.textContent = KIND_LABEL[p.kind] || p.kind;
    const title = document.createElement('span');
    title.className = 'promo-title';
    title.textContent = p.title;
    main.appendChild(kind);
    main.appendChild(title);
    if (p.subtitle || p.date_label) {
      const sub = document.createElement('span');
      sub.className = 'promo-sub';
      sub.textContent = [p.date_label, p.subtitle].filter(Boolean).join(' · ');
      main.appendChild(sub);
    }
    el.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'promo-actions';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn-mini';
    toggle.textContent = p.active ? 'Hide' : 'Show';
    toggle.addEventListener('click', () => update(p, { active: p.active ? 0 : 1 }));
    actions.appendChild(toggle);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-mini btn-mini-danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      if (!window.confirm('Delete "' + p.title + '"?')) return;
      remove(p.id);
    });
    actions.appendChild(del);

    el.appendChild(actions);
    return el;
  }

  async function load() {
    list.innerHTML = '';
    let data;
    try {
      const res = await fetch('/api/admin/promos');
      if (!res.ok) throw new Error('Could not load entries.');
      data = await res.json();
    } catch (e) {
      list.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">cloud_off</span><p>Couldn\u2019t load the entries.</p></div>';
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">event_available</span><p>Nothing here yet.</p><p class="muted">Add your first event or sponsor using the form.</p></div>';
      return;
    }
    items.forEach((p) => list.appendChild(row(p)));
  }

  async function update(p, patch) {
    clearError();
    const body = Object.assign({}, p, patch);
    try {
      const res = await fetch('/api/admin/promos/' + p.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      load();
    } catch (e) {
      showError(e.message);
    }
  }

  async function remove(id) {
    clearError();
    try {
      const res = await fetch('/api/admin/promos/' + id, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete.');
      load();
    } catch (e) {
      showError(e.message);
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
      const body = {
        kind: form.kind.value,
        title: form.title.value.trim(),
        subtitle: form.subtitle.value.trim(),
        date_label: form.date_label.value.trim(),
        url: form.url.value.trim(),
        image_url: form.image_url.value.trim(),
        sort_order: Number(form.sort_order.value) || 0,
        active: form.active.checked ? 1 : 0,
      };
      if (!body.title) return showError('Please give it a title.');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding…';
      try {
        const res = await fetch('/api/admin/promos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not add it.');
        form.reset();
        form.sort_order.value = '0';
        form.active.checked = true;
        load();
      } catch (err) {
        showError(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add entry';
      }
    });

    load();
  }
})();
