/* Service worker: owns the token, talks to the Nikkilog server.
   The content script never sees the token and never makes cross-origin calls. */
'use strict';

const DEFAULTS = {
  serverUrl: 'http://127.0.0.1:5000',
  token: '',
  enabled: true,
  threshold: 85,      // percent of the video considered "watched"
  idleMinutes: 8,     // fallback when the player is in a cross-origin iframe
  autoLog: true,      // log silently; no dialog
};

async function settings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return Object.assign({}, DEFAULTS, stored);
}

function apiUrl(serverUrl, path) {
  return String(serverUrl).replace(/\/+$/, '') + path;
}

async function callServer(path, options) {
  const s = await settings();
  if (!s.token) throw new Error('No token saved. Open the extension and paste one.');

  const res = await fetch(apiUrl(s.serverUrl, path), Object.assign({
    headers: {
      Authorization: 'Bearer ' + s.token,
      'Content-Type': 'application/json',
    },
  }, options || {}));

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || ('Server said ' + res.status));
  return data;
}

async function lookup(title) {
  return callServer('/api/extension/lookup?title=' + encodeURIComponent(title));
}

async function progress(payload) {
  return callServer('/api/extension/progress', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'lookup') return sendResponse({ ok: true, data: await lookup(msg.title) });
      if (msg.type === 'progress') return sendResponse({ ok: true, data: await progress(msg.payload) });
      if (msg.type === 'settings') return sendResponse({ ok: true, data: await settings() });
      if (msg.type === 'test') {
        const me = await callServer('/api/extension/me');
        return sendResponse({ ok: true, data: me });
      }
      sendResponse({ ok: false, error: 'Unknown message: ' + msg.type });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep the channel open for the async reply
});
