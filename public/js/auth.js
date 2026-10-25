/* ==========================================================================
   Nikkilog — Login / Register form handling
   ========================================================================== */
'use strict';

function showError(message) {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
}
function clearError() {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('show');
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? 'Please wait…' : label;
}

// Only follow a relative, same-site "next" target.
function safeNext() {
  const n = window.AUTH_NEXT;
  if (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//')) return n;
  return '/';
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* ignore */ }
  return { ok: res.ok, data };
}

/* ------------------------------- Login ---------------------------------- */
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const username = loginForm.username.value.trim();
    const password = loginForm.password.value;
    if (!username || !password) return showError('Please enter your username and password.');

    const btn = document.getElementById('submitBtn');
    setBusy(btn, true);
    try {
      const { ok, data } = await postJson('/api/auth/login', { username, password });
      if (!ok) throw new Error(data.error || 'Could not sign you in.');
      window.location.href = safeNext();
    } catch (err) {
      showError(err.message);
      setBusy(btn, false, 'Log in');
    }
  });
}

/* ------------------------------ Register -------------------------------- */
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const username = registerForm.username.value.trim();
    const password = registerForm.password.value;
    const confirm = registerForm.confirm.value;
    const display_name = registerForm.display_name.value.trim();

    if (!username) return showError('Please choose a username.');
    if (password.length < 8) return showError('Your password must be at least 8 characters long.');
    if (password !== confirm) return showError('Those passwords don\u2019t match.');

    const btn = document.getElementById('submitBtn');
    setBusy(btn, true);
    try {
      const { ok, data } = await postJson('/api/auth/register', { username, password, display_name });
      if (!ok) throw new Error(data.error || 'Could not create your account.');

      // The code is shown once and never retrievable, so it is shown BEFORE
      // going anywhere. Losing it means losing the only way back in.
      const codes = data.recovery_codes || (data.recovery_code ? [data.recovery_code] : null);
      if (codes && codes.length) {
        const panel = document.getElementById('recoveryPanel');
        const copy = document.getElementById('copyRecovery');
        const slots = [document.getElementById('recoveryCode1'), document.getElementById('recoveryCode2')];
        slots.forEach((el, i) => { if (el) el.textContent = codes[i] || '—'; });
        registerForm.hidden = true;
        panel.hidden = false;
        if (copy) {
          copy.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(codes.join('\n')); copy.textContent = 'Copied both'; }
            catch (e) { copy.textContent = 'Copy them by hand'; }
          });
        }
        return;
      }
      window.location.href = '/';
    } catch (err) {
      showError(err.message);
      setBusy(btn, false, 'Create account');
    }
  });
}
