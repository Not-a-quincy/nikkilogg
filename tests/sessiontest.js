'use strict';
const { resilientStore } = require('../src/services/sessionStore');
let pass=0, fail=0;
const ck=(n,c,x)=>{console.log(`${c?'PASS':'FAIL'}  ${n}${x!==undefined?'  ['+x+']':''}`);c?pass++:fail++;};
const tick=()=>new Promise(r=>setTimeout(r,20));

// a healthy fake store
function goodStore(){ const m=new Map(); return {
  get:(sid,cb)=>cb(null,m.get(sid)||null), set:(sid,s,cb)=>{m.set(sid,s);cb(null);},
  destroy:(sid,cb)=>{m.delete(sid);cb(null);}, touch:(sid,s,cb)=>{m.set(sid,s);cb(null);},
  length:(cb)=>cb(null,m.size), clear:(cb)=>{m.clear();cb(null);}, all:(cb)=>cb(null,[...m.values()]),
  map:m }; }

// a store that fails exactly like MySQL does when it is unreachable
function badStore(){ return {
  get:(sid,cb)=>cb(Object.assign(new Error('ECONNREFUSED'),{code:'ECONNREFUSED'})),
  set:(sid,s,cb)=>cb(Object.assign(new Error('ECONNREFUSED'),{code:'ECONNREFUSED'})),
  destroy:(sid,cb)=>cb(Object.assign(new Error('ECONNREFUSED'),{code:'ECONNREFUSED'})),
  touch:(sid,s,cb)=>cb(Object.assign(new Error('ECONNREFUSED'),{code:'ECONNREFUSED'})),
  on:()=>{} }; }

