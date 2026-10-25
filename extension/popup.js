'use strict';

const DEFAULTS = {
  serverUrl: 'http://127.0.0.1:5000',
  token: '',
  enabled: true,
  threshold: 85,
  idleMinutes: 8,
  autoLog: true,
};

const $ = (id) => document.getElementById(id);
const status = (msg, cls) => {
  $('status').textContent = msg;
  $('status').className = cls || '';
};

function originPattern(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}/*`;
  } catch (e) {
    return null;
  }
}

/** Chrome needs explicit permission before the worker may call a new origin. */
async function ensurePermission(url) {
  const pattern = originPattern(url);
  if (!pattern) throw new Error('That does not look like a URL.');
  const has = await chrome.permissions.contains({ origins: [pattern] });
  if (has) return true;
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error('Permission for that server was declined.');
  return true;
}

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $('serverUrl').value = s.serverUrl;
  $('token').value = s.token;
  $('enabled').checked = !!s.enabled;
  $('autoLog').checked = !!s.autoLog;
  $('threshold').value = s.threshold;
  $('idleMinutes').value = s.idleMinutes;
  $('thresholdVal').textContent = s.threshold;
  $('idleVal').textContent = s.idleMinutes;
  $('tokenLink').textContent = s.serverUrl.replace(/\/+$/, '') + '/settings';
}

$('threshold').addEventListener('input', (e) => { $('thresholdVal').textContent = e.target.value; });
$('idleMinutes').addEventListener('input', (e) => { $('idleVal').textContent = e.target.value; });

$('save').addEventListener('click', async () => {
  const serverUrl = $('serverUrl').value.trim().replace(/\/+$/, '');
  try {
    await ensurePermission(serverUrl);
  } catch (e) {
    return status(e.message, 'bad');
  }
  await chrome.storage.sync.set({
    serverUrl,
    token: $('token').value.trim(),
    enabled: $('enabled').checked,
    autoLog: $('autoLog').checked,
    threshold: Number($('threshold').value) || 85,
    idleMinutes: Number($('idleMinutes').value) || 8,
  });
  $('tokenLink').textContent = serverUrl + '/settings';
  status('Saved.', 'ok');
});

$('test').addEventListener('click', () => {
  status('Testing…');
  chrome.runtime.sendMessage({ type: 'test' }, (reply) => {
    if (reply && reply.ok) {
      status('Connected as ' + (reply.data.display_name || 'your account') + '.', 'ok');
    } else {
      status((reply && reply.error) || 'No response from the extension worker.', 'bad');
    }
  });
});

load();
