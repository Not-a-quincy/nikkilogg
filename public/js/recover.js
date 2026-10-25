/* Resetting a password with a recovery code. */
'use strict';

(function () {
  const form = document.getElementById('recoverForm');
  if (!form) return;

  const err = document.getElementById('authError');
  const btn = document.getElementById('submitBtn');

  // Tidy the code as it is typed, so "4821 9037 2210 5566" becomes the grouped
  // form. Typing is never blocked — only reformatted.
  const codeInput = document.getElementById('code');
  codeInput.addEventListener('input', () => {
    const digits = codeInput.value.replace(/\D/g, '').slice(0, 16);
    codeInput.value = digits.replace(/(.{4})(?=.)/g, '$1-');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';

    const username = form.username.value.trim();
    const code = form.code.value;
    const password = form.new_password.value;

    if (!username) return (err.textContent = 'Enter your username.');
    if (code.replace(/\D/g, '').length !== 16) return (err.textContent = 'A recovery code is 16 digits.');
    if (password.length < 8) return (err.textContent = 'Your new password must be at least 8 characters.');

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Checking\u2026';
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      window.location.href = '/';
    } catch (e2) {
      err.textContent = e2.message;
      btn.disabled = false;
      btn.textContent = label;
    }
  });
})();
