'use strict';
// The recovery code is shown once and never retrievable, so if the panel does not
// actually appear the code is lost forever. A markup check is not enough — this
// drives the real form through a real browser and asserts the panel shows.
process.env.SECRET_KEY = 'v'.repeat(64);
process.env.DB_HOST = '127.0.0.1';

const { launch } = require('./helpers/browser');
const app = require('../src/app');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

(async () => {
  const server = app.listen(5078);
  await new Promise((r) => server.once('listening', r));
  const browser = await launch();
  if (!browser) { console.log('skipped — no browser available'); server.close(); process.exit(0); }
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/auth/register')) {
      return r.respond({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ success: true, user: { id: 1, username: 'ughdrag' }, recovery_codes: ['4821-9037-2210-5566', '7831-9589-5351-3842'] }) });
    }
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{}' });
    return r.continue();
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.setViewport({ width: 620, height: 900 });
  await page.goto('http://127.0.0.1:5078/register', { waitUntil: 'networkidle2' });

  await page.evaluate(() => {
    document.getElementById('display_name').value = 'Vasanth';
    document.getElementById('username').value = 'ughdrag';
    document.getElementById('password').value = 'a-long-passphrase';
    document.getElementById('confirm').value = 'a-long-passphrase';
    document.getElementById('registerForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await new Promise((r) => setTimeout(r, 900));

  const after = await page.evaluate(() => {
    const panel = document.getElementById('recoveryPanel');
    const form = document.getElementById('registerForm');
    const c1 = document.getElementById('recoveryCode1');
    const c2 = document.getElementById('recoveryCode2');
    return {
      panelShown: !!panel && !panel.hidden,
      formHidden: !!form && form.hidden,
      code: c1 ? c1.textContent.trim() : '',
      code2: c2 ? c2.textContent.trim() : '',
      panelText: panel ? panel.textContent : '',
      stillOnRegister: location.pathname === '/register',
    };
  });

  ck('no JavaScript error while signing up', errors.length === 0, errors[0] || 'none');
  ck('the recovery panel is shown', after.panelShown === true);
  ck('the form is hidden behind it', after.formHidden === true);
  ck('the first code is on the screen', after.code === '4821-9037-2210-5566', after.code);
  ck('the SECOND code is on the screen too', after.code2 === '7831-9589-5351-3842', after.code2);
  ck('the two codes are different', after.code !== after.code2);
  ck('both are formatted in groups of four',
    /^\d{4}-\d{4}-\d{4}-\d{4}$/.test(after.code) && /^\d{4}-\d{4}-\d{4}-\d{4}$/.test(after.code2));
  ck('the page does NOT navigate away before it is read', after.stillOnRegister === true, 'path ' + (after.stillOnRegister ? '/register' : 'elsewhere'));
  ck('it tells you the codes are shown once', /shown once/i.test(after.panelText));
  ck('it says this is the only way back in', /only\s+way back/i.test(after.panelText));
  ck('it offers a copy button', /Copy both/i.test(after.panelText));
  ck('it labels the two codes apart', /somewhere at home/i.test(after.panelText) && /somewhere else/i.test(after.panelText));
  ck('it offers a way to continue', /continue/i.test(after.panelText));

  // and the recovery page formats the code as you type
  await page.goto('http://127.0.0.1:5078/recover', { waitUntil: 'networkidle2' });
  const typed = await page.evaluate(() => {
    const input = document.getElementById('code');
    input.value = '4821903722105566';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  });
  ck('the recovery page groups the code as it is typed', typed === '4821-9037-2210-5566', typed);

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
