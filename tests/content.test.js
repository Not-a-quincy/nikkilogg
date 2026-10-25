'use strict';
// Runs the real content script against a minimal DOM stub, so the decision flow
// (parse -> ask the worker -> render) is exercised without a browser.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

const MATCHER = fs.readFileSync(path.join(__dirname, '..', 'extension', 'lib', 'matcher.js'), 'utf8');
const CONTENT = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');

/** A DOM small enough to reason about, big enough to run the script. */
function makeDom(title) {
  const appended = [];

  function el(tag) {
    const node = {
      tagName: tag,
      style: {},
      children: [],
      _html: '',
      _shadow: null,
      set innerHTML(v) { this._html = String(v); },
      get innerHTML() { return this._html; },
      appendChild(c) { this.children.push(c); return c; },
      remove() {},
      setAttribute() {},
      getAttribute() { return null; },
      addEventListener() {},
      removeEventListener() {},
      classList: { add() {}, remove() {}, contains: () => false },
      querySelector() { return el('div'); },
      querySelectorAll() { return []; },
      attachShadow() {
        const shadow = el('shadow');
        shadow._byId = {};
        shadow.getElementById = (id) => (shadow._byId[id] = shadow._byId[id] || el('div'));
        this._shadow = shadow;
        return shadow;
      },
    };
    return node;
  }

  const document = {
    title,
    readyState: 'complete',
    visibilityState: 'visible',
    createElement: el,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: { appendChild: (n) => { appended.push(n); return n; } },
  };

  return { document, appended };
}

/** Runs content.js with a scripted set of worker replies. */
async function run({ title, url, replies, settings }) {
  const { document, appended } = makeDom(title);
  const sent = [];

  const chrome = {
    runtime: {
      sendMessage(msg, cb) {
        sent.push(msg);
        const reply = msg.type === 'settings' ? settings : replies[msg.type];
        setTimeout(() => cb(reply || { ok: false, error: 'no reply scripted' }), 0);
      },
    },
  };

  const sandbox = {
    document,
    chrome,
    location: { href: url || 'https://anitest.to/watch/frieren-beyond-journeys-end-episode-5' },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  new vm.Script(MATCHER, { filename: 'matcher.js' }).runInContext(sandbox);
  new vm.Script(CONTENT, { filename: 'content.js' }).runInContext(sandbox);

  await new Promise((r) => setTimeout(r, 60));

  const host = appended[0];
  const wrap = host && host._shadow && host._shadow._byId.wrap;
  const cards = wrap ? wrap.children.map((c) => c._html) : [];

  return { sent, cards, uiShown: cards.length > 0 };
}

const ON = { ok: true, data: { enabled: true, token: 'nkl_x', autoLog: true, threshold: 85, idleMinutes: 8 } };
const OFF = { ok: true, data: { enabled: false, token: '' } };
const HIT = { ok: true, data: { confident: true, best: { mal_id: 52991, title: "Frieren: Beyond Journey's End", tracking: null } } };
const UNSURE = { ok: true, data: { confident: false, best: { mal_id: 52991, title: "Frieren: Beyond Journey's End", tracking: null } } };

(async () => {
  // 1. a non-episode page must be completely silent
  let r = await run({ title: 'AniTest — watch anime free', url: 'https://anitest.to/', settings: ON, replies: {} });
  ck('non-episode page never asks for a lookup', !r.sent.some((m) => m.type === 'lookup'), r.sent.map((m) => m.type).join(','));
  ck('non-episode page shows no UI', r.uiShown === false);

  // 2. disabled extension must not even ask
  r = await run({ title: "Frieren: Beyond Journey's End Episode 5 | AniTest", settings: OFF, replies: {} });
  ck('disabled extension never asks for a lookup', !r.sent.some((m) => m.type === 'lookup'), r.sent.map((m) => m.type).join(','));
  ck('disabled extension shows no UI', r.uiShown === false);

  // 3. enabled: it should ask the worker about the parsed title
  r = await run({ title: "Frieren: Beyond Journey's End Episode 5 | AniTest", settings: ON, replies: { lookup: HIT } });
  const lookup = r.sent.find((m) => m.type === 'lookup');
  ck('asks the worker to look up the parsed title', !!lookup && /Frieren/.test(lookup.title), lookup && lookup.title);
  ck('confident match logs silently (no card yet)', r.uiShown === false, r.cards.length + ' cards');

  // 4. unsure: it must ask once, naming the show and the episode
  r = await run({ title: "Frieren: Beyond Journey's End Episode 5 | AniTest", settings: ON, replies: { lookup: UNSURE } });
  ck('unsure match renders exactly one card', r.cards.length === 1, r.cards.length + ' cards');
  ck('the card names the show', /Frieren/.test(r.cards[0] || ''));
  ck('the card names the episode', /episode 5/i.test(r.cards[0] || ''));
  ck('the card asks rather than assumes', /Is this/i.test(r.cards[0] || ''));
  ck('the card is not a modal or dialog', !/dialog|modal|overlay/i.test(r.cards[0] || ''));

  // 5. a broken token is reported once, quietly
  r = await run({ title: "Frieren: Beyond Journey's End Episode 5 | AniTest", settings: ON, replies: { lookup: { ok: false, error: 'Invalid or revoked API token.' } } });
  ck('a bad token surfaces one message', r.cards.length === 1, r.cards.length + ' cards');
  ck('the message says it is not connected', /not connected/i.test(r.cards[0] || ''), (r.cards[0] || '').slice(0, 50));

  // 6. already logged at this episode: say nothing
  r = await run({
    title: "Frieren: Beyond Journey's End Episode 5 | AniTest", settings: ON,
    replies: { lookup: { ok: true, data: { confident: true, best: { mal_id: 52991, title: 'Frieren', tracking: { current_episode: 5 } } } } },
  });
  ck('already-logged episode stays silent', r.uiShown === false, r.cards.length + ' cards');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
