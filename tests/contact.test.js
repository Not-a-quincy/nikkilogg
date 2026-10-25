'use strict';
// Contact is Twitter-only: no email address is published anywhere. The handle is
// normalised so a stray space or a pasted profile URL still makes a working link.
const path = require('path');
const ejs = require('ejs');
const contact = require('../src/services/contact');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };
const ROOT = path.join(__dirname, '..');

// ---- normalising the handle ----
ck('a plain handle passes through', contact.normaliseHandle('ughdrag') === 'ughdrag');
ck('a leading @ is stripped', contact.normaliseHandle('@ughdrag') === 'ughdrag');
ck('several @s are stripped', contact.normaliseHandle('@@ughdrag') === 'ughdrag');
ck('surrounding whitespace is trimmed', contact.normaliseHandle('  @ughdrag  ') === 'ughdrag');
ck('an underscore survives', contact.normaliseHandle('@ugh_drag') === 'ugh_drag');
// the exact string that was asked for, space and all
ck('a handle written with a space still resolves', contact.normaliseHandle('@ugh drag') === 'ughdrag', contact.normaliseHandle('@ugh drag'));
ck('a pasted twitter URL resolves', contact.normaliseHandle('https://twitter.com/ughdrag') === 'ughdrag');
ck('a pasted x.com URL resolves', contact.normaliseHandle('https://x.com/ughdrag/') === 'ughdrag');
ck('a URL with an @ resolves', contact.normaliseHandle('https://x.com/@ughdrag') === 'ughdrag');
ck('punctuation is dropped', contact.normaliseHandle('ugh-drag!') === 'ughdrag');
ck('digits survive', contact.normaliseHandle('ugh123') === 'ugh123');
ck('an empty string is empty', contact.normaliseHandle('') === '' && contact.normaliseHandle('   ') === '');
ck('null and undefined are empty', contact.normaliseHandle(null) === '' && contact.normaliseHandle(undefined) === '');
ck('something unusable becomes empty', contact.normaliseHandle('!!!') === '');

// ---- building the link ----
ck('the url is built', contact.twitterUrl('ughdrag') === 'https://twitter.com/ughdrag');
ck('the url is normalised too', contact.twitterUrl('@ugh drag') === 'https://twitter.com/ughdrag');
ck('no handle means no url', contact.twitterUrl('') === null);

// ---- the object the templates use ----
const built = contact.buildContact('@ughdrag');
ck('the network is named', built.network === 'Twitter');
ck('the handle is bare', built.handle === 'ughdrag');
ck('the display form has the @', built.display === '@ughdrag');
ck('the link is present', built.url === 'https://twitter.com/ughdrag');
ck('nothing configured means null', contact.buildContact('') === null && contact.buildContact(null) === null);

// ---- the pages ----
(async () => {
  const render = (view, locals) => ejs.renderFile(path.join(ROOT, 'views', view), locals);

  for (const view of ['about.ejs', 'privacy.ejs']) {
    const withContact = await render(view, { contact: built, currentUser: null, isLoggedIn: false });
    const without = await render(view, { contact: null, currentUser: null, isLoggedIn: false });

    ck(`${view}: shows the handle`, withContact.includes('@ughdrag'));
    ck(`${view}: links to Twitter`, withContact.includes('href="https://twitter.com/ughdrag"'));
    ck(`${view}: the link opens safely`, /rel="me noopener"/.test(withContact) && /target="_blank"/.test(withContact));
    ck(`${view}: publishes NO mailto link`, !/mailto:/i.test(withContact));
    ck(`${view}: publishes NO email address at all`, !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(withContact), 'no address found');
    ck(`${view}: says so when nothing is configured`, without.includes('No contact details'));
    ck(`${view}: still publishes no email when unconfigured`, !/mailto:/i.test(without) && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(without));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
