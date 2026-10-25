'use strict';

const { EventEmitter } = require('events');

/**
 * A session store that prefers the database but never breaks the site.
 *
 * The primary store is MySQL (sessions survive a restart, and we never touch
 * the filesystem). If the database is unreachable, every session operation is
 * served from an in-memory copy instead of erroring — so a database blip
 * degrades to "you get logged out on restart", never to a 500 on every page.
 *
 * express-session requires the store to be an EventEmitter (it subscribes to
 * 'disconnect'), so we return an emitter with the store methods attached.
 *
 * IMPORTANT: we proxy *every* method the underlying store provides rather than
 * listing them by hand. Enumerating the interface is how `regenerate` went
 * missing once, which broke logging in with
 * "this.req.sessionStore.regenerate is not a function".
 */

function resilientStore(primary, logFn) {
  const log = logFn || ((msg) => console.error(msg));
  const memory = new Map();
  let degraded = false;

  function degrade(reason) {
    if (!degraded) {
      degraded = true;
      log('Session store: falling back to memory — ' + reason);
    }
  }

  const store = new EventEmitter();

  // pass through any events the underlying store raises
  if (primary && typeof primary.on === 'function') {
    for (const event of ['disconnect', 'connect', 'error']) {
      primary.on(event, (...args) => store.emit(event, ...args));
    }
  }

  // ---------------------------------------------------------------------
  // Methods with fallback behaviour — these win over the proxied versions.
  // ---------------------------------------------------------------------

  store.get = (sid, cb) => {
    if (degraded) return cb(null, memory.get(sid) || null);
    primary.get(sid, (err, session) => {
      if (err) {
        degrade(err.code || err.message);
        return cb(null, memory.get(sid) || null);
      }
      cb(null, session);
    });
  };

  store.set = (sid, session, cb) => {
    memory.set(sid, session);
    const done = cb || (() => {});
    if (degraded) return done(null);
    primary.set(sid, session, (err) => {
      if (err) {
        degrade(err.code || err.message);
        return done(null);
      }
      done(null);
    });
  };

  store.destroy = (sid, cb) => {
    memory.delete(sid);
    const done = cb || (() => {});
    if (degraded) return done(null);
    primary.destroy(sid, () => done(null));
  };

  store.touch = (sid, session, cb) => {
    memory.set(sid, session);
    const done = cb || (() => {});
    if (degraded || typeof primary.touch !== 'function') return done(null);
    primary.touch(sid, session, () => done(null));
  };

  /**
   * Called by `req.session.regenerate()`, which every login does to prevent
   * session fixation.
   *
   * The signature is easy to get wrong: express-session calls this as
   * `regenerate(req, fn)` with the REQUEST, not with a session id. And its base
   * implementation calls `this.generate(req)` — a function express-session
   * attaches to the store object it was handed (this wrapper), not to the
   * underlying store. The MySQL store inherits that base `regenerate` but has
   * no `generate` of its own, so delegating to it throws
   * "self.generate is not a function". We therefore implement it here.
   */
  store.regenerate = (req, fn) => {
    const done = typeof fn === 'function' ? fn : () => {};
    const sid = req && req.sessionID;

    if (sid) memory.delete(sid);

    const rebuild = () => {
      // express-session put generate() on this object — use it so the request
      // gets a fresh session id and a fresh Session.
      if (typeof store.generate === 'function') {
        store.generate(req);
      } else {
        log('Session store: no generate() attached; session id not rotated');
      }
      done(null); // a failed rotation must never block a login
    };

    if (!sid || typeof primary.destroy !== 'function') return rebuild();

    primary.destroy(sid, (err) => {
      if (err) degrade(err.code || err.message);
      rebuild();
    });
  };

  store.length = (cb) => {
    if (degraded || typeof primary.length !== 'function') return cb(null, memory.size);
    primary.length((err, n) => cb(null, err ? memory.size : n));
  };

  store.clear = (cb) => {
    memory.clear();
    if (degraded || typeof primary.clear !== 'function') return cb(null);
    primary.clear(() => cb(null));
  };

  store.all = (cb) => {
    if (degraded || typeof primary.all !== 'function') {
      return cb(null, Array.from(memory.values()));
    }
    primary.all((err, list) => cb(null, err ? Array.from(memory.values()) : list));
  };

  // ---------------------------------------------------------------------
  // Proxy anything else the underlying store offers, so we can never drop part
  // of the Store interface again.
  // ---------------------------------------------------------------------
  const seen = new Set();
  for (let obj = primary; obj && obj !== Object.prototype; obj = Object.getPrototypeOf(obj)) {
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (seen.has(key) || key === 'constructor' || key.startsWith('_')) continue;
      seen.add(key);
      if (key in store) continue;                     // ours wins
      if (typeof primary[key] !== 'function') continue;
      store[key] = (...args) => primary[key](...args); // `this` stays bound to primary
    }
  }

  return store;
}

module.exports = { resilientStore };
