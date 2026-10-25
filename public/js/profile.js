// --- Constants and DOM Elements ---
const limit = 5;
let statusChartInstance = null; // To store the Chart.js instance
const searchInput = document.querySelector('[data-search]');
const searchResults = document.querySelector('.search-results');
const searchButton = document.querySelector('#search-button');
const searchOverlay = document.querySelector('.search-overlay-container');
const ham = document.querySelector('.ham-menu');
const nav = document.querySelector('.vertical-nav');
const [icon1, icon2] = document.querySelectorAll('.ham-menu-icon i');
const profileToggle = document.querySelector('.mobile-profile-toggle');
const profileDetails = document.querySelector('.profile-details');
const closeBtn = document.querySelector('.close-profile-btn');

// The Overview tab is static. The original code called loadOverviewContent()
// but never defined it, which threw an uncaught error on every profile load.
function loadOverviewContent() { /* nothing to fetch for this tab */ }

// --- Utility: Debounce ---
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// --- Render Anime Card ---
function renderSearchAnimeCard(anime) {
  const searchResult = document.createElement('div');
  searchResult.className = 'search-result';

  // Image
  const imgAnchor = document.createElement('a');
  imgAnchor.className = 'search-image-anchor';
  imgAnchor.href = `/anime/${anime.mal_id}`;
  imgAnchor.target = '_blank';

  const image = document.createElement('img');
  image.className = 'image';
  image.src = anime.poster_image_url;
  image.alt = anime.title_en || anime.title || anime.title_jp;
  image.loading = 'lazy';
  imgAnchor.appendChild(image);

  // Info
  const searchInfo = document.createElement('div');
  searchInfo.className = 'search-info';

  const titleEn = document.createElement('a');
  titleEn.textContent = anime.title_en || anime.title;
  titleEn.href = `/anime/${anime.mal_id}`;
  titleEn.target = '_blank';

  const titleJp = document.createElement('a');
  titleJp.textContent = anime.title_jp;
  titleJp.href = `/anime/${anime.mal_id}`;

  const animeType = document.createElement('sup');
  animeType.textContent = ` (${anime.anime_type})`;
  titleEn.appendChild(animeType);

  searchInfo.append(titleEn, titleJp);

  const rating = document.createElement('p');
  rating.textContent = anime.average_rating || 'N/A';
  searchInfo.appendChild(rating);

  // Misc Info
  const miscInfo = document.createElement('div');
  miscInfo.className = 'miscellaneous_info';
  const miscAnchor = document.createElement('a');
  miscAnchor.textContent = `MAL_ID :${anime.mal_id}`;
  miscAnchor.href = `https://myanimelist.net/anime/${anime.mal_id}`;
  miscAnchor.target = '_blank';
  miscInfo.appendChild(miscAnchor);

  // Assemble
  searchResult.append(imgAnchor, searchInfo, miscInfo);
  if (window.NikkilogCards) window.NikkilogCards.makeClickable(searchResult, '/anime/' + (anime.mal_id || ''));
  searchResults.appendChild(searchResult);
}

// --- Fetch and Display Anime ---
function fetchAndDisplayAnime(url) {
  fetch(url)
    .then(res => (res.ok ? res.json() : {}))
    .then(data => {
      searchResults.innerHTML = '';
      (data.anime || []).forEach(renderSearchAnimeCard);
    })
    .catch(error => console.error('Error fetching anime:', error));
}

// --- Search Event Listener ---
searchInput.addEventListener(
  'input',
  debounce(e => {
    const value = e.target.value.trim();
    let url = `api/anime?limit=${limit}`;
    if (value) url += `&search=${encodeURIComponent(value)}`;
    fetchAndDisplayAnime(url);
  }, 300)
);

// --- Show Default Anime on Page Load ---
window.addEventListener('DOMContentLoaded', () => {
  fetchAndDisplayAnime(`api/anime?limit=${limit}`);
});

// --- Vertical Nav Toggle ---
ham.addEventListener('click', () => {
  const isActive = nav.classList.toggle('active');
  icon1.style.display = isActive ? 'none' : 'inline';
  icon2.style.display = isActive ? 'inline' : 'none';
});

// --- Mobile Profile Toggle ---
profileToggle.addEventListener('click', () => {
  profileDetails.classList.toggle('active');
});
closeBtn.addEventListener('click', () => {
  profileDetails.classList.remove('active');
});

// --- Search Overlay Functionality ---
searchButton.addEventListener('click', () => {
  searchOverlay.classList.toggle('active');
  const input = searchOverlay.querySelector('input[type="search"]');
  if (input) input.focus();
});
searchOverlay.addEventListener('click', e => {
  if (e.target === searchOverlay) searchOverlay.classList.remove('active');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') searchOverlay.classList.remove('active');
});


function populateData(data) {
  document.querySelector('#totalAnimeWatched').textContent = data.total_anime_completed;
  document.querySelector('#totalEpisodeWatched').textContent = data.total_episodes_watched;
  document.querySelector('#totalDaysSpent').textContent = data.total_days_in_anime;
  document.querySelector('#meanScore').textContent = data.avg_score;
}

