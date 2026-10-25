/* ==========================================================================
   Nikkilog — events, announcements & partners
   Fetches /api/promos and fills the announcement bar, the home events
   section, the /events page and the footer partner strip.
   If the request fails the page simply shows none of them.
   ========================================================================== */
'use strict';

(function () {
  const DISMISS_KEY = 'nikkilog.announce.dismissed';

  function setAnnounceHeight(px) {
    document.documentElement.style.setProperty('--announce-h', px + 'px');
  }

  function renderAnnouncement(items) {
    const bar = document.getElementById('announceBar');
    if (!bar || !items.length) return;
    const item = items[0];
    try {
      if (localStorage.getItem(DISMISS_KEY) === String(item.id)) return;
    } catch (e) { /* storage blocked — just show it */ }

    document.getElementById('announceText').textContent =
      item.subtitle ? item.title + ' — ' + item.subtitle : item.title;

    const link = document.getElementById('announceLink');
    if (item.url) {
      link.href = item.url;
      link.hidden = false;
    }

    bar.hidden = false;
    setAnnounceHeight(bar.offsetHeight);

    document.getElementById('announceClose').addEventListener('click', () => {
      bar.hidden = true;
      setAnnounceHeight(0);
      try { localStorage.setItem(DISMISS_KEY, String(item.id)); } catch (e) { /* ignore */ }
    });
  }

  function renderPartners(items) {
    const strip = document.getElementById('partnersStrip');
    const row = document.getElementById('partnersRow');
    if (!strip || !row || !items.length) return;
    items.forEach((p) => {
      const a = document.createElement('a');
      a.className = 'partner';
      if (p.url) { a.href = p.url; a.target = '_blank'; a.rel = 'noopener'; }
      if (p.image_url) {
        const img = document.createElement('img');
        img.src = p.image_url;
        img.alt = p.title;
        img.loading = 'lazy';
        a.appendChild(img);
      } else {
        a.textContent = p.title;
      }
      row.appendChild(a);
    });
    strip.hidden = false;
  }

  function eventCard(p) {
    const el = document.createElement('article');
    el.className = 'event-card';

    if (p.date_label) {
      const d = document.createElement('span');
      d.className = 'event-date';
      d.textContent = p.date_label;
      el.appendChild(d);
    }
    const h = document.createElement('h3');
    h.className = 'event-title';
    h.textContent = p.title;
    el.appendChild(h);

    if (p.subtitle) {
      const s = document.createElement('p');
      s.className = 'event-sub';
      s.textContent = p.subtitle;
      el.appendChild(s);
    }
    if (p.url) {
      const a = document.createElement('a');
      a.className = 'btn btn-primary event-cta';
      a.href = p.url;
      a.textContent = 'Learn more';
      el.appendChild(a);
    }
    return el;
  }

  function renderEvents(items, grid, section) {
    if (!grid) return;
    grid.innerHTML = '';
    if (!items.length) return;
    items.slice(0, 6).forEach((p) => grid.appendChild(eventCard(p)));
    if (section) section.hidden = false;
  }

  async function load() {
    let data;
    try {
      const res = await fetch('/api/promos');
      if (!res.ok) return;
      data = await res.json();
    } catch (e) {
      return; // offline or database down — show nothing rather than an error
    }

    renderAnnouncement(data.announcement || []);
    renderPartners(data.partner || []);
    renderEvents(data.event || [], document.getElementById('eventsGrid'), document.getElementById('eventsSection'));
    renderEvents(data.event || [], document.getElementById('allEventsGrid'), document.getElementById('allEventsSection'));
    const noEvents = document.getElementById('noEvents');
    if (noEvents) noEvents.hidden = (data.event || []).length > 0;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
