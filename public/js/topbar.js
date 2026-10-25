/* ==========================================================================
   Nikkilog — shared top bar behaviour (every page loads this)
   - mobile menu toggle
   - the search button: opens the page's search overlay, or focuses the
     hero search, or falls back to Browse
   ========================================================================== */
'use strict';

(function () {
  // --- mobile menu ---
  const menuBtn = document.getElementById('topbarMenuBtn');
  const topnav = document.getElementById('topnav');
  if (menuBtn && topnav) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = topnav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.querySelector('.material-symbols-outlined').textContent = open ? 'close' : 'menu';
    });
    document.addEventListener('click', (e) => {
      if (topnav.classList.contains('open') && !topnav.contains(e.target) && e.target !== menuBtn) {
        topnav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
        const icon = menuBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = 'menu';
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && topnav.classList.contains('open')) {
        topnav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // --- search ---
  const searchBtn = document.getElementById('topbarSearchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const overlay = document.querySelector('.search-overlay-container');
      if (overlay) {
        const open = overlay.classList.toggle('active');
        const input = overlay.querySelector('input[type="search"]');
        if (open && input) input.focus();
        return;
      }
      const heroInput = document.getElementById('heroSearch');
      if (heroInput) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        heroInput.focus();
        return;
      }
      window.location.href = '/browse?category=all';
    });
  }
})();
