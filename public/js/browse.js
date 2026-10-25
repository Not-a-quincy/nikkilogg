// Browse.js

// --- Config & State ---
let anime_url = `/api/anime`;
let type_sort;
let status_sort;
let order_by_column = 'popularity';
let selectedGenres = [];
let selectedThemes = [];
let excludeGenres = [];
let excludeThemes = [];
let currentPage = 1;
const limit = 48;
let isLoading = false;
let allAnimeLoaded = false;
let selectedYear = '';
let selectedSeason = '';

const statusColors = {
  "Finished Airing": "#4CAF50",
  "Currently Airing": "#2196F3",
  "Not yet aired": "#FF9800",
  "Cancelled": "#F44336",
  "Hiatus": "#9C27B0"
};

const typeColors = {
  "TV": "#2196F3",
  "Movie": "#E91E63",
  "OVA": "#9C27B0",
  "ONA": "#00BCD4",
  "Special": "#FF9800",
  "Music": "#4CAF50",
  "Unknown": "#9E9E9E"
};

const anime_grid = document.querySelector('#dynamic_anime_grid');

// --- Helper Functions ---
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    type: params.get('type') || '',
    status: params.get('status') || '',
    order_by: params.get('order_by') || 'popularity',
    genres: params.get('genres') ? params.get('genres').split(',') : [],
    themes: params.get('themes') ? params.get('themes').split(',') : [],
    exclude_genres: params.get('exclude_genres') ? params.get('exclude_genres').split(',') : [],
    exclude_themes: params.get('exclude_themes') ? params.get('exclude_themes').split(',') : [],
    year: params.get('year') || '',
    season: params.get('season') || ''
  };
}

function updateURLParams() {
  const params = new URLSearchParams();
  if (type_sort) params.set('type', type_sort);
  if (status_sort) params.set('status', status_sort);
  if (order_by_column) params.set('order_by', order_by_column);
  if (selectedGenres.length > 0) params.set('genres', selectedGenres.join(','));
  if (excludeGenres.length > 0) params.set('exclude_genres', excludeGenres.join(','));
  if (selectedThemes.length > 0) params.set('themes', selectedThemes.join(','));
   if (excludeThemes.length > 0) params.set('exclude_themes', excludeThemes.join(','));
  if (selectedYear) params.set('year', selectedYear);
  if (selectedSeason) params.set('season', selectedSeason);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  history.replaceState(null, '', newUrl);
}

function populateYearDropdown() {
  const yearSelect = document.getElementById('year-select');
  if (!yearSelect) return;
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 1; // Show up to next year
  for (let y = maxYear; y >= 1980; y--) {
    const option = document.createElement('option');
    option.value = y;
    option.textContent = y;
    yearSelect.appendChild(option);
  }
}

// --- Anime Status API ---
async function updateAnimeStatus(mal_id, status, onSuccess) {
  try {
    const res = await fetch('/api/update-user-anime-tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mal_id, status })
    });
    const result = await res.json();
    if (res.ok) {
      // alert(`Anime added to ${status.replace('_', ' ')}!`);
      if (typeof onSuccess === 'function') onSuccess(status);
    } else {
      alert(result.message || 'Failed to update status.');
    }
  } catch (err) {
    alert('Could not update anime status. Please try again.');
  }
}

