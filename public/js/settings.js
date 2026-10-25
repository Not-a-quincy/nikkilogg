/* Settings — personal API tokens for the browser extension. */
'use strict';

(function () {
  const list = document.getElementById('tokenList');
  const createBtn = document.getElementById('createTokenBtn');
  const reveal = document.getElementById('tokenReveal');
  const valueEl = document.getElementById('tokenValue');
  const copyBtn = document.getElementById('copyTokenBtn');
  const nameInput = document.getElementById('tokenName');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const when = (iso) => {
    if (!iso) return 'never';
    try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
  };

  async function load() {
    let data;
    try {
      const res = await fetch('/api/tokens');
      if (!res.ok) throw new Error();
      data = await res.json();
    } catch (e) {
      list.innerHTML = '<p class="muted">Couldn\'t load your tokens.</p>';
      return;
    }
    const tokens = data.tokens || [];
    if (!tokens.length) {
      list.innerHTML = '<p class="muted">No tokens yet. Create one above to connect the extension.</p>';
      return;
    }
    list.innerHTML = '';
    tokens.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'token-row';
      row.innerHTML =
        '<div><div class="token-name">' + esc(t.name || 'Unnamed') + ' <span class="token-meta">' + esc(t.prefix) + '…</span></div>' +
        '<div class="token-meta">created ' + esc(when(t.created_at)) + ' · last used ' + esc(when(t.last_used_at)) + '</div></div>';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-mini btn-mini-danger';
      btn.textContent = 'Revoke';
      btn.addEventListener('click', async () => {
        if (!window.confirm('Revoke this token? Anything using it stops working immediately.')) return;
        await fetch('/api/tokens/' + t.id, { method: 'DELETE' });
        load();
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.value.trim() || 'Browser extension' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create a token.');
      valueEl.textContent = data.token;
      reveal.hidden = false;
      nameInput.value = '';
      load();
    } catch (e) {
      window.alert(e.message);
    } finally {
      createBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(valueEl.textContent);
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } catch (e) {
      // clipboard blocked — select it so the user can copy manually
      const range = document.createRange();
      range.selectNodeContents(valueEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  load();
})();

/* ------------------------- change your password ------------------------- */
(function () {
  const form = document.getElementById('changePasswordForm');
  if (!form) return;

  const msg = document.getElementById('changePwMsg');
  const btn = document.getElementById('changePwBtn');

  function show(text, good) {
    msg.textContent = text;
    msg.classList.toggle('show', !!text);
    msg.style.color = good ? '#157f4d' : '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    show('');

    const current = form.current_password.value;
    const next = form.new_password.value;
    const confirm = form.confirm_new.value;

    if (!current) return show('Enter your current password.');
    if (next.length < 8) return show('Your new password must be at least 8 characters.');
    if (next !== confirm) return show('Those new passwords do not match.');
    if (next === current) return show('That is already your password. Choose a different one.');

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Changing\u2026';
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not change your password.');
      form.reset();
      show('Password changed. You are still signed in.', true);
    } catch (err) {
      show(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
})();

/* ------------------------- recovery codes ------------------------- */
(function () {
  const btn = document.getElementById('genRecovery');
  if (!btn) return;

  const out = document.getElementById('recoveryOut');
  const value1 = document.getElementById('recoveryValue1');
  const value2 = document.getElementById('recoveryValue2');
  const copy = document.getElementById('copyRecovery2');
  const msg = document.getElementById('recoveryMsg');

  btn.addEventListener('click', async () => {
    msg.textContent = '';
    msg.classList.remove('show');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Generating\u2026';
    try {
      const res = await fetch('/api/auth/recovery-code', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not generate a code.');
      const codes = data.recovery_codes || (data.recovery_code ? [data.recovery_code] : []);
      value1.textContent = codes[0] || '—';
      value2.textContent = codes[1] || '—';
      out.hidden = false;
      copy.textContent = 'Copy both';
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('show');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText([value1.textContent, value2.textContent].join('\n'));
        copy.textContent = 'Copied both';
      }
      catch (e) { copy.textContent = 'Copy it by hand'; }
    });
  }
})();
