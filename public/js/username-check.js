/* Live username availability, as you type.
 *
 * Two things make this cheap enough to run while someone types:
 *
 *  - It waits until you pause (300ms) rather than firing on every keystroke.
 *    Typing "vasanth" is 7 letters; checking each one is 7 requests and the
 *    first 6 answers are useless because the name is not finished. Pausing
 *    makes it feel instant with roughly one request per word.
 *  - It cancels a request that is still in flight when you type again. Without
 *    that, a slow reply for "vas" can land after a fast reply for "vasanth" and
 *    overwrite it, so the page ends up showing the wrong answer.
 *
 * The server is still the authority: registration re-checks. This only tells you
 * early, so a refusal never feels like a surprise.
 */
'use strict';

(function () {
  const input = document.getElementById('username');
  const statusEl = document.getElementById('usernameStatus');
  if (!input || !statusEl) return;

  const PAUSE_MS = 300;
  const MIN_LENGTH = 3;

  let timer = null;
  let controller = null;
  let settled = 'idle'; // idle | good | bad
  let lastChecked = '';

  function render(kind, text, html) {
    statusEl.className = 'username-status' + (kind ? ' is-' + kind : '');
    if (html) statusEl.innerHTML = html;
    else statusEl.textContent = text || '';
  }

  function reset() {
    settled = 'idle';
    render('', '');
  }

  async function check(value) {
    if (controller) controller.abort();
    controller = new AbortController();

    render('checking', 'Checking…');

    try {
      const res = await fetch('/api/auth/username-available?username=' + encodeURIComponent(value), {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('check failed');
      const data = await res.json();

      // Ignore a reply for something the field no longer contains.
      if (input.value.trim().toLowerCase() !== value) return;

      if (data.available) {
        settled = 'good';
        render('good', 'Available');
      } else if (data.reason === 'taken') {
        settled = 'bad';
        const list = (data.suggestions || []).join(', ');
        render('bad', '', 'Taken' + (list ? ' — try <strong>' + list.replace(/[<>&]/g, '') + '</strong>' : ''));
      } else {
        settled = 'bad';
        render('bad', data.message || 'Not a valid username');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // superseded by a newer keystroke
      // The check is a convenience. If it fails, say nothing and let the server
      // decide on submit rather than blocking someone from signing up.
      settled = 'idle';
      render('', '');
    }
  }

  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    if (timer) clearTimeout(timer);

    if (!value) return reset();

    if (value.length < MIN_LENGTH) {
      settled = 'bad';
      render('bad', 'At least ' + MIN_LENGTH + ' characters');
      return;
    }

    if (value === lastChecked) return; // same value: nothing to ask
    timer = setTimeout(() => {
      lastChecked = value;
      check(value);
    }, PAUSE_MS);
  });

  // Never let a known-bad username reach the server.
  const form = input.closest('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      if (settled === 'bad') {
        e.preventDefault();
        e.stopImmediatePropagation();
        input.focus();
        const err = document.getElementById('authError');
        if (err) err.textContent = 'Please choose an available username.';
      }
    }, true); // capture, so it runs before the submit handler
  }
})();