// --- Render Anime Card ---
function render_anime_card(data) {
  // Debug log for troubleshooting
  console.log('Anime:', data.title_en, 'mal_id:', data.mal_id, 'internal_anime_id:', data.internal_anime_id, 'user_status:', data.user_status);

  const anime_card = document.createElement('div');
  anime_card.classList.add('anime_card');

  // One bar for every control, so they line up instead of being scattered
  // around the card by three separate sets of absolute coordinates.
  const cardControls = document.createElement('div');
  cardControls.classList.add('card-controls');

  if (window.isLoggedIn === true || window.isLoggedIn === 'true') {
    const favorite = document.createElement('button');
    favorite.classList.add('favorite-btn');
    favorite.innerHTML = `<span class="material-symbols-outlined">favorite</span>`;
    cardControls.appendChild(favorite);

  if (data.is_favorited) favorite.classList.add('favorited');

  favorite.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: data.mal_id })
      });
      const result = await res.json();
      if (result.favorited) {
        favorite.classList.add('favorited');
      } else {
        favorite.classList.remove('favorited');
      }
    } catch (err) {
      alert('Could not update favorite. Please try again.');
    }
  });
  }

  if (data.user_status) {
  const statusBadge = document.createElement('span');
  statusBadge.classList.add('user-status-badge');
  let badgeText = '';
  let badgeColor = '';
  if (data.user_status === 'completed') {
    badgeText = 'cmpl';
    badgeColor = '#2ecc71';
  } else if (data.user_status === 'watching') {
    badgeText = 'cw';
    badgeColor = '#3498db';
  } else if (data.user_status === 'plan_to_watch') {
    badgeText = 'ptw';
    badgeColor = '#f39c12';
  }
  statusBadge.textContent = badgeText;
  statusBadge.style.background = badgeColor;
  statusBadge.style.color = '#fff';
  if (badgeText) cardControls.appendChild(statusBadge);
}

  // --- Main Action Button with Dropdown ---
   if (window.isLoggedIn === true || window.isLoggedIn === 'true') {
  const mainActionWrapper = document.createElement('div');
  mainActionWrapper.classList.add('main-action-wrapper');

  const mainActionBtn = document.createElement('button');
  mainActionBtn.classList.add('main-action-btn');
  mainActionBtn.innerHTML = `<span class="material-symbols-outlined">add</span>`;

  const actionDropdown = document.createElement('div');
  actionDropdown.classList.add('action-dropdown');

  const completedBtn = document.createElement('button');
  completedBtn.classList.add('action-option');
  // completedBtn.textContent = 'Add to Completed';
  completedBtn.dataset.status = 'completed';

  const watchingBtn = document.createElement('button');
  watchingBtn.classList.add('action-option');
  // watchingBtn.textContent = 'Add to Watching';
  watchingBtn.dataset.status = 'watching';

  const planBtn = document.createElement('button');
  planBtn.classList.add('action-option');
  // planBtn.textContent = 'Plan to Watch';
  planBtn.dataset.status = 'plan_to_watch';

  actionDropdown.appendChild(completedBtn);
  actionDropdown.appendChild(watchingBtn);
  actionDropdown.appendChild(planBtn);

  mainActionWrapper.appendChild(mainActionBtn);
  mainActionWrapper.appendChild(actionDropdown);
  cardControls.appendChild(mainActionWrapper);

  // --- Dropdown Show/Hide Logic (click toggle, more reliable) ---
  mainActionBtn.addEventListener('mouseover', (e) => {
    e.stopPropagation();
    actionDropdown.style.display = actionDropdown.style.display === 'flex' ? 'none' : 'flex';
  });
  // Hide dropdown when clicking outside
  anime_card.addEventListener('mouseleave', () => {
    actionDropdown.style.display = 'none';
  });
  // Prevent dropdown from closing when clicking inside
  actionDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // --- Status Button State Logic ---
  function updateStatusButtonStates(currentStatus) {
    [completedBtn, watchingBtn, planBtn].forEach(btn => {
      const btnStatus = btn.dataset.status;
      if (btnStatus === currentStatus) {
        btn.disabled = true;
        btn.textContent = `Already ${btnStatus.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}`;
        btn.style.opacity = 0.6;
        btn.style.cursor = 'not-allowed';
        btn.classList.add('current-status');
      } else {
        btn.disabled = false;
        btn.textContent = `${btnStatus.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}`;
        btn.style.opacity = 1;
        btn.style.cursor = 'pointer';
        btn.classList.remove('current-status');
      }
    });
  }

  // Initial setup of button states
  updateStatusButtonStates(data.user_status);

  completedBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!completedBtn.disabled) {
      await updateAnimeStatus(data.mal_id, 'completed', (newStatus) => {
        data.user_status = newStatus;
        updateStatusButtonStates(newStatus);
        actionDropdown.style.display = 'none';
      });
    }
  });

  watchingBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!watchingBtn.disabled) {
      await updateAnimeStatus(data.mal_id, 'watching', (newStatus) => {
        data.user_status = newStatus;
        updateStatusButtonStates(newStatus);
        actionDropdown.style.display = 'none';
      });
    }
  });

  planBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!planBtn.disabled) {
      await updateAnimeStatus(data.mal_id, 'plan_to_watch', (newStatus) => {
        data.user_status = newStatus;
        updateStatusButtonStates(newStatus);
        actionDropdown.style.display = 'none';
      });
    }
  });
   }
  // --- Top Section ---
  const topSection = document.createElement('section');
  topSection.classList.add('top-section');

  const titleEn = document.createElement('div');
  titleEn.classList.add('title-en');

  const titleEnAnchor = document.createElement('a');
  titleEnAnchor.classList.add('title_en_anchor');
  titleEnAnchor.href = `/anime/${data.mal_id || ''}`;
  titleEnAnchor.textContent = data.title_en || '';
  titleEn.appendChild(titleEnAnchor);
  if (data.anime_type) {
    const type = document.createElement('sup');
    type.classList.add('type');
    type.textContent = `(${data.anime_type})`;
    const colour = typeColors[data.anime_type];
    if (colour) type.style.color = colour;
    titleEn.appendChild(type);
  }
  
  topSection.appendChild(titleEn);

  if ((data.genre) && data.genre.length > 0) {
    const genreDiv = document.createElement('div');
    genreDiv.classList.add('genre');
    data.genre.forEach(genre => {
      let eachgenre = document.createElement('span');
      eachgenre.classList.add('genre-tag');
      eachgenre.textContent = genre.name;
      genreDiv.appendChild(eachgenre);
    });
    topSection.appendChild(genreDiv);
  }

  anime_card.appendChild(cardControls);
  anime_card.appendChild(topSection);

  // --- Middle Section ---
  const middleSection = document.createElement('section');
  middleSection.classList.add('middle-section');

  const image_div = document.createElement('div');
  image_div.classList.add('image_div');
  image_div.style.backgroundImage = `url('${data.poster_image_url || ''}')`;

  const rating = document.createElement('p');
  rating.classList.add('rating');
  rating.textContent = (data.average_rating !== undefined && data.average_rating !== null)
    ? `★ ${data.average_rating}`
    : '★ N/A';
  image_div.appendChild(rating);

  const middle_image_anchor = document.createElement('a');
  middle_image_anchor.classList.add('middle_image_anchor');
  middle_image_anchor.href = `/anime/${data.mal_id || ''}`;

  const middle_image = document.createElement('img');
  middle_image.classList.add('middle_image');
  middle_image.src = data.poster_image_url || '';
  middle_image.alt = data.title_en || '';

  middle_image_anchor.appendChild(middle_image);
  image_div.appendChild(middle_image_anchor);
  middleSection.appendChild(image_div);

  // Move the title overlay here, after the image_div
