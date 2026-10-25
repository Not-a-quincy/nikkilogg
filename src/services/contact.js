'use strict';

/**
 * How to reach the person running this site.
 *
 * Deliberately Twitter-only: no email address is published anywhere. The handle
 * is normalised so a stray "@", a space, or a pasted profile URL still produces
 * a working link rather than a broken one.
 */

/** Accepts "@name", "name", " name ", or a pasted x.com / twitter.com URL. */
function normaliseHandle(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return '';

  const fromUrl = value.match(/(?:twitter\.com|x\.com)\/@?([A-Za-z0-9_]+)/i);
  if (fromUrl) return fromUrl[1];

  // strip a leading @, then anything a handle cannot contain (spaces included)
  return value.replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '');
}

function twitterUrl(handle) {
  const name = normaliseHandle(handle);
  return name ? 'https://twitter.com/' + name : null;
}

/** Everything a template needs, or null when nothing is configured. */
function buildContact(handle) {
  const name = normaliseHandle(handle);
  if (!name) return null;
  return {
    network: 'Twitter',
    handle: name,
    display: '@' + name,
    url: twitterUrl(name),
  };
}

module.exports = { normaliseHandle, twitterUrl, buildContact };
