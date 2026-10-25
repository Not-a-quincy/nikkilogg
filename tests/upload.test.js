'use strict';
// Uploads are exercised end to end: a real multipart request through the real
// multer middleware and the real error handler. This exists because an
// unsupported file used to be dropped silently — the page said "saved" and
// nothing changed, which is indistinguishable from a bug to the person using it.
process.env.SECRET_KEY = 'u'.repeat(64);
process.env.DB_HOST = '127.0.0.1';

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { upload, uploadErrorHandler, allowedFile, unsupportedMessage, MAX_BYTES } = require('../src/middleware/upload');
const config = require('../src/config/env');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

const UPLOAD_DIR = path.join(config.publicDir, 'uploads');

function multipart(field, filename, bytes) {
  const b = '----t' + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${b}\r\nContent-Disposition: form-data; name="display_name"\r\n\r\nTester\r\n--${b}--\r\n`);
  return { body: Buffer.concat([head, bytes, tail]), type: `multipart/form-data; boundary=${b}` };
}

function post(port, payload) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/profile', method: 'POST',
      headers: { 'Content-Type': payload.type, 'Content-Length': payload.body.length } }, (res) => {
      let b = ''; res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* not json */ } resolve({ code: res.statusCode, json: j, raw: b }); });
    });
    req.on('error', (e) => resolve({ code: 0, json: null, raw: e.message }));
    req.write(payload.body); req.end();
  });
}

(async () => {
  // ---- the extension rules, on their own ----
  ['a.png', 'a.jpg', 'a.JPEG', 'a.gif', 'a.webp', 'a.avif', 'a.bmp'].forEach((f) => ck(`${f} is allowed`, allowedFile(f) === true));
  ['a.heic', 'a.HEIF', 'a.tiff', 'a.svg', 'a.txt', 'noextension'].forEach((f) => ck(`${f} is refused`, allowedFile(f) === false));
  ck('the HEIC message names the iPhone setting', /iPhone|HEIC/i.test(unsupportedMessage('x.heic')), unsupportedMessage('x.heic').slice(0, 60));
  ck('an unknown type still lists what works', /JPG, PNG, WebP/.test(unsupportedMessage('x.xyz')));
  ck('the size limit is generous enough for phone photos', MAX_BYTES >= 10 * 1024 * 1024, Math.round(MAX_BYTES / 1048576) + 'MB');

  // ---- end to end ----
  const app = express();
  app.use((req, res, next) => { req.user = { id: 42 }; next(); });
  app.post('/api/profile', upload.fields([{ name: 'profile_pic', maxCount: 1 }, { name: 'bg_image', maxCount: 1 }]),
    (req, res) => res.json({ ok: true, files: Object.keys(req.files || {}) }));
  app.use(uploadErrorHandler);
  app.use((err, req, res, next) => res.status(500).json({ error: 'reached the generic handler' }));

  const port = 5098;
  const server = app.listen(port);
  await new Promise((r) => server.once('listening', r));

  ck('the uploads directory exists', fs.existsSync(UPLOAD_DIR));

  const before = new Set(fs.readdirSync(UPLOAD_DIR));

  const good = await post(port, multipart('profile_pic', 'me.png', Buffer.alloc(200 * 1024, 7)));
  ck('a normal png is accepted', good.code === 200 && good.json && good.json.ok === true, good.code);
  ck('the file is reported back', good.json && good.json.files.includes('profile_pic'));

  const bg = await post(port, multipart('bg_image', 'banner.jpg', Buffer.alloc(300 * 1024, 7)));
  ck('a banner is accepted', bg.code === 200 && bg.json.files.includes('bg_image'), bg.code);

  const webp = await post(port, multipart('profile_pic', 'p.webp', Buffer.alloc(1024, 3)));
  ck('a webp is accepted', webp.code === 200, webp.code);

  // THE REGRESSION: this used to be a 200 with no file written.
  const txt = await post(port, multipart('profile_pic', 'notes.txt', Buffer.from('hello')));
  ck('an unsupported type is REFUSED, not silently dropped', txt.code === 415, txt.code);
  ck('the refusal explains what to use instead', txt.json && /JPG, PNG, WebP/.test(txt.json.error), txt.json && txt.json.error.slice(0, 60));
  ck('the refusal never reaches the generic handler', txt.json && txt.json.error !== 'reached the generic handler');

  const heic = await post(port, multipart('profile_pic', 'IMG_1234.HEIC', Buffer.from('heic')));
  ck('an iPhone HEIC is refused with advice', heic.code === 415 && /iPhone/i.test(heic.json.error), heic.json && heic.json.error.slice(0, 50));

  const huge = await post(port, multipart('bg_image', 'huge.png', Buffer.alloc(MAX_BYTES + 1024 * 1024, 7)));
  ck('an oversized image is a 413, not a 500', huge.code === 413, huge.code);
  ck('the size message names the limit', huge.json && /MB/.test(huge.json.error), huge.json && huge.json.error.slice(0, 50));

  // ---- what actually landed on disk ----
  const after = fs.readdirSync(UPLOAD_DIR).filter((f) => !before.has(f));
  ck('exactly the three valid files were written', after.length === 3, after.length + ' new file(s)');
  ck('nothing was written for the refused files', !after.some((f) => /txt|HEIC|huge/i.test(f)));
  ck('a profile picture is named for its field and user', after.some((f) => /^profile_42_[0-9a-f]{16}\.png$/.test(f)), after.find((f) => f.startsWith('profile')) || 'none');
  ck('a banner is named bg_*', after.some((f) => /^bg_42_[0-9a-f]{16}\.jpg$/.test(f)), after.find((f) => f.startsWith('bg')) || 'none');
  ck('filenames cannot collide (random suffix)', new Set(after).size === after.length);

  after.forEach((f) => fs.unlinkSync(path.join(UPLOAD_DIR, f)));
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