const titleOverlay = document.createElement('div');
titleOverlay.classList.add('mobile-title-overlay');
titleOverlay.innerHTML = `
  <a class="title_en_anchor" href="/anime/${data.mal_id}">
    ${data.title_en || data.title || data.title_jp || 'No Title'}
  </a>
`;
middleSection.appendChild(titleOverlay); // <-- append to middleSection, not anime_card

  // --- Synopsis and Misc ---
  const synopsis_and_misc = document.createElement('div');
  synopsis_and_misc.classList.add('synopsis_and_misc');
  middleSection.appendChild(synopsis_and_misc);

  const synopsis_div = document.createElement('div');
  synopsis_div.classList.add('synopsis_div');

  const synopsis_p = document.createElement('p');
  synopsis_p.classList.add('synopsis_p');
  synopsis_p.textContent = data.synopsis;
  synopsis_div.appendChild(synopsis_p);

  const misc_div = document.createElement('div');
  misc_div.classList.add('misc_div');

  // Year
  if (data.anime_year !== undefined && data.anime_year !== null) {
    const year = document.createElement('span');
    year.classList.add('year');
    year.textContent = `${data.anime_year}`;
    misc_div.appendChild(year);
  }

  // Status
  if (data.status) {
    const status = document.createElement('span');
    status.classList.add('status');
    status.textContent = data.status;
    const color = statusColors[data.status];
    if (color) status.style.color = color;
    misc_div.appendChild(status);
  }

  synopsis_and_misc.appendChild(synopsis_div);
  synopsis_and_misc.appendChild(misc_div);

  anime_card.appendChild(middleSection);
  return anime_card;
}

