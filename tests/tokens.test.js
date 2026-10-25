process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key-for-token-tests';

'use strict';
// The token service's pure parts. The database paths are covered by hand.
const T = require('../src/services/tokens.js');
let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

ck('token prefix is nkl_', T.PREFIX === 'nkl_');
ck('hash is a 64-char hex digest', /^[0-9a-f]{64}$/.test(T.hash('hello')), T.hash('hello').slice(0, 16) + '…');
ck('hash is deterministic', T.hash('hello') === T.hash('hello'));
ck('different tokens hash differently', T.hash('a') !== T.hash('b'));
ck('hash never contains the input', !T.hash('nkl_secret').includes('secret'));

// the exported API surface the routes rely on
for (const fn of ['createToken', 'listTokens', 'revokeToken', 'userForToken']) {
  ck('exports ' + fn, typeof T[fn] === 'function');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
