/* Make a whole anime card open its info page, not just the poster.
 *
 * Cards contain their own controls (a "+1 Ep" button, a "Want to Watch" button,
 * a dropdown), so a naive click handler would hijack them. This ignores any
 * click that lands on something interactive and lets it do its own job.
 *
 * Keyboard access matters too: a clickable div is invisible to a keyboard, so
 * the card gets role="link", a tab stop, and Enter/Space handling.
 */
'use strict';

(function () {
  const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [data-no-card-nav]';

  function makeClickable(card, href) {
    if (!card || !href) return card;

    card.dataset.cardHref = href;
    card.classList.add('is-clickable');
    if (!card.hasAttribute('role')) card.setAttribute('role', 'link');
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');

    card.addEventListener('click', (e) => {
      // a real link or control inside the card handles its own click
      if (e.target.closest && e.target.closest(INTERACTIVE)) return;
      // let the browser handle modified clicks
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (window.getSelection && String(window.getSelection()).length) return; // selecting text
      window.location.href = href;
    });

    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest && e.target.closest(INTERACTIVE)) return;
      e.preventDefault();
      window.location.href = href;
    });

    return card;
  }

  /** Card links should navigate in place; opening a new tab per card is jarring. */
  function sameTab(anchor) {
    if (anchor && anchor.getAttribute('target') === '_blank') anchor.removeAttribute('target');
    return anchor;
  }

  window.NikkilogCards = { makeClickable, sameTab, INTERACTIVE };
})();
