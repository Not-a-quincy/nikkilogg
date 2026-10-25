'use strict';
// In-process smoke test using node:http (avoids undici/wasm in this sandbox).
process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key-for-smoke-test';
process.env.BASE_URL = 'http://127.0.0.1:5055';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.DB_PORT = '3306';

const http = require('http');
const { ROOT } = require('./helpers/paths');
const app = require('../src/app');

function req(method, path) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: '127.0.0.1', port: 5055, path, method, headers: { Accept: 'text/html' } },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    r.on('error', reject);
    r.end();
  });
}

const server = app.listen(5055, async () => {
  const checks = [
    ['GET', '/', 200, 'Nikkilog'],
    ['GET', '/login', 200, 'type="password"'],
    ['GET', '/browse', 200, 'window.isLoggedIn'],
    ['GET', '/anime/1', 200, 'context-data'],
    ['GET', '/nope', 404, 'Not Found'],
    ['GET', '/admin/reports', 302, null],
    ['GET', '/api/context', 401, null],
    ['GET', '/api/anime', 500, null],
  ];
  let pass = 0, fail = 0;
  for (const [method, path, expect, marker] of checks) {
    try {
      const r = await req(method, path);
      const okStatus = r.status === expect;
      const okMarker = marker ? r.body.includes(marker) : true;
      const ok = okStatus && okMarker;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${method} ${path} -> ${r.status} (want ${expect})${marker ? ` has "${marker}": ${r.body.includes(marker)}` : ''}`);
      ok ? pass++ : fail++;
    } catch (e) {
      console.log(`ERROR ${method} ${path}: ${e.message}`);
      fail++;
    }
  }
  const ejs = require('ejs');
  const fs = require('fs');
  for (const v of ['index', 'login', 'browse', 'anime', 'profile', 'admin_reports']) {
    try {
      ejs.compile(fs.readFileSync(`${ROOT}/views/${v}.ejs`, 'utf8'), { filename: v });
      console.log(`PASS  template ${v}.ejs compiles`);
      pass++;
    } catch (e) {
      console.log(`FAIL  template ${v}.ejs: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  server.close(() => process.exit(fail ? 1 : 0));
});