// --- Anime Fetch & Infinite Scroll ---
// Friendly, recoverable notices (empty results / failed fetch)
function showBrowseNotice(message, opts) {
  opts = opts || {};
  const el = document.getElementById('no-anime-message');
  if (!el) return;
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.textContent = opts.icon || 'search_off';
  const text = document.createElement('p');
  text.textContent = message;
  wrap.appendChild(icon);
  wrap.appendChild(text);
  if (opts.retry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'retry';
    btn.textContent = 'Try again';
    btn.addEventListener('click', () => {
      allAnimeLoaded = false;
      isLoading = false;
      el.style.display = 'none';
      fetchAndRenderAnime();
    });
    wrap.appendChild(btn);
  }
  el.appendChild(wrap);
  el.style.display = 'block';
}

async function fetchAndRenderAnime() {
  if (isLoading || allAnimeLoaded) return;

  isLoading = true;
  const noAnimeMsg = document.getElementById('no-anime-message');
  if (noAnimeMsg) noAnimeMsg.style.display = 'none';

  try {
    const cacheBuster = new Date().getTime();
    let url = `${anime_url}?page=${currentPage}&limit=${limit}&_=${cacheBuster}`;
    if (type_sort) url += `&type=${encodeURIComponent(type_sort)}`;
    if (status_sort) url += `&sort=${encodeURIComponent(status_sort)}`;
    if (order_by_column) url += `&order_by=${encodeURIComponent(order_by_column)}`;
    if (selectedGenres.length > 0) url += `&genres=${selectedGenres.map(encodeURIComponent).join(',')}`;
    if (selectedThemes.length > 0) url += `&themes=${selectedThemes.map(encodeURIComponent).join(',')}`;
    if (selectedYear) url += `&year=${encodeURIComponent(selectedYear)}`;
    if (selectedSeason) url += `&season=${encodeURIComponent(selectedSeason)}`;
    if (excludeGenres.length > 0) url += `&exclude_genres=${excludeGenres.map(encodeURIComponent).join(',')}`;
        if (excludeThemes.length > 0) url += `&exclude_themes=${excludeThemes.map(encodeURIComponent).join(',')}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`ERROR IN FETCHING ANIME DATA: ${response.status}`);

    const data = await response.json();

    if (!data.anime || data.anime.length === 0) {
      allAnimeLoaded = true;
      showBrowseNotice(data.message || 'No anime matched those filters.', { icon: 'search_off' });
      return;
    } else {
      if (noAnimeMsg) noAnimeMsg.style.display = 'none';
    }

    data.anime.forEach(anime_object => {
      const anime_card = render_anime_card(anime_object);
      // the whole card opens the info page, not just the poster
      if (window.NikkilogCards) window.NikkilogCards.makeClickable(anime_card, '/anime/' + (data.mal_id || ''));
      anime_grid.appendChild(anime_card);
    });

    currentPage++;

    if (data.anime.length < limit) {
      allAnimeLoaded = true;
    }
  } catch (error) {
    showBrowseNotice("We couldn't load the anime just now. The server or your connection may be down.", { icon: 'cloud_off', retry: true });
  } finally {
    isLoading = false;
  }

  if (currentPage === 2) {
    anime_grid.classList.add('loaded');
  }
}

anime_grid.addEventListener('scroll', () => {
  if (
    anime_grid.scrollTop + anime_grid.clientHeight >= anime_grid.scrollHeight - 700 &&
    !isLoading && !allAnimeLoaded
  ) {
    fetchAndRenderAnime();
  }
});

window.addEventListener('scroll', () => {
  if (document.documentElement.scrollTop + window.innerHeight >= document.documentElement.offsetHeight - 100) {
    fetchAndRenderAnime();
  }
});

// --- Filter UI & Logic ---
function resetAndLoadFirstPage() {
  currentPage = 1;
  allAnimeLoaded = false;
  anime_grid.innerHTML = '';
  updateURLParams();
  fetchAndRenderAnime();
}

function applyFiltersToUI() {
  const typeSelect = document.getElementById('type-sort');
  if (typeSelect) typeSelect.value = type_sort || '';
  const statusSelect = document.getElementById('status-sort');
  if (statusSelect) statusSelect.value = status_sort || '';
  const orderBySelect1 = document.getElementById('sortBy');
  const orderBySelect2 = document.getElementById('order-by-sort');
  if (orderBySelect1) orderBySelect1.value = order_by_column || 'popularity';
  if (orderBySelect2) orderBySelect2.value = order_by_column || 'popularity';
  document.querySelectorAll('.genres-group input[type="checkbox"]').forEach(cb => {
    cb.checked = selectedGenres.includes(cb.value);
  });
  document.querySelectorAll('.themes-group input[type="checkbox"]').forEach(cb => {
    cb.checked = selectedThemes.includes(cb.value);
  });
  const yearSelect = document.getElementById('year-select');
  if (yearSelect) yearSelect.value = selectedYear || '';
  const seasonSelect = document.getElementById('season-select');
  if (seasonSelect) seasonSelect.value = selectedSeason || '';
}

// --- Filter Event Listeners ---
const yearSelect = document.getElementById('year-select');
if (yearSelect) {
  yearSelect.addEventListener('change', function () {
    selectedYear = this.value;
    resetAndLoadFirstPage();
  });
}

const seasonSelect = document.getElementById('season-select');
if (seasonSelect) {
  seasonSelect.addEventListener('change', function () {
    selectedSeason = this.value;
    resetAndLoadFirstPage();
  });
}

const type_sort_select = document.getElementById('type-sort');
if (type_sort_select) {
  type_sort_select.addEventListener('change', function () {
    type_sort = this.value;
    resetAndLoadFirstPage();
  });
}

const status_sort_select = document.getElementById('status-sort');
if (status_sort_select) {
  status_sort_select.addEventListener('change', function () {
    status_sort = this.value;
    resetAndLoadFirstPage();
  });
}

const order_by_select = document.getElementById('sortBy') || document.getElementById('order-by-sort');
if (order_by_select) {
  order_by_select.addEventListener('change', function () {
    order_by_column = this.value;
    resetAndLoadFirstPage();
  });
}

// --- Filter Overlay Logic ---
const filterBtn = document.querySelector('.filter-btn');
const filterOverlay = document.querySelector('.filter-overlay');
const closeFilterBtn = document.querySelector('.close-filter');
const applyFiltersBtn = document.querySelector('.apply-filters');
const clearBtn = document.querySelector('.clear-filters');
const filterPanel = document.querySelector('.filter-panel');

if (filterBtn) {
  filterBtn.addEventListener('click', () => {
    filterOverlay.style.display = 'flex';
  });
}
if (closeFilterBtn) {
  closeFilterBtn.addEventListener('click', () => {
    filterOverlay.style.display = 'none';
  });
}
if (filterOverlay) {
  filterOverlay.addEventListener('click', (e) => {
    if (e.target === filterOverlay) {
      filterOverlay.style.display = 'none';
    }
  });
}
if (filterPanel) {
  filterPanel.addEventListener('click', (e) => {
    if (e.target === filterPanel) {
      filterOverlay.style.display = 'none';
    }
  });
}
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    document.querySelectorAll('.filter-panel .tag-checkbox').forEach(input => {
      input.dataset.state = "0";
      input.checked = false;
      updateLabelState(input);
    });
    selectedGenres = [];
    selectedThemes = [];
    excludeGenres = [];
    excludeThemes = [];
    updateFilterBadge();
    resetAndLoadFirstPage();
  });
}
if (applyFiltersBtn) {
  applyFiltersBtn.addEventListener('click', () => {
    selectedGenres = [];
    excludeGenres = [];
    document.querySelectorAll('.genres-group input.tag-checkbox').forEach(cb => {
      if (cb.dataset.state === "1") selectedGenres.push(cb.value);
      if (cb.dataset.state === "2") excludeGenres.push(cb.value);
    });
    selectedThemes = [];
    excludeThemes = [];
    document.querySelectorAll('.themes-group input.tag-checkbox').forEach(cb => {
      if (cb.dataset.state === "1") selectedThemes.push(cb.value);
      if (cb.dataset.state === "2") excludeThemes.push(cb.value);
    });
    resetAndLoadFirstPage();
    filterOverlay.style.display = 'none';
  });
}

// --- Three-state filter logic for tag-checkboxes ---
document.querySelectorAll('.tag-checkbox').forEach(input => {
  updateLabelState(input);
input.addEventListener('click', function (e) {
  e.preventDefault();
  let state = parseInt(this.dataset.state, 10);
  state = (state + 1) % 3;
  this.dataset.state = state;
  this.checked = (state === 1);
  updateLabelState(this);
  updateFilterBadge();
});
});

/** How many tags are switched on, shown on the Filter button. */
function updateFilterBadge() {
  const badge = document.getElementById('filterCount');
  if (!badge) return;
  const active = Array.from(document.querySelectorAll('.filter-panel .tag-checkbox'))
    .filter((cb) => cb.dataset.state && cb.dataset.state !== '0').length;
  badge.textContent = String(active);
  badge.hidden = active === 0;
}

function updateLabelState(input) {
  const label = input.closest('label');
  if (!label) return;
  const state = parseInt(input.dataset.state, 10);
  label.classList.remove('included', 'excluded', 'unselected');
  if (state === 1) {
    label.classList.add('included');
  } else if (state === 2) {
    label.classList.add('excluded');
  } else {
    label.classList.add('unselected');
  }
}

// --- Search Overlay ---
const searchInput = document.querySelector('[data-search]');
const searchResults = document.querySelector('.search-results');
const searchButton = document.querySelector('#search-button');
const searchOverlay = document.querySelector('.search-overlay-container');

function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

async function fetchAnime(search = '') {
  const url = `api/anime?limit=5${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  try {
    const res = await fetch(url);
    return res.ok ? res.json() : {};
  } catch (err) {
    console.error('Anime fetch error:', err);
    return {};
  }
}

function renderSearchAnimeCard(anime) {
  const searchResult = document.createElement('div');
  searchResult.className = 'search-result';
  searchResult.innerHTML = `
    <a class="search-image-anchor" href="/anime/${anime.mal_id}" target="_blank">
      <img class="image" src="${anime.poster_image_url}" alt="${anime.title_en || anime.title || anime.title_jp}" loading="lazy">
    </a>
    <div class="search-info">
      <a href="/anime/${anime.mal_id}" target="_blank">
        ${anime.title_en || anime.title}
        <sup>(${anime.anime_type})</sup>
      </a>
      <a href="/anime/${anime.mal_id}" target="_blank">${anime.title_jp || ''}</a>
      <p>${anime.average_rating || 'N/A'}</p>
    </div>
    <div class="miscellaneous_info">
      <a href="https://myanimelist.net/anime/${anime.mal_id}" target="_blank">MAL_ID: ${anime.mal_id}</a>
    </div>
  `;
  searchResults.appendChild(searchResult);
}

function renderAnimeList(animeList) {
  searchResults.innerHTML = '';
  (animeList || []).forEach(renderSearchAnimeCard);
}

searchInput.addEventListener('input', debounce(async (e) => {
  const value = e.target.value.trim();
  const data = await fetchAnime(value);
  renderAnimeList(data.anime);
}, 300));

window.addEventListener('DOMContentLoaded', async () => {
  populateYearDropdown();
  const params = getQueryParams();
  type_sort = params.type;
  status_sort = params.status;
  order_by_column = params.order_by || 'popularity';
  selectedGenres = params.genres;
  selectedThemes = params.themes;
  selectedYear = params.year;
  selectedSeason = params.season;
  excludeGenres = params.exclude_genres;
  excludeThemes = params.exclude_themes;
  applyFiltersToUI();
  resetAndLoadFirstPage();

  // Initial search fetch
  const data = await fetchAnime();
  renderAnimeList(data.anime);
});

// Search overlay functionality
searchButton.addEventListener('click', () => {
  searchOverlay.classList.toggle('active');
  const input = searchOverlay.querySelector('input[type="search"]');
  if (input) input.focus();
});

searchOverlay.addEventListener('click', (e) => {
  if (e.target === searchOverlay) {
    searchOverlay.classList.remove('active');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchOverlay.classList.remove('active');
  }
});

// --- Hamburger/Vertical Nav ---
const ham = document.querySelector('.ham-menu');
const nav = document.querySelector('.vertical-nav');
const ham_menu_icon = document.querySelector('.ham-menu-icon');
const icon_1 = ham_menu_icon.getElementsByTagName('i')[0];
const icon_2 = ham_menu_icon.getElementsByTagName('i')[1];

ham.addEventListener('click', () => {
  const isActive = nav.classList.toggle('active');
  icon_1.style.display = isActive ? 'none' : 'inline';
  icon_2.style.display = isActive ? 'inline' : 'none';
});
searchButton.addEventListener('click', () => {
  nav.classList.remove('active');
  icon_1.style.display = 'inline';
  icon_2.style.display = 'none';
});