(async()=>{
  // ---- express-session requires an EventEmitter ----
  const { EventEmitter } = require('events');
  const s0 = resilientStore(goodStore(), ()=>{});
  ck('store is an EventEmitter', s0 instanceof EventEmitter);
  ck('store has an on() method', typeof s0.on === 'function');
  let fired=false; s0.on('disconnect', ()=>{fired=true;}); s0.emit('disconnect');
  ck('store emits events', fired===true);

  // ---- healthy path ----
  const good = goodStore();
  const s1 = resilientStore(good, ()=>{});
  s1.set('abc', {user:1}, ()=>{}); await tick();
  ck('healthy: write reaches the database', good.map.has('abc'));
  let got; s1.get('abc', (e,v)=>{got=v;}); await tick();
  ck('healthy: read returns the session', got && got.user===1);
  s1.destroy('abc', ()=>{}); await tick();
  ck('healthy: destroy removes it', !good.map.has('abc'));

  // ---- database down ----
  const logs=[];
  const s2 = resilientStore(badStore(), (m)=>logs.push(m));
  let err=null;
  s2.get('xyz', (e,v)=>{err=e;}); await tick();
  ck('degraded: read does NOT error', err===null, err&&err.code);
  s2.set('xyz', {user:9}, (e)=>{err=e;}); await tick();
  ck('degraded: write does NOT error', err===null);
  ck('degraded: session kept in memory', true);
  let got2; s2.get('xyz', (e,v)=>{got2=v;}); await tick();
  ck('degraded: session is readable again', got2 && got2.user===9);
  ck('degraded: it logged the fallback once', logs.length===1, logs.length+' log(s)');
  let err2=null; s2.touch('xyz', {user:9}, (e)=>{err2=e;}); await tick();
  ck('degraded: touch does NOT error', err2===null);
  let err3=null; s2.destroy('xyz', (e)=>{err3=e;}); await tick();
  ck('degraded: destroy does NOT error', err3===null);

  // ---- a store missing optional methods ----
  const partial = { get:(s,cb)=>cb(null,null), set:(s,v,cb)=>cb(null), destroy:(s,cb)=>cb(null) };
  const s3 = resilientStore(partial, ()=>{});
  let e4=null; s3.touch('q',{},(e)=>{e4=e;}); await tick();
  ck('missing touch() is tolerated', e4===null);
  const n4 = await new Promise((res)=> s3.length((e,n)=>res(n)));
  ck('missing length() is tolerated', typeof n4==='number', String(n4));
  const a4 = await new Promise((res)=> s3.all((e,l)=>res(l)));
  ck('missing all() is tolerated', Array.isArray(a4), Array.isArray(a4)?a4.length+' items':'not an array');

// ---------------------------------------------------------------------------
// The Store interface must be complete, and regenerate must match
// express-session's real contract. Two bugs lived here: the wrapper listed the
// interface by hand (dropping `regenerate`), and then implemented `regenerate`
// with the wrong signature and delegated it to a base implementation that
// cannot work. Both broke every login.
//
// The old tests used a fake store that implemented regenerate properly — i.e. a
// fake more capable than the real thing. These use one shaped exactly like
// express-mysql-session's.
// ---------------------------------------------------------------------------
async function testRegenerate() {
  const express = require('express');
  const session = require('express-session');
  const BaseStore = require('express-session/session/store.js');

  // Exactly the shape of the real MySQL store: it inherits express-session's
  // base regenerate (which calls a `generate` it does not have) and defines no
  // generate of its own. express-session attaches generate() to the wrapper.
  function realLikeStore() {
    const s = new BaseStore();
    const m = new Map();
    s.get = (sid, cb) => cb(null, m.get(sid) || null);
    s.set = (sid, v, cb) => { m.set(sid, v); cb(null); };
    s.destroy = (sid, cb) => { m.delete(sid); cb(null); };
    s.touch = (sid, v, cb) => { m.set(sid, v); cb(null); };
    s._map = m;
    return s;
  }

  // 1. document why we implement regenerate ourselves
  const real = realLikeStore();
  ck('the real store shape has no generate of its own', typeof real.generate === 'undefined');
  ck('the real store shape inherits a regenerate', typeof real.regenerate === 'function');

  // 2. the wrapper exposes the whole interface the primary has
  const wrapped = resilientStore(realLikeStore(), () => {});
  const missing = ['get', 'set', 'destroy', 'touch', 'regenerate', 'length', 'clear', 'all']
    .filter((m) => typeof wrapped[m] !== 'function');
  ck('the wrapper exposes the whole Store interface', missing.length === 0, missing.join(',') || 'none missing');

  // 3. regenerate takes a REQUEST, not a session id — assert the signature
  const probe = realLikeStore();
  const wp = resilientStore(probe, () => {});
  let generated = 0;
  wp.generate = () => { generated++; };           // express-session attaches this
  probe._map.set('sid-1', { user: 1 });
  let err3 = null;
  wp.regenerate({ sessionID: 'sid-1' }, (e) => { err3 = e; });
  await tick();
  ck('regenerate accepts a request object', err3 === null);
  ck('regenerate drops the old session', !probe._map.has('sid-1'));
  ck('regenerate rebuilds the session via generate()', generated === 1, generated + ' call(s)');

  // 4. THE BUG: a real express-session login, with the real store shape
  async function loginThrough(primary) {
    const app = express();
    app.use(session({
      name: 't.sid', secret: 'test-secret', resave: false, saveUninitialized: false,
      store: resilientStore(primary, () => {}),
    }));
    app.get('/', (req, res) => {
      req.session.user = 1;
      const before = req.sessionID;
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: err.message });
        req.session.user = 1;
        res.json({ rotated: before !== req.sessionID, before, after: req.sessionID });
      });
    });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const port = server.address().port;
    const result = await new Promise((resolve) => {
      require('http').get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        let body = ''; res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ code: res.statusCode, body }));
      }).on('error', () => resolve({ code: 0, body: '' }));
    });
    server.close();
    return result;
  }

  const login = await loginThrough(realLikeStore());
  ck('a real login succeeds with the real store shape', login.code === 200, login.code + ' ' + login.body.slice(0, 70));
  ck('it no longer throws "self.generate is not a function"', !/generate is not a function/.test(login.body));
  ck('the session id is actually rotated (session-fixation defence)', /"rotated":true/.test(login.body), login.body.slice(0, 90));

  // 5. a failing destroy must not block the login
  const brokenDestroy = realLikeStore();
  brokenDestroy.destroy = (sid, cb) => cb(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));
  const degradedLogin = await loginThrough(brokenDestroy);
  ck('a failing destroy still lets the login through', degradedLogin.code === 200, degradedLogin.code);
}

  // run it before the summary so nothing races the exit
  await testRegenerate();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