const editBtn = document.getElementById('edit-profile-button');
const overlay = document.getElementById('edit-overlay');
const cancelBtn = overlay.querySelector('.cancel-btn');
const form = document.getElementById('edit-profile-form');
const profilePreview = document.getElementById('profile-preview');
const bgPreview = document.getElementById('bg-preview');
const fileInput = document.getElementById('profile-picture-input');
const bgInput = document.getElementById('bg-image-input');
const usernameInput = document.getElementById('edit-username'); // This variable is not used in the provided code.
const countryInput = document.getElementById('edit-country');
const stateInput = document.getElementById('edit-state');
const bioInput = document.getElementById('edit-bio');
const errorDiv = document.getElementById('edit-error');

// Open modal and load current profile
const displayNameInput = document.getElementById('edit-display-name');
displayNameInput.addEventListener('input', () => {
  if (displayNameInput.value.length > 20) {
    displayNameInput.value = displayNameInput.value.slice(0, 20);
  }
});
const mainProfilePic = document.getElementById('main-profile-pic');

editBtn.addEventListener('click', () => {
  overlay.classList.add('active');
  fetch('/api/profile').then(r => r.json()).then(data => {
    // Set display name input
    displayNameInput.value = data.display_name || '';
    // Set profile image preview in modal
    profilePreview.src = data.profile_pic || '/static/default-profile.jpg';
    // Set main profile image (outside modal)
    if (mainProfilePic) mainProfilePic.src = data.profile_pic || '/static/default-profile.jpg';
    // Set background image preview
    bgPreview.src = data.bg_image || '/static/default-bg.jpg';
    // Set other fields
    countryInput.value = data.country || '';
    stateInput.value = data.state || '';
    bioInput.value = data.bio || '';
    // Disable fields if not allowed
    if (!data.can_edit_profile) {
      displayNameInput.disabled = false; // This seems incorrect based on the error message
      countryInput.disabled = true;
      stateInput.disabled = true;
      errorDiv.textContent = "You can only change these fields once every 90 days. Last changed: " + (data.profile_last_updated || "");
    } else {
      displayNameInput.disabled = false;
      countryInput.disabled = false;
      stateInput.disabled = false;
      errorDiv.textContent = '';
    }
  });
});

// Cancel
cancelBtn.addEventListener('click', () => {
  overlay.classList.remove('active');
  errorDiv.textContent = '';
});

// Preview profile pic
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => profilePreview.src = e.target.result;
    reader.readAsDataURL(file);
  }
});

// Preview bg image
bgInput.addEventListener('change', () => {
  const file = bgInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => bgPreview.src = e.target.result;
    reader.readAsDataURL(file);
  }
});

// Submit form
form.addEventListener('submit', function(e) {
  e.preventDefault();
  errorDiv.textContent = '';
  const formData = new FormData(form);
  fetch('/api/profile', {
      method: 'POST',
      body: formData
    })
    .then(async r => {
      const contentType = r.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Unexpected server response. Are you logged in?');
      }
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to update profile');
      return data;
    })
    .then(data => {
      if (data.bg_image) {
        bgPreview.src = data.bg_image;
        const mainBgImg = document.getElementById('main-bg-image');
        if (mainBgImg) {
          if ('src' in mainBgImg) mainBgImg.src = data.bg_image;
          else mainBgImg.style.backgroundImage = `url('${data.bg_image}')`;
        }
      }
      overlay.classList.remove('active');
      window.location.reload(); // Optionally reload to update everywhere
    })
    .catch(err => {
      errorDiv.textContent = err.message;
    });
});


const bottomSection = document.querySelector('.bottom-section');
const tabContent = bottomSection.querySelectorAll('.tab-content');
const details_navigation_ul = document.querySelector('.details-navigation-ul');
const navLinks = details_navigation_ul.querySelectorAll('li');

// --- Tab Switching Logic ---
function setActiveContent() {
  navLinks.forEach((li, idx) => {
    li.addEventListener('click', () => {
      // Remove active class from all navigation links
      navLinks.forEach(link => link.classList.remove('active'));
      // Hide all tab contents
      tabContent.forEach(sec => {
        sec.classList.remove('active'); // Remove active class from content
        sec.style.display = 'none';
      });

      // Add active class to the clicked navigation link
      li.classList.add('active');
      // Show the corresponding tab content
      tabContent[idx].classList.add('active');
      tabContent[idx].style.display = 'flex';

      // --- ADD THIS: ---
      if (li.dataset.target === 'Statistics-content') {
        fetchUserStatusCounts();
        fetchWatchHourRanks();
      }
      // Fetch user recommendations when Contribution tab is clicked
      if (li.dataset.target === 'Contribution-content') {
        fetchUserRecommendations();
      }
      if (li.dataset.target === 'overview-section') { // Corrected target name to match HTML
        loadOverviewContent(); // Call the main overview loading function
      }
    });
  });
}
// ...existing code...

document.addEventListener('DOMContentLoaded', () => {
  // If overview-section is visible by default, load its content
  const overviewSection = document.getElementById('overview-section');
  if (overviewSection && overviewSection.classList.contains('active')) {
    loadOverviewContent();
  }
});
window.addEventListener('DOMContentLoaded', () => {
  // Find the initially active navigation link
  const initialActiveNavLink = details_navigation_ul.querySelector('li.active');
  if (initialActiveNavLink) {
    // Get its index
    const index = Array.from(navLinks).indexOf(initialActiveNavLink);
    if (index > -1 && tabContent[index]) {
      // Ensure only this content is displayed and marked active
      tabContent.forEach(sec => {
        sec.classList.remove('active');
        sec.style.display = 'none';
      });
      tabContent[index].classList.add('active');
      tabContent[index].style.display = 'flex';

    }
  }
  // Set up event listeners for future clicks
  setActiveContent();
});

window.addEventListener('DOMContentLoaded', () => {
  const initialActiveNavLink = details_navigation_ul.querySelector('li.active');
  if (initialActiveNavLink && initialActiveNavLink.dataset.target === 'Statistics-content') {
    fetchUserStatusCounts();
    fetchWatchHourRanks();
    fetchUserRecommendations();
    // fetchOverviewData(); // This function is not defined in the provided code
  }
});

/*Top Section Statistics*/

fetch('/api/user-stats')
  .then(res => {
    if (!res.ok) throw new Error(`Error in Fetching Data: ${res.status}`);
    return res.json();
  })
  .then(data => {
    console.log('User Stats:', data);
    topSectionStatistics(data);
  })
  .catch(error => {
    console.error('Fetch error:', error);
  });

function topSectionStatistics(data) {
  const score = document.querySelector('.score');
  score.textContent = data.avg_score;

  const totalAnime = document.querySelector('.completed-count');
  totalAnime.textContent = data.total_anime_completed;

  const totalEpisodes = document.querySelector('.episode-count');
  totalEpisodes.textContent = data.total_episodes_watched;

  const totalDays = document.querySelector('.day-count');
  totalDays.textContent = data.total_days_in_anime;

  const totalHour = document.querySelector('.hour-count');
  totalHour.textContent = data.total_hours_watched;

}

fetch('/api/unique-anime-watched')
  .then(res => {
    if (!res.ok) throw new Error(`Error in Fetching Data: ${res.status}`);
    return res.json();
  })
  .then(data => {
    //console.log('unique anime watched:', data);
    const titleCount = document.querySelector('.title-count')
    titleCount.textContent = data.unique_anime_watched;
  })
  .catch(error => {
    console.error('Fetch error:', error);
  });

//favorite tracks

document.addEventListener('DOMContentLoaded', function() {
  const songTitleInput = document.getElementById('song-title-input');
  const artistInput = document.getElementById('artist-input');
  const animeTitleInput = document.getElementById('anime-title-input');
  const themeTypeSelect = document.getElementById('theme-type-select');
  const themeNumberInput = document.getElementById('theme-number-input');
  const addCustomThemeBtn = document.getElementById('add-custom-theme-btn');
  const favoritesList = document.getElementById('favorite-tracks-list');
  const errorMessage = document.getElementById('track-error-message');
  const successMessage = document.getElementById('track-message');
  const songUrlInput = document.getElementById('song-url-input'); // New
  const animeTitleSuggestions = document.getElementById('anime-title-suggestions');
  const animeIdHidden = document.getElementById('anime-id-hidden');

  // --- Event Listeners ---
  addCustomThemeBtn.addEventListener('click', handleAddCustomTheme);
  favoritesList.addEventListener('click', handleDeleteCustomTheme);

  // --- Functions ---
  function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.style.display = 'block';
    if (isError) {
      element.style.color = '#ff6b6b'; // Red for error
    } else {
      element.style.color = '#4CAF50'; // Green for success
    }
    setTimeout(() => {
      element.textContent = '';
      element.style.display = 'none';
    }, 5000); // Hide after 5 seconds
  }

  async function handleAddCustomTheme() {
    const song_title = songTitleInput.value.trim();
    const artist = artistInput.value.trim();
    const anime_title_text = animeTitleInput.value.trim();
    const anime_id = animeIdHidden.value || null; // Get the hidden anime ID
    const theme_type = themeTypeSelect.value;
    const theme_number = themeNumberInput.value.trim();
    const url = songUrlInput.value.trim(); // New

    if (!song_title) {
      showMessage(errorMessage, 'Song title is required.', true);
      return;
    }

    addCustomThemeBtn.disabled = true;
    addCustomThemeBtn.textContent = 'Adding...';
    showMessage(errorMessage, ''); // Clear previous errors
    showMessage(successMessage, ''); // Clear previous success

    try {
      const response = await fetch('/api/user/custom-themes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          song_title: song_title,
          artist: artist,
          anime_title_text: anime_title_text,
          anime_id: anime_id, // Pass the selected anime ID
          theme_type: theme_type,
          theme_number: theme_number ? parseInt(theme_number) : null,
          url: url // New
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add custom theme.');
      }

      showMessage(successMessage, result.message);
      // Clear form fields
      songTitleInput.value = '';
      artistInput.value = '';
      animeTitleInput.value = '';
      animeIdHidden.value = ''; // Clear hidden ID
      songUrlInput.value = ''; // New
      themeTypeSelect.value = 'OP';
      themeNumberInput.value = '';
      loadCustomThemes(); // Refresh the list

    } catch (error) {
      showMessage(errorMessage, error.message, true);
    } finally {
      addCustomThemeBtn.disabled = false;
      addCustomThemeBtn.textContent = 'Add Track';
    }
  }

  async function loadCustomThemes() {
    favoritesList.innerHTML = '<p>Loading your favorite tracks...</p>';
    try {
      const response = await fetch('/api/user/custom-themes');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load custom themes.');
      }

      displayCustomThemes(data.themes);
    } catch (error) {
      showMessage(errorMessage, error.message, true);
      favoritesList.innerHTML = '<p>Could not load favorite tracks.</p>';
    }
  }

  function displayCustomThemes(themes) {
    favoritesList.innerHTML = '';
    if (!themes || themes.length === 0) {
      favoritesList.innerHTML = '<p>You haven\'t added any favorite tracks yet. Add some above!</p>';
      return;
    }

    themes.forEach(theme => {
      const card = document.createElement('div');
      card.className = 'track-card';
      const animeLink = theme.anime_mal_id ? `/anime/${theme.anime_mal_id}` : '#';
      const animeTitleDisplay = theme.anime_title_text || theme.anime_title_en || 'Unknown Anime';
      const themeIdentifier = `${theme.theme_type}${theme.theme_number ? theme.theme_number : ''}`;
      const songUrl = theme.url;
      const platform = theme.platform;

      let linkIcon = '';
      if (songUrl) {
        if (platform === 'YouTube') linkIcon = '<i class="fab fa-youtube" style="color: #FF0000; margin-left: 5px;"></i>';
        else if (platform === 'Spotify') linkIcon = '<i class="fab fa-spotify" style="color: #1DB954; margin-left: 5px;"></i>';
        else linkIcon = '<i class="fas fa-external-link-alt" style="color: #ccc; margin-left: 5px;"></i>';
      }

      card.innerHTML = `
            <div class="track-image-wrapper">
                <a href="${animeLink}" target="_blank" rel="noopener noreferrer">
                    <img src="${theme.anime_poster_url || 'https://via.placeholder.com/220x300?text=No+Image'}" alt="${animeTitleDisplay}">
                </a>
                <div class="info-icon-container">
                    <i class="material-symbols-outlined info-icon">info</i>
                </div>
                <div class="track-info-overlay">
                    <div class="track-info-content">
                        <h4>${theme.song_title}</h4>
                        <p style:'margin-top:0.3rem; width:100%;text-align:start'>${theme.artist || 'Unknown Artist'}</p>
                        <p><em>${animeTitleDisplay}</em></p>
                        <p>${themeIdentifier}<p/>
                        ${songUrl ? `<p><a href="${songUrl}" target="_blank" rel="noopener noreferrer">Listen Now ${linkIcon}</a></p>` : ''}
                    </div>
                </div>
            </div>
            <button class="remove-track-btn" data-id="${theme.id}" title="Remove from favorites">&times;</button>
        `;
      // a track card already computes animeLink; only link it when there is an anime
      if (window.NikkilogCards && theme.anime_mal_id) {
        window.NikkilogCards.makeClickable(card, '/anime/' + theme.anime_mal_id);
      }
      favoritesList.appendChild(card);

      // Mobile: click to toggle overlay
      const infoIcon = card.querySelector('.info-icon-container');
      const overlay = card.querySelector('.track-info-overlay');
      infoIcon.addEventListener('click', function(e) {
        e.stopPropagation();
        // Toggle overlay
        const isVisible = overlay.style.opacity === '1';
        document.querySelectorAll('.track-info-overlay').forEach(o => {
          o.style.opacity = '0';
          o.style.pointerEvents = 'none';
        });
        if (!isVisible) {
          overlay.style.opacity = '1';
          overlay.style.pointerEvents = 'auto';
        }
      });
      // Hide overlay when clicking outside
      document.addEventListener('click', function(e) {
        if (!card.contains(e.target)) {
          overlay.style.opacity = '0';
          overlay.style.pointerEvents = 'none';
        }
      });
    });
  }

  async function handleDeleteCustomTheme(event) {
    if (event.target.classList.contains('remove-track-btn')) {
      const themeId = event.target.dataset.id;
      if (confirm('Are you sure you want to remove this track from your favorites?')) {
        try {
          const response = await fetch(`/api/user/custom-themes/${themeId}`, {
            method: 'DELETE'
          });
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Failed to delete custom theme.');
          }

          showMessage(successMessage, result.message);
          loadCustomThemes(); // Refresh list on success
        } catch (error) {
          showMessage(errorMessage, error.message, true);
        }
      }
    }
  }

  // --- Anime Title Search Functionality ---
  let animeSearchTimeout;
  animeTitleInput.addEventListener('input', () => {
    clearTimeout(animeSearchTimeout);
    const query = animeTitleInput.value.trim();
    if (query.length < 2) {
      animeTitleSuggestions.style.display = 'none';
      animeTitleSuggestions.innerHTML = '';
      animeIdHidden.value = ''; // Clear hidden ID if input is too short
      return;
    }
    animeSearchTimeout = setTimeout(() => {
      fetch(`/api/anime/search_titles?q=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => displayAnimeSuggestions(data.anime))
        .catch(error => console.error('Error fetching anime suggestions:', error));
    }, 300); // Debounce
  });

  function displayAnimeSuggestions(animeList) {
    animeTitleSuggestions.innerHTML = '';
    if (!animeList || animeList.length === 0) {
      animeTitleSuggestions.style.display = 'none';
      return;
    }

    animeList.forEach(anime => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.dataset.animeId = anime.id;
      item.dataset.animeTitle = anime.title_en || anime.title || anime.title_jp;
      item.innerHTML = `
                    <img src="${anime.poster_image_url || 'https://via.placeholder.com/40x60?text=No+Image'}" alt="${anime.title_en || anime.title}" class="autocomplete-item-image">
                    <div class="autocomplete-item-text">
                        <h4>${anime.title_en || anime.title}</h4>
                        ${anime.title_jp ? `<p>${anime.title_jp}</p>` : ''}
                    </div>

                `;
      animeTitleSuggestions.appendChild(item);
    });
    animeTitleSuggestions.style.display = 'grid'; // Changed from 'block' to 'grid'
  }

  animeTitleSuggestions.addEventListener('click', (event) => {
    const selectedItem = event.target.closest('.autocomplete-item');
    if (selectedItem) {
      animeTitleInput.value = selectedItem.dataset.animeTitle;
      animeIdHidden.value = selectedItem.dataset.animeId;
      animeTitleSuggestions.style.display = 'none';
    }
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (event) => {
    if (!animeTitleInput.contains(event.target) && !animeTitleSuggestions.contains(event.target)) {
      animeTitleSuggestions.style.display = 'none';
    }
  });

  // Initial load of custom themes when the page loads
  loadCustomThemes();
});


// --- Anime List Functionality ---
document.addEventListener('DOMContentLoaded', function() {
  const userAnimeTableContainer = document.getElementById('user-anime-table-container');

  // Function to load user's anime list
  let fullAnimeList = []; // Cache the full list to get original values for updates

  async function loadUserAnimeList() {
    if (!userAnimeTableContainer) return;
    userAnimeTableContainer.innerHTML = '<p>Loading your anime list...</p>';
    try {
      const response = await fetch('/api/user/anime-list');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load anime list.');
      }

      fullAnimeList = data.anime_list; // Cache the data from /api/user/anime-list
      displayUserAnimeList(fullAnimeList);
    } catch (error) {
      console.error('Error loading user anime list:', error);
      userAnimeTableContainer.innerHTML = '<p>Could not load your anime list. Please try again later.</p>';
    }
  }

  // Function to display user's anime list in a table
  function displayUserAnimeList(animeList) {
    if (!animeList || animeList.length === 0) {
      userAnimeTableContainer.innerHTML = '<p>You haven\'t tracked any anime yet.</p>';
      return;
    }

    let tableHTML = `
            <table class="user-anime-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Anime</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th>Progress</th>
                        <th>Mood</th>
                        <th>Last Updated</th>
                    </tr>
                </thead>
                <tbody>
        `;

    animeList.forEach((anime, index) => {
      const animeTitle = anime.title_en || anime.title_jp || 'Unknown Title';
      const posterUrl = anime.poster_image_url || 'https://via.placeholder.com/50x70?text=No+Image';
      const currentEpisode = anime.current_episode !== null ? anime.current_episode : '';
      const totalEpisodes = anime.total_episodes || '?';
      const userRating = anime.user_rating !== null ? anime.user_rating : '';
      const mood = anime.mood || '';
      const status = anime.status || '';
      const lastUpdated = anime.updated_at ? new Date(anime.updated_at).toLocaleDateString() : 'N/A';

      tableHTML += `
                <tr data-mal-id="${anime.mal_id}">
                    <td>${index + 1}</td>
                    <td>
                        <a href="/anime/${anime.mal_id}" target="_blank" class="anime-list-title-link">
                            <img src="${posterUrl}" alt="${animeTitle}" class="anime-list-item-img">
                            ${animeTitle}
                        </a>
                    </td>
                    <td>
                        <select class="anime-list-status-select" data-field="status">
                            <option value="watching" ${status === 'watching' ? 'selected' : ''}>Watching</option>
                            <option value="completed" ${status === 'completed' ? 'selected' : ''}>Completed</option>
                            <option value="on-hold" ${status === 'on-hold' ? 'selected' : ''}>On Hold</option>
                            <option value="dropped" ${status === 'dropped' ? 'selected' : ''}>Dropped</option>
                            <option value="plan-to-watch" ${status === 'plan-to-watch' ? 'selected' : ''}>Plan to Watch</option>
                        </select>
                    </td>
                    <td>
                        <input type="number" class="anime-list-score-input" value="${userRating}" min="0" max="10" step="0.5" data-field="user_rating">
                    </td>
                    <td>
                        <input type="number" class="anime-list-ep-input" value="${currentEpisode}" min="0" max="${totalEpisodes === '?' ? '' : totalEpisodes}" data-field="current_episode"> / ${totalEpisodes}
                    </td>
                    <td>
                        <select class="anime-list-mood-select" data-field="mood">
                            <option value="" ${mood === '' ? 'selected' : ''}>Select Mood</option>
                            <option value="happy" ${mood === 'happy' ? 'selected' : ''}>Happy</option>
                            <option value="calm" ${mood === 'calm' ? 'selected' : ''}>Calm</option>
                            <option value="thrilling" ${mood === 'thrilling' ? 'selected' : ''}>Thrilling</option>
                            <option value="emotional" ${mood === 'emotional' ? 'selected' : ''}>Emotional</option>
                            <option value="thoughtful" ${mood === 'thoughtful' ? 'selected' : ''}>Thoughtful</option>
                            <option value="funny" ${mood === 'funny' ? 'selected' : ''}>Funny</option>
                            <option value="mystery" ${mood === 'mystery' ? 'selected' : ''}>Mystery</option>
                            <option value="inspiring" ${mood === 'inspiring' ? 'selected' : ''}>Inspiring</option>
                            <option value="dark" ${mood === 'dark' ? 'selected' : ''}>Dark</option>
                            <option value="adventure" ${mood === 'adventure' ? 'selected' : ''}>Adventure</option>
                            <option value="romantic" ${mood === 'romantic' ? 'selected' : ''}>Romantic</option>
                            <option value="magical" ${mood === 'magical' ? 'selected' : ''}>Magical</option>
                            <option value="nostalgic" ${mood === 'nostalgic' ? 'selected' : ''}>Nostalgic</option>
                            <option value="intense" ${mood === 'intense' ? 'selected' : ''}>Intense</option>
                            <option value="slice_of_life" ${mood === 'slice_of_life' ? 'selected' : ''}>Everyday Life</option>
                        </select>
                    </td>
                    <td>${lastUpdated}</td>
                </tr>
            `;
    });

    tableHTML += `
                </tbody>
            </table>
        `;
    userAnimeTableContainer.innerHTML = tableHTML;

    // Add event listeners for score, mood, status, and episode changes using event delegation
    userAnimeTableContainer.querySelector('tbody').addEventListener('change', (event) => {
      if (event.target.matches('.anime-list-score-input, .anime-list-mood-select, .anime-list-status-select, .anime-list-ep-input')) {
        const row = event.target.closest('tr');
        const malId = row.dataset.malId;
        const field = event.target.dataset.field;
        let value = event.target.value;

        // Find the original anime object from the cached list to validate against
        const originalAnime = fullAnimeList.find(a => a.mal_id == malId);

        if (field === 'user_rating') {
          value = parseFloat(value);
          if (isNaN(value) || value < 0 || value > 10) {
            alert('Score must be a number between 0 and 10.');
            // Revert to original value if invalid
            event.target.value = originalAnime ? originalAnime.user_rating || '' : '';
            return;
          }
        } else if (field === 'current_episode') {
          value = parseInt(value);
          const totalEpisodes = originalAnime ? originalAnime.total_episodes : Infinity; // Use Infinity if total episodes are unknown
          if (isNaN(value) || value < 0 || (totalEpisodes !== '?' && value > totalEpisodes)) {
            alert(`Episodes must be a number between 0 and ${totalEpisodes}.`);
            // Revert to original value if invalid
            event.target.value = originalAnime ? originalAnime.current_episode || '' : '';
            return;
          }
        }
        updateAnimeTracking(malId, field, value);
      }
    });
  }

  // Function to update anime tracking (reusing existing API)
  async function updateAnimeTracking(malId, field, value) {
    try {
      const payload = {
        mal_id: malId
      };
      payload[field] = value; // Dynamically set the field to update

      // Use POST to /api/update-user-anime-tracking for updates
      const response = await fetch('/api/update-user-anime-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update anime tracking.');
      }

      console.log('Anime tracking updated successfully:', data.message);
      // Optionally, refresh a specific part of the table or just the updated row
      // For simplicity, we'll just log success. A more robust solution might re-render the row.

      // Update the cached fullAnimeList with the new value
      const updatedAnimeIndex = fullAnimeList.findIndex(anime => anime.mal_id == malId);
      if (updatedAnimeIndex !== -1) {
        fullAnimeList[updatedAnimeIndex][field] = value;
        // Also update updated_at if the server sends it back, or assume current time
        fullAnimeList[updatedAnimeIndex].updated_at = new Date().toISOString();
        // Re-display the list to reflect the updated 'Last Updated' timestamp
        displayUserAnimeList(fullAnimeList);
      }

    } catch (error) {
      console.error('Error updating anime tracking:', error);
      alert('Failed to update anime. Please try again.');
      // Revert the UI element to its original value if the update fails
      loadUserAnimeList(); // Reload the entire list to ensure consistency
    }
  }

  // Load anime list when the "Anime List" navigation link is clicked
  const animeListNavLink = document.querySelector('li[data-target="Anime-list-content"]');
  if (animeListNavLink) {
    animeListNavLink.addEventListener('click', loadUserAnimeList); // Removed { once: true } to allow re-loading
  } else { /* If the tab is active by default on page load, load it */
    loadUserAnimeList(); // Load on initial page load if the tab is active by default
  }
});

// Function to set up hover effects for info icons
function setupInfoIconHover() {
  document.querySelectorAll('.anime-card').forEach(card => {
    const infoOverlay = card.querySelector('.info-overlay');
    const infoIcon = card.querySelector('.info-icon');
    const animeTitleOverlay = card.querySelector('.anime-title-overlay');

    if (infoOverlay && infoIcon && animeTitleOverlay) {
      // The CSS handles the overlay visibility on card hover.
      // This JS handles the title visibility on info icon hover.
      infoIcon.addEventListener('mouseenter', () => {
        animeTitleOverlay.style.opacity = '1';
        animeTitleOverlay.style.visibility = 'visible';
      });
      infoIcon.addEventListener('mouseleave', () => {
        animeTitleOverlay.style.opacity = '0';
        animeTitleOverlay.style.visibility = 'hidden';
      });
    }
  });
}

// Function to fetch and display user's anime status counts
async function fetchUserStatusCounts() {
  try {
    // put the canvas back if a previous attempt replaced it
    const chartBox = document.querySelector('.chart-container');
    if (chartBox && chartOriginalHTML) chartBox.innerHTML = chartOriginalHTML;

    const response = await fetch('/api/user/status_counts');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    renderUserStatusChart(data.status_counts);
  } catch (error) {
    console.error('Error fetching user status counts:', error);
    showChartNotice("We couldn't load your status chart just now.", fetchUserStatusCounts);
  }
}

// Shows a friendly notice inside the chart card without destroying the canvas,
// with a retry that restores it.
let chartOriginalHTML = null;
function showChartNotice(message, onRetry) {
  const box = document.querySelector('.chart-container');
  if (!box) return;
  if (!chartOriginalHTML) chartOriginalHTML = box.innerHTML;
  box.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  wrap.innerHTML = '<span class="material-symbols-outlined">pie_chart</span><p></p>';
  wrap.querySelector('p').textContent = message;
  if (onRetry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'retry';
    btn.textContent = 'Try again';
    btn.addEventListener('click', () => {
      box.innerHTML = chartOriginalHTML;
      onRetry();
    });
    wrap.appendChild(btn);
  }
  box.appendChild(wrap);
}

// Function to render the Doughnut chart for anime status
function renderUserStatusChart(statusCounts) {
  const ctx = document.getElementById('statusChart');

  if (!ctx) {
    console.error("Canvas element 'statusChart' not found.");
    return;
  }

  // Destroy existing chart instance if it exists
  if (statusChartInstance) {
    statusChartInstance.destroy();
  }

  const labels = statusCounts.map(item => {
    // Capitalize first letter and replace underscores with spaces
    return item.status.charAt(0).toUpperCase() + item.status.slice(1).replace(/_/g, ' ');
  });
  const data = statusCounts.map(item => item.count);

  const backgroundColors = [
    'rgba(255, 99, 132, 0.8)', // Completed (reddish)
    'rgba(54, 162, 235, 0.8)', // Watching (bluish)
    'rgba(255, 206, 86, 0.8)', // Plan to Watch (yellowish)
    'rgba(75, 192, 192, 0.8)', // On Hold (greenish)
    'rgba(153, 102, 255, 0.8)', // Dropped (purplish)
    'rgba(201, 203, 207, 0.8)' // Other/Unknown
  ];

  statusChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors,
        borderColor: 'rgba(255, 255, 255, 1)',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#34495e', // Text color for legend
            font: {
              size: 12,
              family: 'Quicksand'
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed !== null) {
                label += context.parsed;
              }
              return label;
            }
          }
        }
      }
    }
  });
}

async function fetchWatchHourRanks() {
  const rankTable = document.getElementById('watchHourRankTable');
  const showAllBtn = document.getElementById('showAllRanksBtn');
  const allRanksOverlay = document.getElementById('allRanksOverlay');
  const allRanksTable = document.getElementById('allRanksTable');
  const closeOverlayBtn = document.getElementById('closeAllRanksOverlay');

  rankTable.innerHTML = `
        <thead>
            <tr>
                <th>Rank</th>
                <th>User</th>
                <th>Watch Hours</th>
                <th>Completed</th>
                <th>Mean Score</th>
            </tr>
        </thead>
        <tbody>
            <tr><td colspan="5">Loading ranks...</td></tr>
        </tbody>
    `;

  try {
    const response = await fetch('/api/user/watch_hour_ranks');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();


    // Get current user id from API response
    const currentUserId = data.user_rank ? data.user_rank.user_id : null;

    // Show top 9 + user (highlight user's row)
    renderWatchHourRanks(data.show_ranks, rankTable, currentUserId);

    // Show all overlay
    showAllBtn.onclick = () => {
      renderWatchHourRanks(data.all_ranks, allRanksTable, currentUserId);
      allRanksOverlay.style.display = 'flex';
    };
    closeOverlayBtn.onclick = () => {
      allRanksOverlay.style.display = 'none';
    };
  } catch (error) {
    console.error('Error fetching watch hour ranks:', error);
    rankTable.innerHTML = `
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>User</th>
                    <th>Watch Hours</th>
                    <th>Completed</th>
                    <th>Mean Score</th>
                </tr>
            </thead>
            <tbody>
                <tr><td colspan="5">Couldn't load the leaderboard just now — try again in a moment.</td></tr>
            </tbody>
        `;
  }
}

function renderWatchHourRanks(ranks, tableElem, currentUserId) {
  let tableHtml = `
        <thead>
            <tr>
                <th>Rank</th>
                <th>User</th>
                <th>Watch Hours</th>
                <th>Completed</th>
                <th>Mean Score</th>
            </tr>
        </thead>
        <tbody>
    `;
  ranks.forEach(user => {
    const profilePic = user.profile_pic || '/static/default-profile.png';
    const displayName = user.display_name || 'Anonymous';
    const hours = user.total_minutes ? (user.total_minutes / 60).toFixed(1) : '0.0';
    const completed = user.completed_count || 0;
    // Safely handle mean_score (could be null, undefined, or not a number)
    let meanScore = '-';
    if (
      (typeof user.mean_score === 'number' && !isNaN(user.mean_score)) ||
      (!isNaN(parseFloat(user.mean_score)) && isFinite(user.mean_score))
    ) {
      meanScore = parseFloat(user.mean_score).toFixed(2);
    }
    const highlight = user.user_id === currentUserId ? 'highlight-user-rank' : '';
    tableHtml += `
            <tr class="${highlight}">
                <td>${user.user_rank}</td>
                <td>
                    <img src="${profilePic}" alt="pic" class="rank-profile-pic">
                    ${displayName}
                </td>
                <td>${hours}</td>
                <td>${completed}</td>
                <td>${meanScore}</td>
            </tr>
        `;
  });
  tableHtml += '</tbody>';
  tableElem.innerHTML = tableHtml;
}

// Call this on page load or tab switch
fetchWatchHourRanks();

// Function to fetch and display user's made recommendations
async function fetchUserRecommendations() {
  const userRecommendationsList = document.getElementById('user-recommendations-list');
  if (!userRecommendationsList) return;

  userRecommendationsList.innerHTML = '<p>Loading your recommendations...</p>'; // Show loading message

  try {
    const response = await fetch('/api/user/recommendations');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    userRecommendationsList.innerHTML = ''; // Clear loading message

    if (data.user_recommendations && data.user_recommendations.length > 0) {
      data.user_recommendations.forEach(rec => {
        const recCard = document.createElement('div');
        recCard.classList.add('recommendation-card'); // Use a new class for styling

        const fromAnimeTitle = rec.from_anime_title_en || rec.from_anime_title_jp || 'Unknown Anime';
        const toAnimeTitle = rec.to_anime_title_en || rec.to_anime_title_jp || 'Unknown Anime';
        const fromAnimePoster = rec.from_anime_poster_url || '/static/default-anime.jpg';
        const toAnimePoster = rec.to_anime_poster_url || '/static/default-anime.jpg';
        const createdAt = new Date(rec.created_at).toLocaleDateString();

        recCard.innerHTML = `
                    <div class="recommendation-item">
                        <div class="anime-pair">
                            <a href="/anime/${rec.from_anime_mal_id}" target="_blank" class="anime-link">
                                <img src="${fromAnimePoster}" alt="${fromAnimeTitle}" class="anime-poster">
                                <span class="anime-title">${fromAnimeTitle}</span>
                            </a>
                            <span class="recommendation-arrow">➡️</span>
                            <a href="/anime/${rec.to_anime_mal_id}" target="_blank" class="anime-link">
                                <img src="${toAnimePoster}" alt="${toAnimeTitle}" class="anime-poster">
                                <span class="anime-title">${toAnimeTitle}</span>
                            </a>
                        </div>
                        <p class="recommendation-date">Recommended on: ${createdAt}</p>
                    </div>
                `;
        if (window.NikkilogCards) window.NikkilogCards.makeClickable(recCard, '/anime/' + (rec.anime_mal_id || rec.mal_id || ''));
        userRecommendationsList.appendChild(recCard);
      });
    } else {
      userRecommendationsList.innerHTML = '<p>You haven\'t made any recommendations yet.</p>';
    }
  } catch (error) {
    console.error('Error fetching user recommendations:', error);
    userRecommendationsList.innerHTML = '<p>Failed to load your recommendations. Please try again later.</p>';
  }
}

// ...existing code...

