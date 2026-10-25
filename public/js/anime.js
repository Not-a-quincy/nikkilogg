// anime.js

// Snapshot of the stats panel markup, so a failed load can be retried.
let statsOriginalHTML = null;

// --- Extract Anime ID from URL ---
const path = window.location.pathname;
const path_segments = path.split('/');
const context = JSON.parse(document.getElementById("context-data").textContent);
const anime_id = context.anime_id;
const user_id = context.user_id;
const isAdmin = context.is_admin 

const isCurrentUserAdmin = document.getElementById('user-is-admin')?.value === 'true';

if (isNaN(anime_id)) {
    console.error("Anime ID not found in URL path or is invalid.");
    document.getElementById('anime-details-container').innerHTML = '<p>Error: No valid Anime ID found in the URL. Please navigate from an anime list.</p>';
} else {
    //console.log("Extracted Anime ID:", anime_id);
}

// --- Globals ---
let maxEpisodes = null;
const image_container = document.querySelector('.anime-banner-container');
const additional_details = document.querySelector('.additional-details');
const anime_type_colors = {
    TV: '#3B82F6',
    OVA: '#8B5CF6',
    ONA: '#14B8A6',
    Movie: '#EF4444',
    Special: '#ffffff'
};
let animeTitleForRecommendation = 'This Anime'; // Default, will be updated by fetchAndRenderLocalDbData

// --- Initial Data Fetch ---
// Fetches and renders anime information from the local database.
async function fetchAndRenderLocalDbData(animeId) {
    try {
        const localDbRes = await fetch(`/api/anime/${animeId}`);
        if (!localDbRes.ok) throw new Error(`Failed to fetch local DB data: ${localDbRes.status} - ${localDbRes.statusText}`);
        const localDb = await localDbRes.json();
        //console.log('Local DB:', localDb);
        render_anime_info(localDb);
        animeTitleForRecommendation = localDb.title_en || localDb.title || 'This Anime';
    } catch (error) {
        console.error('Error fetching local DB API:', error.message);
    }
}

// Call initial data fetch on script load
fetchAndRenderLocalDbData(anime_id);


// --- Search Overlay Logic ---
const limit = 5;
const searchInput = document.querySelector('[data-search]');
const searchResults = document.querySelector('.search-results');
const searchButton = document.querySelector('#search-button');
const searchOverlay = document.querySelector('.search-overlay-container');

// Debounce utility to limit API calls on input
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Renders a single search result card within the search overlay
function renderSearchAnimeCard(anime) {
    const searchResult = document.createElement('div');
    searchResult.classList.add('search-result');

    const img_anchor = document.createElement('a');
    img_anchor.classList.add('search-image-anchor');
    img_anchor.href = `/anime/${anime.mal_id}`;
    img_anchor.target = '_blank';

    const image = document.createElement('img');
    image.classList.add('image');
    image.src = anime.poster_image_url;
    image.alt = anime.title_en || anime.title || anime.title_jp;
    image.loading = 'lazy';
    img_anchor.appendChild(image);

    searchResult.appendChild(img_anchor);

    const searchInfo = document.createElement('div');
    searchInfo.classList.add('search-info');

    const title_en = document.createElement('a');
    title_en.textContent = anime.title_en || anime.title;
    title_en.target = '_blank';
    title_en.href = `/anime/${anime.mal_id}`;

    const animeType = document.createElement('sup');
    animeType.textContent = ` (${anime.anime_type})`;
    title_en.appendChild(animeType);

    const title_jp = document.createElement('a');
    title_jp.textContent = anime.title_jp || '';
    title_jp.href = `/anime/${anime.mal_id}`;
    searchInfo.appendChild(title_en);
    searchInfo.appendChild(title_jp);

    const rating = document.createElement('p');
    rating.textContent = `${anime.average_rating || 'N/A'}`;
    searchInfo.appendChild(rating);

    searchResult.appendChild(searchInfo);

    const miscellaneous_info = document.createElement('div');
    miscellaneous_info.classList.add('miscellaneous_info');
    const miscellaneous_info_anchor = document.createElement('a');
    miscellaneous_info_anchor.textContent = "MAL_ID :" + anime.mal_id;
    miscellaneous_info_anchor.target = "_blank";
    miscellaneous_info_anchor.href = `https://myanimelist.net/anime/${anime.mal_id}`;
    miscellaneous_info.appendChild(miscellaneous_info_anchor);
    searchResult.appendChild(miscellaneous_info);

    searchResults.appendChild(searchResult);
}

// Event listener for search input (fetches local anime based on input)
searchInput.addEventListener('input', debounce((e) => {
    const value = e.target.value.trim();
    let search_url = `/api/anime?limit=${limit}`;
    if (value) {
        search_url += `&search=${encodeURIComponent(value)}`;
    }

    fetch(search_url)
        .then(res => res.ok ? res.json() : {})
        .then(localData => {
            searchResults.innerHTML = '';
            (localData.anime || []).forEach(anime_object => {
                renderSearchAnimeCard(anime_object);
            });
        })
        .catch(error => {
            console.error('Error fetching local anime:', error);
            searchResults.innerHTML = '<p style="color:#faa;">Error loading search results.</p>';
        });
}, 300));

// Shows default anime results on page load for the search overlay
window.addEventListener('DOMContentLoaded', () => {
    const default_url = `/api/anime?limit=${limit}`;
    fetch(default_url)
        .then(res => res.ok ? res.json() : {})
        .then(localData => {
            searchResults.innerHTML = '';
            (localData.anime || []).forEach(anime_object => {
                renderSearchAnimeCard(anime_object);
            });
        })
        .catch(error => console.error('Error fetching default local anime:', error));
});

// Search Overlay UI interactions
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

// Close vertical nav when search button is clicked
searchButton.addEventListener('click', () => {
    nav.classList.remove('active');
    icon_1.style.display = 'inline';
    icon_2.style.display = 'none';
});

// --- Render Anime Info (Main Page Content) ---
function render_anime_info(data) {
    ///console.log(data)

    const topSection=document.querySelector('.hero-banner')
    const title=document.querySelector('.title-text')
    const image=document.querySelector('.main-top-anime-image')
    const animeYear=document.querySelector('.main-top-anime-year')
    const animeDuration=document.querySelector('.main-top-anime-duration')
    const titleJp=document.querySelector('.title-japanese-text')
    const animeType=document.querySelector('.anime-type')


    topSection.style.backgroundImage = `url(${data.kitsu_cover_image_url||data.poster_image_url})`;
    title.textContent = data.title_en || data.title || data.title_jp;
    image.src = data.kitsu_poster_image_url||data.poster_image_url;
    animeYear.textContent = data.anime_year;
    animeDuration.textContent = data.duration;
    titleJp.textContent = data.title_jp||data.title_en;
    animeType.textContent = `(${data.anime_type})`

    // --- hero extras -------------------------------------------------------
    const studioEl = document.getElementById('heroStudio');
    if (studioEl) studioEl.textContent = names(data.studios)[0] || '';

    const excerptEl = document.getElementById('heroExcerpt');
    if (excerptEl) {
        const syn = (data.kitsu_synopsis || data.synopsis || '').replace(/\s+/g, ' ').trim();
        excerptEl.textContent = syn.length > 190 ? syn.slice(0, 190).replace(/\s+\S*$/, '') + '\u2026' : syn;
    }

    const badge = document.getElementById('heroBadge');
    if (badge && data.status) {
        document.getElementById('heroBadgeText').textContent = data.status;
        badge.hidden = false;
    }

    renderInfoMatrix(data);

     const mal_rating = document.querySelector('.rating');
    if (mal_rating) {
        const paraRating = mal_rating.getElementsByTagName('p')[1];
        if (paraRating) {
            paraRating.textContent = "✦ " + data.average_rating || "N/A";
        }
    }

    const popularity = document.querySelector('.popularity');
    if (popularity) {
        const paraPopularity=popularity.getElementsByTagName('p')[1];
        paraPopularity.textContent =  typeof data.popularity === 'number'
            ? "# " + data.popularity.toLocaleString()
            : "N/A";
    }

     const members = document.querySelector('.members');
    if (members) {
        const paraMembers=members.getElementsByTagName('p')[1];
        paraMembers.textContent =  typeof data.members === 'number'
            ? data.members.toLocaleString()
            : "N/A";
    }
    
    const info_2 = document.querySelector('.season-info');
    if (info_2) {
      const anchor = info_2.getElementsByTagName('a')[0];
      if (anchor) {
        const anchorSpan = anchor.getElementsByTagName('span')[0];
        if (anchorSpan) {
          anchorSpan.textContent = `${data.season || ''} ${data.anime_year || ''}`.trim();
          anchor.href = `/browse?category=all&year=${data.anime_year}&season=${data.season}`;
        }
      }
    }



    const genreMainContainer = document.querySelector('.genre');
    if (genreMainContainer && Array.isArray(data.genres)) {
        genreMainContainer.innerHTML = ''; // Clear existing genres
        data.genres.forEach(genreItem => {
            let genreDiv = document.createElement('div');
            genreDiv.classList.add('genreDiv');

            let genreAnchor = document.createElement('a');
            genreAnchor.classList.add('genreAnchor');
            genreAnchor.textContent = genreItem.genre_name;
            genreAnchor.href = `/browse?category=all&genres=${genreItem.mal_id}`;

            genreDiv.appendChild(genreAnchor);
            genreMainContainer.appendChild(genreDiv);
        });
    }

    const themeMainContainer = document.querySelector('.theme');
    if (themeMainContainer && Array.isArray(data.themes)) {
        themeMainContainer.innerHTML = ''; // Clear existing themes
        data.themes.forEach(themeItem => {
            let themeDiv = document.createElement('div');
            themeDiv.classList.add('themeDiv');

            let themeAnchor = document.createElement('a');
            themeAnchor.classList.add('themeAnchor');
            themeAnchor.textContent = themeItem.theme_name;
            themeAnchor.href = `/browse?category=all&themes=${themeItem.mal_id}`;

            themeDiv.appendChild(themeAnchor);
            themeMainContainer.appendChild(themeDiv);
        });
    }
    
    const synopsis = document.querySelector('.synopsis');
    if (synopsis) {
        const synopsisParaOne = synopsis.getElementsByTagName('p')[0];
        if (synopsisParaOne) {
            if (data.synopsis) {
                const formatted = data.synopsis.replace(
                    '[Written by MAL Rewrite]',
                    '<br><br>[Written by MAL Rewrite]'
                );
                synopsisParaOne.innerHTML = formatted;
            } else {
                synopsisParaOne.textContent = 'Synopsis not available.';
            }
            if(!data.synopsis){
                synopsis.textContent=data.kitsu_synopsis
            }
        }
    }




    updateStatusButtonAvailability(data);
    // Set maxEpisodes for tracking logic
    maxEpisodes = typeof data.episodes === 'number' ? data.episodes : null;
}


// --- Tracking UI and Logic ---
const statusButtons = document.querySelectorAll('.status-button');
const epInput = document.getElementById('ep-input');
const epMinusBtn = document.getElementById('ep-minus');
const epPlusBtn = document.getElementById('ep-plus');
const scoreInput = document.getElementById('score-input');
const moodSelect = document.getElementById('mood-select');

// Map for status button styles
const statusStyleMap = {
    watching: {
        color: '#4DA6FF'
    }, // Vibrant blue
    completed: {
        color: '#6FCF97'
    }, // Soft green
    'plan-to-watch': {
        color: '#F4D03F'
    }, // Bright yellow
    'on-hold': {
        color: '#A569BD'
    }, // Muted purple
    dropped: {
        color: '#E74C3C'
    } // Bold red
};

// Helper to show only the completed button or restore all buttons
function showOnlyCompletedButton() {
    statusButtons.forEach(btn => {
        if (btn.dataset.status.toLowerCase() !== 'completed') {
            btn.style.display = 'none';
        } else {
            btn.style.display = '';
        }
    });
}

// Helper to show all status buttons
function showAllStatusButtons() {
    statusButtons.forEach(btn => {
        btn.style.display = '';
    });
}

// Helper to set status and apply corresponding styles
function setStatus(statusKey) {
    statusButtons.forEach(b => {
        b.classList.remove('active');
        b.style.backgroundColor = '';
        b.style.color = '';
        b.style.border = '';
    });
    const btn = Array.from(statusButtons).find(
        b => b.dataset.status.toLowerCase() === statusKey
    );
    if (btn) {
        btn.classList.add('active');
        const style = statusStyleMap[statusKey];
        if (style) {
            Object.assign(btn.style, style);
        }
    }
    // Set input borders to match status color
    const borderColor = statusStyleMap[statusKey]?.color || '#3B82F6';
    if (epInput) epInput.style.border = `1px solid ${borderColor}`;
    if (scoreInput) scoreInput.style.border = `1px solid ${borderColor}`;

    if (statusKey === 'completed') {
        showOnlyCompletedButton();
    } else {
        showAllStatusButtons();
    }
}

// Disables status buttons except 'Plan to Watch' for unreleased anime
function updateStatusButtonAvailability(data) {
    if (data.status && data.status.toLowerCase().includes('not yet aired')) {
        statusButtons.forEach(btn => {
            if (btn.dataset.status.toLowerCase() !== 'plan-to-watch') {
                btn.disabled = true;
                btn.classList.add('disabled');
            } else {
                btn.disabled = false;
                btn.classList.remove('disabled');
            }
        });
    } else {
        statusButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('disabled');
        });
    }
}

// --- Status Button Event Listeners ---
statusButtons.forEach(button => {
    button.addEventListener('click', () => {
        const status = button.dataset.status?.toLowerCase();
        setStatus(status);

        // If status is completed, set episodes to max
        if (status === 'completed' && maxEpisodes !== null) {
            if (epInput) epInput.value = maxEpisodes;
        }

        sendTrackingData();
    });
});

// --- Episode Plus/Minus Logic ---
[epPlusBtn, epMinusBtn].forEach(btn => btn?.addEventListener('click', () => {
    let val = Number(epInput.value);
    if (btn.id === 'ep-plus') {
        if (maxEpisodes === null || val < maxEpisodes) val += 1;
    } else {
        if (val > 0) val -= 1;
    }
    if (epInput) epInput.value = val;

    // If episodes watched equals maxEpisodes, set status to "completed"
    if (maxEpisodes !== null && val === maxEpisodes) {
        setStatus('completed');
    } else {
        // Restore all buttons if not completed
        showAllStatusButtons();
        // Change status to "watching" if not already
        const activeBtn = document.querySelector('.status-button.active');
        if (!activeBtn || activeBtn.dataset.status.toLowerCase() !== 'watching') {
            setStatus('watching');
        }
    }

    sendTrackingData();
}));

// --- Episode Input Change Logic ---
epInput?.addEventListener('change', () => {
    let val = Number(epInput.value);
    if (val < 0) val = 0;
    if (maxEpisodes !== null && val > maxEpisodes) val = maxEpisodes;
    epInput.value = val;

    if (maxEpisodes !== null && val === maxEpisodes) {
        setStatus('completed');
    } else {
        showAllStatusButtons();
    }

    sendTrackingData();
});

// --- Score Input: Only allow up to 2 digits and 1 decimal ---
scoreInput?.addEventListener('input', function() {
    let val = this.value;

    // Remove all non-digit and non-dot characters
    val = val.replace(/[^0-9.]/g, '');

    // Only allow one decimal point
    const parts = val.split('.');
    if (parts.length > 2) {
        val = parts[0] + '.' + parts.slice(1).join('');
    }

    // Limit integer part to max 2 digits
    let [intPart, decPart] = val.split('.');
    if (intPart && intPart.length > 2) {
        intPart = intPart.slice(0, 2);
    }

    // Limit decimal part to max 1 digit
    if (decPart && decPart.length > 1) {
        decPart = decPart.slice(0, 1);
    }

    // Reconstruct value
    if (typeof decPart !== 'undefined') {
        val = intPart + '.' + decPart;
    } else {
        val = intPart;
    }

    this.value = val;
});

// On blur/change, clamp score to 0–10 and limit to one decimal place
scoreInput?.addEventListener('change', function() {
    let num = parseFloat(this.value);

    if (isNaN(num)) {
        this.value = '';
    } else {
        if (num > 10) num = 10;
        if (num < 0) num = 0;
        this.value = num % 1 === 0 ? num.toString() : num.toFixed(1);
    }

    sendTrackingData();
});

// Mood select change listener
moodSelect?.addEventListener('change', sendTrackingData);

// Sends user tracking data to the server, and SAYS WHAT HAPPENED.
// This used to end in console.log(data), so a save and a failure looked identical
// from the page: nothing. Every outcome now reports here.
let trackStatusTimer = null;
function setTrackStatus(kind, text) {
    const el = document.getElementById('trackStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'track-status' + (kind ? ' is-' + kind : '');
    if (trackStatusTimer) clearTimeout(trackStatusTimer);
    if (text && kind !== 'saving') {
        trackStatusTimer = setTimeout(() => {
            el.textContent = '';
            el.className = 'track-status';
        }, 4000);
    }
}

function sendTrackingData() {
    const trackWatchOrder = document.querySelector('.track-watch-order');
    const malId = trackWatchOrder ? trackWatchOrder.dataset.animeId : null;

    if (!malId) {
        setTrackStatus('bad', 'Could not find this title\u2019s ID \u2014 reload the page.');
        console.warn('Anime ID for tracking not found.');
        return;
    }

    const status = document.querySelector('.status-button.active')?.dataset.status || '';
    const episodes = epInput?.value || 0;
    const score = scoreInput?.value || null;
    const mood = moodSelect?.value || "";

    setTrackStatus('saving', 'Saving\u2026');

    fetch('/api/update-user-anime-tracking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mal_id: Number(malId),
                status,
                current_episode: Number(episodes),
                user_rating: score !== null && score !== '' ? Number(score) : null,
                notes: "",
                mood: mood
            })
        })
        .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (res.status === 401) throw new Error('Sign in to save your progress.');
            if (!res.ok) throw new Error(data.message || data.error || 'Could not save your progress.');
            setTrackStatus('good', 'Saved');
            return data;
        })
        .catch((err) => {
            console.error('Failed to update tracking:', err);
            setTrackStatus('bad', err.message || 'Could not save your progress.');
        });
}

// Loads user tracking data for the current anime on page load
document.addEventListener('DOMContentLoaded', loadUserTracking);

function loadUserTracking() {
    fetch(`/api/user-anime-tracking/${anime_id}`)
        .then(res => res.json())
        .then(data => {
            //console.log(data)
            if (data && Object.keys(data).length > 0) {
                if (data.status) {
                    setStatus(data.status.toLowerCase());
                }
                if (typeof data.current_episode !== 'undefined' && epInput) {
                    epInput.value = data.current_episode;
                }
                if (typeof data.user_rating !== 'undefined' && scoreInput) {
                    scoreInput.value = data.user_rating !== null ? data.user_rating : '';
                }
                if (typeof data.mood !== 'undefined' && moodSelect) {
                    moodSelect.value = data.mood || "";
                }
            }
        })
        .catch(error => console.error('Error loading user tracking data:', error));
}


// --- Tab Navigation ---
const bottomSection = document.querySelector('.bottom-section');
const tabContent = bottomSection.querySelectorAll('.tab-content');
const details_navigation_ul = document.querySelector('.details-navigation-ul');
const navLinks = details_navigation_ul.querySelectorAll('li');

// --- Production staff (fetched the first time the tab is opened) ---
let staffLoaded = false;
function loadStaff() {
    const container = document.getElementById('staffContainer');
    if (!container || staffLoaded) return;
    staffLoaded = true;
    container.innerHTML = '<p class="muted">Loading staff…</p>';

    fetch(`/api/anime/${anime_id}/staff`)
        .then((res) => {
            if (!res.ok) throw new Error('Fetch failed: ' + res.status);
            return res.json();
        })
        .then((result) => {
            const people = (result && result.staff) || [];
            if (!people.length) {
                container.innerHTML = '<p class="muted">No staff information for this title yet.</p>';
                return;
            }
            container.innerHTML = '';
            people.forEach((person) => {
                const card = document.createElement('a');
                card.className = 'staffCard';
                if (person.person_url) {
                    card.href = person.person_url;
                    card.target = '_blank';
                    card.rel = 'noopener';
                }
                const image = document.createElement('div');
                image.className = 'staff_image';
                if (person.image_url) image.style.backgroundImage = `url(${person.image_url})`;
                const detail = document.createElement('div');
                detail.className = 'staff_detail';
                const name = document.createElement('p');
                name.textContent = person.person_name || 'Unknown';
                const role = document.createElement('p');
                role.textContent = person.positions || '';
                detail.appendChild(name);
                detail.appendChild(role);
                card.appendChild(image);
                card.appendChild(detail);
                container.appendChild(card);
            });
        })
        .catch(() => {
            container.innerHTML = '<p class="muted">Could not load staff right now.</p>';
            staffLoaded = false; // allow another try
        });
}

// --- Tab Switching Logic ---
function setActiveContent() {
    navLinks.forEach((li, idx) => {
        li.addEventListener('click', () => {
            navLinks.forEach(link => link.classList.remove('active'));
            tabContent.forEach(sec => {
                sec.classList.remove('active');
                sec.style.display = 'none';
            });
            li.classList.add('active');
            tabContent[idx].classList.add('active');
            tabContent[idx].style.display = 'flex';

            // Only load chart if statistics tab is activated
            if (tabContent[idx].id === 'overview-content') {
                loadAnimeStatistics(anime_id);
            }
            if (tabContent[idx].id === 'staff-content') {
                loadStaff();
            }
        });
    });
}
// Set initial tab state
tabContent.forEach((sec) => {
    if (sec.classList.contains('active')) {
        sec.style.display = 'flex';
        // If statistics tab is default active, load chart
        if (sec.id === 'overview-content') {
            loadAnimeStatistics(anime_id);
        }
    } else {
        sec.style.display = 'none';
    }
});
setActiveContent();

// Shows a friendly notice inside the stats panel instead of destroying it,
// with a retry that restores the charts.
function showStatsNotice(container, message, onRetry) {
    if (!statsOriginalHTML) statsOriginalHTML = container.innerHTML;
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    wrap.innerHTML = '<span class="material-symbols-outlined">bar_chart</span><p></p>';
    wrap.querySelector('p').textContent = message;
    if (onRetry) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'retry';
        btn.textContent = 'Try again';
        btn.addEventListener('click', () => {
            container.innerHTML = statsOriginalHTML;
            onRetry();
        });
        wrap.appendChild(btn);
    }
    container.appendChild(wrap);
}

// --- Sidebar: Information Matrix, score distribution, viewer engagement -----
function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// linked rows come back with varying key names — pull a display name out of any shape
function nameOf(x) {
    if (!x) return '';
    if (typeof x === 'string') return x;
    if (x.name) return x.name;
    for (const k of Object.keys(x)) {
        if (k !== 'mal_id' && typeof x[k] === 'string' && x[k]) return x[k];
    }
    return '';
}
function names(arr) {
    return Array.isArray(arr) ? arr.map(nameOf).filter(Boolean) : [];
}

function renderInfoMatrix(data) {
    const host = document.querySelector('.main-details');
    if (!host) return;

    const rows = [];
    const add = (label, value) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value) && !value.length) return;
        rows.push([label, Array.isArray(value) ? value.join(', ') : String(value)]);
    };

    // Column names here must match the `anime` table exactly — see
    // populate_anime_db.py. It is anime_source (not source), and the airing
    // window lives in start_date / end_date (not `aired`).
    const airingWindow = [data.start_date, data.end_date]
        .map((d) => String(d == null ? '' : d).trim())
        // MySQL date columns can hold 0000-00-00 for "unknown"
        .map((d) => (/^0{4}-0{2}-0{2}/.test(d) ? '' : d))
        .filter(Boolean)
        .join(' to ');

    add('Format', data.anime_type);
    add('Episodes', data.episodes);
    add('Status', data.status);
    add('Aired', airingWindow);
    add('Duration', data.duration);
    add('Season', [data.season, data.anime_year].filter(Boolean).join(' '));
    add('Source', data.anime_source);
    add('Rating', data.rating);
    add('Rank', data.anime_rank ? '#' + data.anime_rank : '');
    add('Studios', names(data.studios));
    add('Producers', names(data.producers));
    add('Licensors', names(data.licensors));
    add('Genres', names(data.genres));
    add('Themes', names(data.themes));
    add('Demographics', names(data.demographics));

    if (!rows.length) {
        host.innerHTML = '<p class="side-empty">No details available.</p>';
        return;
    }
    host.innerHTML = rows
        .map(([k, v]) => '<div class="info-row"><dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(v) + '</dd></div>')
        .join('');
}

function renderScoreBars(stats) {
    const card = document.getElementById('scoreCard');
    const host = document.getElementById('scoreBars');
    if (!card || !host) return;

    const entries = Object.entries(stats.score_counts || {})
        .map(([k, v]) => [Number(k), Number(v)])
        .filter(([k, v]) => !Number.isNaN(k) && v > 0);
    if (!entries.length) return;

    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    entries.sort((a, b) => b[0] - a[0]);

    host.innerHTML = '';
    entries.forEach(([score, count]) => {
        const pct = Math.round((count / total) * 100);
        const row = document.createElement('div');
        row.className = 'score-row';
        row.innerHTML = '<span>' + score + '</span>' +
            '<span class="bar"><span style="width:' + pct + '%"></span></span>' +
            '<span class="pct">' + pct + '%</span>';
        host.appendChild(row);
    });
    card.hidden = false;
}

function renderEngagement(stats) {
    const card = document.getElementById('engageCard');
    const host = document.getElementById('engageChips');
    if (!card || !host) return;

    const entries = Object.entries(stats.status_counts || {})
        .map(([k, v]) => [k, Number(v)])
        .filter(([, v]) => v > 0);
    if (!entries.length) return;

    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    entries.sort((a, b) => b[1] - a[1]);

    host.innerHTML = '';
    entries.slice(0, 4).forEach(([status, count]) => {
        const pct = Math.round((count / total) * 100);
        const el = document.createElement('span');
        el.className = 'engage-chip';
        el.innerHTML = '<b>' + pct + '%</b> ' + escapeHtml(status);
        host.appendChild(el);
    });
    card.hidden = false;
}

// --- Statistics Chart Logic ---
function loadAnimeStatistics() {
    const statsSection = document.getElementById('statistics-content');
    if (statsOriginalHTML) statsSection.innerHTML = statsOriginalHTML; // restore after a retry

    fetch(`/api/anime-statistics/${anime_id}`)
        .then(res => res.json())
        .then(data => {
            if (data.message) {
                showStatsNotice(statsSection, data.message, null);
                return;
            }
            populateChart(data, document.getElementById('status_chart'));
            populateStatusDoughnut(data, document.getElementById('status_doughnut'));
            showStdDevText(data);
            renderScoreBars(data);
            renderEngagement(data);
        })
        .catch(err => {
            showStatsNotice(statsSection, "We couldn't load the community stats just now.", loadAnimeStatistics);
            console.error('Error loading anime statistics:', err);
        });
}

// Displays mean and standard deviation of scores
function showStdDevText(dict) {
    const meanSpan = document.querySelector('.meanSpan');
    const stddevSpan = document.querySelector('.stddevSpan');
    if (!meanSpan || !stddevSpan) return;

    let allScores = dict.all_scores || [];
    // Filter to only valid numbers
    allScores = allScores.map(Number).filter(s => !isNaN(s));

    const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;

    const variance = allScores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allScores.length;
    const stddev = Math.sqrt(variance);

    meanSpan.textContent = mean.toFixed(2);
    stddevSpan.textContent = stddev.toFixed(2);
}

// --- Chart.js Chart Rendering (Score Distribution) ---
function populateChart(dict, chartCanvas) {
    const scoreCounts = dict.score_counts || {};
    const dataPoints = Object.entries(scoreCounts).map(([score, count]) => ({
        x: parseFloat(score),
        y: count
    }));

    // Destroy previous chart instance if exists
    if (window.myAnimeStatsChart) {
        window.myAnimeStatsChart.destroy();
    }

    window.myAnimeStatsChart = new Chart(chartCanvas.getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Score Counts',
                data: dataPoints,
                backgroundColor: 'rgba(255, 99, 132, 0.6)',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Score'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Count'
                    }
                }
            }
        }
    });
}

// --- Doughnut Chart for Status Distribution ---
function populateStatusDoughnut(dict, chartCanvas) {
    const statusCounts = dict.status_counts || {};
    const labels = Object.keys(statusCounts);
    const data = Object.values(statusCounts);

    // Choose colors for each status
    const colorMap = {
        'watching': 'rgba(54, 162, 235, 0.2)', // Sky Blue
        'completed': 'rgba(75, 192, 192, 0.2)', // Aqua / Teal
        'plan-to-watch': 'rgba(255, 205, 86, 0.2)', // Yellow / Gold
        'on-hold': 'rgba(201, 203, 207, 0.2)', // Light Gray
        'dropped': 'rgba(255, 99, 132, 0.2)' // Red / Salmon
    };
    const backgroundColors = labels.map(
        label => colorMap[label.toLowerCase()] || '#888'
    );

    // Destroy previous chart instance if exists
    if (window.myAnimeStatusDoughnut) {
        window.myAnimeStatusDoughnut.destroy();
    }

    window.myAnimeStatusDoughnut = new Chart(chartCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            }
        }
    });
}

// --- Anime Relations Logic ---
const relationContainer = document.querySelector('.relations');

// Fetches and renders related anime
fetch(`/api/anime/${anime_id}/relations`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP Error Failed to fetch data:${response.status}`)
        }
        return response.json()
    })
    .then(data => {
        fetchAndRenderRelations(data)
        renderRecommendationsBelowRelations(anime_id); // Render recommendations after relations
    })
    .catch(error => console.error('Error fetching anime relations:', error));


function fetchAndRenderRelations(data) {
    window.lastRelationsData = data.relations;
    //console.log(data.relations)
    const relation_object = data.relations;
    if (relation_object.length === 0) {
        relationContainer.innerHTML = '<p>No relations found.</p>';
        return;
    }
    // Clear previous content before rendering
    relationContainer.innerHTML = '';

    // Custom sort: Prequel and Sequel first, then others by year
    const priorityOrder = {
        'Prequel': 1,
        'Sequel': 2,
        'Side Story': 3,
        'Parent Story': 4,
        'Summary': 5,
        'Alternative version': 6,
        'Spin-off': 7,
        'Adaptation': 8,
        'Character': 9,
        'Other': 10
    };

    relation_object.sort((a, b) => {
        const getPriority = rel => priorityOrder[rel.relation_type] || 99;
        const prioA = getPriority(a);
        const prioB = getPriority(b);
        if (prioA !== prioB) return prioA - prioB;
        // If same priority, sort by year descending
        const yearA = parseInt(a.anime_year) || 0;
        const yearB = parseInt(b.anime_year) || 0;
        return yearB - yearA;
    });

    relation_object.forEach(relation => {
        const relationDiv = document.createElement('div');
        relationDiv.classList.add('relation-div');

        const relationImageAnchor = document.createElement('a');
        relationImageAnchor.classList.add('relation-image-anchor');
        relationImageAnchor.href = `/anime/${relation.mal_id || ''}`;

        const relationImage = document.createElement('img');
        relationImage.classList.add('relation-image');
        relationImage.src = relation.poster_image_url || relation.title_en;


        const relationDetails = document.createElement('div');
        const relationTitle = document.createElement('a');
        relationTitle.href = `/anime/${relation.mal_id || ''}`;
        relationTitle.classList.add('relation-title');
        relationTitle.textContent = relation.title_en;

        const relationType = document.createElement('p');
        relationType.classList.add('relation-type');
        relationType.textContent = relation.relation_type;
        if (relation.relation_type === 'Prequel') {
            relationType.textContent = `🔽 ${relation.relation_type}`;
        } else if (relation.relation_type === 'Sequel') {
            relationType.textContent = `🔼 ${relation.relation_type}`;
        }

        const year = document.createElement('span');
        year.classList.add('relation-year');
        year.textContent = relation.anime_year;

        relationContainer.appendChild(relationDiv);
        relationDiv.appendChild(relationImageAnchor);
        relationImageAnchor.appendChild(relationImage);
        relationDiv.appendChild(relationDetails);
        relationDetails.appendChild(relationTitle);
        relationDetails.appendChild(relationType);
        relationType.appendChild(year);
    });
}


// --- Recommendations Feature ---
const closeRecommendSection = document.getElementById('close-recommend-section');

if (closeRecommendSection) {
    closeRecommendSection.addEventListener('click', function() {
        document.getElementById('recommend-section').style.display = 'none';
    });
}

// Show the recommendation section and add the event listener for the recommend button
const recommendButton = document.getElementById('recommend-btn')
if (recommendButton) {
    recommendButton.addEventListener('click', function() {
        const section = document.getElementById('recommend-section');
        section.style.display = 'block';
        document.getElementById('current-anime-title').textContent = animeTitleForRecommendation;
        loadRecommendationsForAnime(anime_id);

        // Add a one-time click listener to close when clicking outside
        setTimeout(() => { // Timeout to avoid immediate close on button click
            function handleOutsideClick(e) {
                if (!section.contains(e.target)) {
                    section.style.display = 'none';
                    window.removeEventListener('click', handleOutsideClick);
                }
            }
            window.addEventListener('click', handleOutsideClick);
        }, 0);
    });
}

// Search for anime to recommend
document.getElementById('recommend-search').addEventListener('input', function(e) {
    const query = e.target.value.trim();
    if (!query) {
        document.getElementById('recommend-search-results').innerHTML = '';
        return;
    }

    fetch(`/api/anime?search=${encodeURIComponent(query)}&limit=5`)
        .then(res => res.json())
        .then(data => {
            const resultsDiv = document.getElementById('recommend-search-results');
            resultsDiv.innerHTML = '';
            (data.anime || []).forEach(anime => {
                const div = document.createElement('div');
                div.textContent = anime.title_en || anime.title;
                div.style.cursor = 'pointer';
                div.onclick = function() {
                    recommendAnime(anime_id, anime.mal_id, anime.title_en || anime.title);
                };
                resultsDiv.appendChild(div);
            });
        });
});

// Saves a new recommendation
function recommendAnime(fromAnimeId, toAnimeId, toAnimeTitle) {
    fetch('/api/recommend', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from_anime_id: fromAnimeId,
                to_anime_id: toAnimeId
            })
        })
        .then(res => res.json())
        .then(data => {
            const resultsDiv = document.getElementById('recommend-search-results');
            resultsDiv.innerHTML = `<div style="color:green; font-weight:bold; margin-top:1em;">Added to recommendations!</div>`;
            loadRecommendationsForAnime(fromAnimeId);
        })
        .catch(error => console.error('Error recommending anime:', error));
}

// Loads and displays recommendations for the current anime
function loadRecommendationsForAnime(animeId) {
    fetch(`/api/recommendations/${animeId}`)
        .then(res => res.json())
        .then(data => {
            const recDiv = document.getElementById('your-recommendations');
            recDiv.innerHTML = '<h4>Recommendations:</h4>';
            (data.recommendations || []).forEach(rec => {
                const a = document.createElement('a');
                a.href = `/anime/${rec.to_anime_id}`;
                a.textContent = rec.title_en || rec.title_jp || rec.to_anime_id;
                recDiv.appendChild(a);
                recDiv.appendChild(document.createElement('br'));
            });
        })
        .catch(error => console.error('Error loading your recommendations:', error));
}

// Renders recommendations below the relations section
function renderRecommendationsBelowRelations(animeId) {
    fetch(`/api/recommendations/${animeId}`)
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('recommendations-list');
            container.innerHTML = '';
            if (!data.recommendations || data.recommendations.length === 0) {
                container.innerHTML = '<p style="color:#aaa;">No recommendations yet.</p>';
                return;
            }

            const seenAnimeIds = new Set(); // Use a Set to store unique anime IDs

            data.recommendations.forEach(rec => {
                // Check if this anime ID has already been added
                if (seenAnimeIds.has(rec.to_anime_id)) {
                    return; // Skip this recommendation if it's a duplicate
                }

                // Add the current anime ID to the Set
                seenAnimeIds.add(rec.to_anime_id);

                const card = document.createElement('div');
                card.className = 'recommendation-card';

                const img = document.createElement('img');
                img.src = rec.poster_image_url;
                img.alt = rec.title_en || rec.title_jp || '';
                img.className = 'recommendation-image';

                const info = document.createElement('div');
                info.className = 'recommendation-info';

                const title = document.createElement('a');
                title.href = `/anime/${rec.to_anime_id}`;
                title.textContent = rec.title_en || rec.title_jp || rec.to_anime_id;
                title.className = 'recommendation-title';

                info.appendChild(title);

                card.appendChild(img);
                card.appendChild(info);

                container.appendChild(card);
            });

        })
        .catch(error => console.error('Error rendering recommendations below relations:', error));
}


// --- Review Section ---
const addReviewButton = document.querySelector('.add-review-btn');
const expandReviewButton = document.querySelector('.expand-review'); // This element seems unused, consider removing
const addReviewOverlay = document.querySelector('.add-review-overlay');
const closeButton = document.querySelector('.close-button');

// Show the add review overlay
addReviewButton.addEventListener('click', () => {
    reviewOverlay();
});

function reviewOverlay() {
    addReviewOverlay.style.display = 'flex';
    closeButton.addEventListener('click', () => {
        addReviewOverlay.style.display = 'none';
    });
}

// Close review overlay on submit
document.querySelector('.submit-review-btn').addEventListener('click', () => {
    addReviewOverlay.style.display = 'none';
});

const inputTitle = document.querySelector('#reviewTitle');
const maxLength = inputTitle.maxLength;
const charCountRemaining = document.querySelector('.title-char-count');
const charCount = charCountRemaining.getElementsByTagName('span')[0];

// Update character count for review title input
inputTitle.addEventListener('input', () => {
    const remaining = maxLength - inputTitle.value.length;
    charCount.textContent = remaining;

    if (remaining <= 10) {
        charCount.style.color = "#f08080"; // Red when almost full
    } else if (remaining <= 30) {
        charCount.style.color = "#da9100"; // Orange warning
    } else {
        charCount.style.color = "#008000"; // Green (safe zone)
    }
});


// POST user comments
document.querySelector('#reviewPostForm').addEventListener('submit', (event) => {
    event.preventDefault(); // Prevent default form submission

    const inputTitletValue = document.querySelector('#reviewTitle').value;
    const reviewContentValue = document.querySelector('#reviewContent').value;
    const scoreValue = document.querySelector('input[name="score"]:checked')?.value;
    const verdictValue = document.querySelector('input[name="verdict"]:checked')?.value;

    const commentData = {
        anime_id: anime_id,
        user: user_id,
        title: inputTitletValue,
        content: reviewContentValue,
        score: scoreValue,
        verdict: verdictValue
    };

    fetch(`/api/anime/${anime_id}/user_comments`, {
            method: 'POST',
            headers: {
                'Content-type': 'application/json'
            },
            body: JSON.stringify(commentData)
        })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            // Optionally, re-fetch and render comments to show the new one
            fetchCommentsAndRender();
        })
        .catch(error => console.error('Error posting comment:', error));
});


// Fetch ALL comments for a specific anime
function fetchCommentsAndRender() {
    fetch(`/api/anime/${anime_id}/comments`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            renderComments(data)
        })
        .catch(error => {
            console.error("Error fetching comments:", error);
            const commentList = document.querySelector('.comment-list');
            commentList.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">cloud_off</span><p>We couldn&#39;t load the reviews just now. Please try again.</p></div>';
        });
}

// Initial fetch and render of comments
fetchCommentsAndRender();

// Calculates time ago string
function timeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const seconds = Math.floor((now - past) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) {
        return Math.floor(interval) + " years ago";
    }
    interval = seconds / 2592000;
    if (interval > 1) {
        return Math.floor(interval) + " months ago";
    }
    interval = seconds / 86400;
    if (interval > 1) {
        return Math.floor(interval) + " days ago";
    }
    interval = seconds / 3600;
    if (interval > 1) {
        return Math.floor(interval) + " hours ago";
    }
    interval = seconds / 60;
    if (interval > 1) {
        return Math.floor(interval) + " minutes ago";
    }
    return Math.floor(seconds) + " seconds ago";
}

let showAllReviews = false; // Controls how many reviews are initially shown

// Renders comments to the DOM
function renderComments(comments) {
    const commentList = document.querySelector('.comment-list');
    commentList.innerHTML = '';

    if (comments.length === 0) {
        commentList.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">chat_bubble</span><p>No reviews yet — be the first to share what you thought.</p></div>';
        return;
    }
    const visibleComments = showAllReviews ? comments : comments.slice(0, 10);

    visibleComments.forEach(comment => {
        const commentCard = document.createElement('div');
        commentCard.classList.add('comment-card');
        commentList.appendChild(commentCard);

        // --- Left: Avatar + Like button
        const commentImageDiv = document.createElement('div');
        commentImageDiv.classList.add('comment-image-div');
        commentCard.appendChild(commentImageDiv);

        const commentImageAnchor = document.createElement('a');
        commentImageAnchor.classList.add('comment-image-anchor');
        commentImageDiv.appendChild(commentImageAnchor);

        const commentImage = document.createElement('img');
        commentImage.classList.add('comment-image');
        commentImage.src = comment.profile_pic;
        commentImageAnchor.appendChild(commentImage);

        const likeBtn = document.createElement('button');
        likeBtn.className = `like-comment-btn ${comment.is_liked_by_user ? 'liked' : ''}`;
        likeBtn.dataset.commentId = comment.comment_id;
        likeBtn.innerHTML = `<i class="material-symbols-outlined">thumb_up</i> <span class="like-count">${comment.like_count}</span>`;
        commentImageDiv.appendChild(likeBtn);

        // --- Right: Details
        const commentDetail = document.createElement('div');
        commentDetail.classList.add('comment-detail');
        commentCard.appendChild(commentDetail);

        // --- Top section with username + time + dots
        const topSection = document.createElement('div');
        topSection.className = 'comment-top-section';

        const meta = document.createElement('div');
        meta.className = 'comment-meta';
        meta.innerHTML = `
      <h1 class="comment-user-name">${comment.username || "Random fan"}</h1>
      <p class="time-ago">${timeAgo(comment.created_at)}</p>
    `;
        topSection.appendChild(meta);

        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'vertical-dots-container';

        const dotsBtn = document.createElement('button');
        dotsBtn.className = 'more-vertical-dots';
        dotsBtn.innerHTML = `<i class="material-symbols-outlined">more_vert</i>`;
        dotsContainer.appendChild(dotsBtn);

        const overlay = document.createElement('div');
        overlay.className = 'vertical-dots-overlay';
        const overlayList = document.createElement('ul');

        // Add delete button only if comment belongs to user or current user is admin
        if (comment.is_owner || comment.viewer_is_admin) {
            const deleteLi = document.createElement('li');
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-comment-btn';
            deleteBtn.dataset.commentId = comment.comment_id;

            // Show "Admin delete" ONLY if current user is admin AND not the comment owner
            const isDeletingOthersComment = comment.viewer_is_admin && !comment.is_owner;

            deleteBtn.textContent = isDeletingOthersComment ? 'Admin delete' : 'Delete';

            deleteLi.appendChild(deleteBtn);
            overlayList.appendChild(deleteLi);

        }

        // Always add report button
        const reportLi = document.createElement('li');
        const reportBtn = document.createElement('button');
        reportBtn.className = 'report-comment-btn';
        reportBtn.dataset.commentId = comment.comment_id;
        reportBtn.textContent = 'Report';
        reportLi.appendChild(reportBtn);
        overlayList.appendChild(reportLi);

        overlay.appendChild(overlayList);
        dotsContainer.appendChild(overlay);
        topSection.appendChild(dotsContainer);
        commentDetail.appendChild(topSection);

        // --- Bottom section: title + content + read-more
        const bottomSection = document.createElement('div');
        bottomSection.className = 'bottom-section';
        bottomSection.innerHTML = `
      <h1 class="comment-title">${comment.title}</h1>
      <p class="comment-content clamp">${comment.comment_text}</p>
    `;
        commentDetail.appendChild(bottomSection);
    });
}

// Horizontal scroll for comment list
const leftScroll = document.getElementById('scroll-btn-left');
const rightScroll = document.getElementById('scroll-btn-right');
const commentList = document.querySelector('.comment-list');

leftScroll.addEventListener('click', () => {
    commentList.scrollLeft -= 400;
});
rightScroll.addEventListener('click', () => {
    commentList.scrollLeft += 400;
});

// Toggle vertical dots overlay for comment actions
document.addEventListener('click', (e) => {
    const dotsBtn = e.target.closest('.more-vertical-dots');
    const overlay = dotsBtn?.nextElementSibling;

    // Close all other overlays
    document.querySelectorAll('.vertical-dots-overlay').forEach(o => {
        if (o !== overlay) {
            o.classList.remove('show');
        }
    });

    // Toggle the clicked one
    if (dotsBtn && overlay) {
        overlay.classList.toggle('show');
    }
});

// --- Delete Comment Logic ---
let pendingDeleteId = null; // Stores the ID of the comment to be deleted
let pendingDeleteButton = null; // Stores the button element that triggered the delete

// Event listener for delete comment button
document.addEventListener('click', (e) => {
    const deleteButton = e.target.closest('.delete-comment-btn');
    if (!deleteButton) return;

    // Store comment info for later use
    pendingDeleteId = deleteButton.dataset.commentId;
    pendingDeleteButton = deleteButton;

    // Show delete confirmation modal
    document.getElementById('delete-confirm-modal').classList.add('show');
});

// Cancel delete action
document.getElementById('cancel-delete-btn').addEventListener('click', () => {
    document.getElementById('delete-confirm-modal').classList.remove('show');
    pendingDeleteId = null;
    pendingDeleteButton = null;
});

// Confirm delete action
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;

    try {
        const response = await fetch(`/api/comments/${pendingDeleteId}`, {
            method: 'DELETE',
        });

        const result = await response.json();

        if (result.success) {
            const commentCard = pendingDeleteButton.closest('.comment-card');
            commentCard?.classList.add('fade-out');
            setTimeout(() => commentCard?.remove(), 300); // Fade out and remove after animation
        } else {
            alert("Failed to delete comment: " + (result.error || "Unknown error"));
        }
    } catch (error) {
        console.error("Error deleting comment:", error);
        alert("Something went wrong.");
    } finally {
        document.getElementById('delete-confirm-modal').classList.remove('show');
        pendingDeleteId = null;
        pendingDeleteButton = null;
    }
});

// --- Report Comment Logic ---
let activeReportCommentId = null; // Stores the ID of the comment being reported

// Event listener for report comment button
document.addEventListener('click', (e) => {
    const reportBtn = e.target.closest('.report-comment-btn');
    if (!reportBtn) return;

    activeReportCommentId = reportBtn.dataset.commentId;
    document.getElementById('report-comment-id').value = activeReportCommentId; // Set hidden input for form submission
    document.getElementById('report-modal').classList.add('show');
});

// Cancel report action
document.getElementById('cancel-report-btn').addEventListener('click', () => {
    document.getElementById('report-modal').classList.remove('show');
    document.getElementById('report-form').reset();
});

// Submit report form
document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const reason = document.querySelector('input[name="reason"]:checked')?.value;
    const details = document.getElementById('report-description').value;

    try {
        const response = await fetch(`/api/comments/${activeReportCommentId}/report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reason,
                details
            })
        });

        const result = await response.json();

        if (result.success) {
            alert("Thank you. Your report was submitted.");

            // Disable the report button after successful report
            const reportBtn = document.querySelector(`.report-comment-btn[data-comment-id="${activeReportCommentId}"]`);
            if (reportBtn) {
                reportBtn.disabled = true;
                reportBtn.textContent = 'Reported';
                reportBtn.classList.add('disabled');
            }

        } else {
            alert("Failed to submit report: " + (result.error || "Unknown error."));
        }

    } catch (err) {
        console.error("Report failed:", err);
        alert("Something went wrong.");
    } finally {
        document.getElementById('report-modal').classList.remove('show');
        document.getElementById('report-form').reset();
    }
});

document.addEventListener('click', (e) => {
    const commentCard = e.target.closest('.comment-card');
    if (!commentCard 
        || commentCard.classList.contains('expanded')
        || e.target.closest('.more-vertical-dots') 
        || e.target.closest('.like-comment-btn')) return;

    // Create backdrop
    const backdrop = document.querySelector('.comment-overlay-backdrop');
    backdrop.classList.add('show');

    // Expand the comment card
    commentCard.classList.add('expanded');

    // Remove clamp class to show full comment
    const commentContent = commentCard.querySelector('.comment-content');
    if (commentContent) commentContent.classList.remove('clamp');

    // Clicking outside should close the expanded card
    backdrop.addEventListener('click', function handler() {
        commentCard.classList.remove('expanded');
        backdrop.classList.remove('show');
        // Add clamp class back to hide overflow
        if (commentContent) commentContent.classList.add('clamp');
        // Remove this event listener after it's used
        backdrop.removeEventListener('click', handler);
    });
});

let characterVoiceActorIntervals = [];

function renderCharacterList(animeId) {
    characterVoiceActorIntervals.forEach(clearInterval);
    characterVoiceActorIntervals = [];

    const charContainer = document.querySelector('.charContainer');
    if (!charContainer) {
        console.warn('Character container not found.');
        return;
    }
    charContainer.innerHTML = '';

    fetch(`/api/anime/${animeId}/characters/full`)
        .then(res => {
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            return res.json();
        })
        .then(result => {
            const characters = result.characters;
            //console.log(characters);
            
            if (!characters || characters.length === 0) {
                charContainer.innerHTML = '<p style="color:#aaa;">No characters found.</p>';
                return;
            }

            // Sort by role
            const sortedCharacters = characters.sort((a, b) => {
                const roleOrder = { Main: 0, Supporting: 1 };
                return (roleOrder[a.anime_role] ?? 2) - (roleOrder[b.anime_role] ?? 2);
            });

            sortedCharacters.forEach(entry => {
                const charInfoAndVoiceActor = document.createElement('div');
                charInfoAndVoiceActor.classList.add('charInfoAndVoiceActor');
                charContainer.appendChild(charInfoAndVoiceActor);

                const charDiv = document.createElement('div');
                charDiv.classList.add('charDiv');
                charInfoAndVoiceActor.appendChild(charDiv);

                // Character image
                const char_image = document.createElement('div');
                char_image.classList.add('char_image');
                char_image.style.backgroundImage = `url(${entry.image_url_webp_small || '/static/img/placeholder.png'})`;
                charDiv.appendChild(char_image);

                // Character details
                const char_detail = document.createElement('div');
                char_detail.classList.add('char_detail');
                charDiv.appendChild(char_detail);

                charDiv.addEventListener('click', () => {
                    showCharacterOverlay(entry);
                    appendVaInfo(entry.voice_actors || []);
                });

                const charName = document.createElement('p');
                charName.textContent = entry.character_name || 'Unknown';
                char_detail.appendChild(charName);

                const charRole = document.createElement('p');
                charRole.textContent = entry.anime_role || '';
                char_detail.appendChild(charRole);

                // Voice actor cycling container
                const vaCycler = document.createElement('div');
                vaCycler.classList.add('va-cycler');
                charDiv.appendChild(vaCycler);

                const voiceActors = entry.voice_actors || [];
                let index = 0;

                const renderVoiceActor = (actor) => {
                    vaCycler.innerHTML = '';
                    const voiceActor_detail = document.createElement('div');
                    voiceActor_detail.classList.add('voiceActor_detail');

                    const voiceActor_image = document.createElement('div');
                    voiceActor_image.classList.add('voiceActor_image');
                    voiceActor_image.style.backgroundImage = `url(${actor.image_url || '/static/img/placeholder.png'})`;
                    voiceActor_detail.appendChild(voiceActor_image);

                    const voiceActor_name = document.createElement('p');
                    voiceActor_name.textContent = actor.name || 'Unknown';
                    voiceActor_detail.appendChild(voiceActor_name);

                    const voiceActor_language = document.createElement('p');
                    voiceActor_language.textContent = actor.language;
                    voiceActor_language.style.color = '#9aa0a6';
                    voiceActor_detail.appendChild(voiceActor_language);

                    vaCycler.appendChild(voiceActor_detail);
                };

                if (voiceActors.length > 0) {
                    renderVoiceActor(voiceActors[0]);

                    if (voiceActors.length > 1) {
                        const intervalId = setInterval(() => {
                            index = (index + 1) % voiceActors.length;
                            renderVoiceActor(voiceActors[index]);
                        }, 10000);
                        characterVoiceActorIntervals.push(intervalId);
                    }
                }
            });
        })
        .catch(err => {
            console.error("Character fetch failed:", err);
            charContainer.innerHTML = '<p style="color:#faa;">Error loading characters.</p>';
        });
}

document.addEventListener('DOMContentLoaded', function () {
    if (typeof anime_id !== 'undefined') {
        renderCharacterList(anime_id);
    }
});

function renderField({ label, value, containerClass, listStyle = 'none', target }) {
    if (!value) return;

    const container = document.createElement('div');
    container.classList.add(containerClass);

    const title = document.createElement('p');
    title.innerHTML = `<b>${label}</b>:\u00A0`;
    title.style.margin = '0px';
    container.appendChild(title);

    const valueParts = value
        .split(/[\n;,\/]|\\|\sor\s/i)
        .map(part => part.trim())
        .filter(part => part.length > 0);

    if (valueParts.length > 1) {
        const summary = document.createElement('p');
        summary.textContent = valueParts[0];
        container.appendChild(summary);

        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'See more';
        toggleButton.classList.add('field-toggle-button');
        toggleButton.style.cursor = 'pointer';

        const ul = document.createElement('ul');
        ul.classList.add('floating-dropdown'); // 👈 dropdown styling
        ul.style.display = 'none';

        valueParts.slice(1).forEach(part => {
            const li = document.createElement('li');
            li.textContent = part;
            li.style.listStyle = listStyle;
            ul.appendChild(li);
        });

        toggleButton.addEventListener('click', () => {
            const isVisible = ul.style.display === 'block';
            ul.style.display = isVisible ? 'none' : 'block';
            toggleButton.textContent = isVisible ? 'See more' : 'Hide';
        });

        container.appendChild(toggleButton);
        container.appendChild(ul);
    } else {
        const singleValue = document.createElement('p');
        singleValue.textContent = valueParts[0];
        container.appendChild(singleValue);
    }

    target.appendChild(container);
}

window.showCharacterOverlay = function(data) {
    const characterDetailContainer = document.querySelector('.character-detail-container');
    characterDetailContainer.innerHTML = '';

    const characterOverlay = document.getElementById('character-overlay');
    const closeButton = document.getElementById('close-overlay-button');
    const characterName = document.querySelector('.character-name');
    const charImage = document.querySelector('.character-image');

    characterName.textContent = data.character_name || 'Unknown';
    charImage.src = data.image_url_webp_small;

    // Japanese Writing
    if (data.kanji_katakana) {
        renderField({
            label: 'Japanese',
            value: data.kanji_katakana,
            containerClass: 'alternate-name-container',
            listStyle: 'none',
            target: characterDetailContainer
        });
    }


    // Extract fields from "about" section
    const extractField = (fieldName, text) => {
        const regex = new RegExp(`${fieldName}:\\s*(.+)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    };

    const age = extractField('Age', data.about);
    const birthplace = extractField('Birth place', data.about);
    const Birthday =
        extractField('Birthdate', data.about) ||
        extractField('Birthday', data.about) ||
        extractField('Date of Birth', data.about) ||
        extractField('Born', data.about) ||
        extractField('Birth Date', data.about) ||
        extractField('DOB', data.about);
    const hairColor = extractField('Hair color', data.about) || extractField('Hair', data.about);
    const eyeColor = extractField('Eye color', data.about) || extractField('Eyes', data.about);
    const height = extractField('Height', data.about);
    const weight = extractField('Weight', data.about);

    // Render extracted fields with collapsible values
    renderField({
        label: 'Nickname',
        value: data.nicknames,
        containerClass: 'nickname-container',
        target: characterDetailContainer
    });

    renderField({
        label: 'Birth Place',
        value: birthplace,
        containerClass: 'birthplace-container',
        target: characterDetailContainer
    });

    renderField({
        label: 'Birthday',
        value: Birthday,
        containerClass: 'birthday-container',
        target: characterDetailContainer
    });

    renderField({
        label: 'Age',
        value: age,
        containerClass: 'age-container',
        target: characterDetailContainer
    });

    renderField({
        label: 'Height',
        value: height,
        containerClass: 'height-container',
        target: characterDetailContainer
    });
    renderField({
        label: 'Weight',
        value: weight,
        containerClass: 'weight-container',
        target: characterDetailContainer
    });

    renderField({
        label: 'Hair Colour',
        value: hairColor,
        containerClass: 'hairColor-container',
        target: characterDetailContainer
    });

    renderField({
        label: 'Eye Colour',
        value: eyeColor,
        containerClass: 'eyeColor-container',
        target: characterDetailContainer
    });

function extractParagraphs(text) {
  const excludedKeys = [
    'Age',
    'Birth Place',
    'Birthday',
    'Birthdate',
    'Date of Birth',
    'Born',
    'DOB',
    'Birth Date',
    'Hair color',
    'Eye color',
    'Height',
    'Hair',
    'Eyes',
    'Weight'
  ];

  // Create a regex pattern that matches entire lines starting with excluded keys
  const excludePattern = new RegExp(
    `^\\s*(${excludedKeys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:\\s*.+$`,
    'i'
  );

  // Split by line instead of paragraph (preserve each key:value line separately)
  const lines = text.split(/\r?\n/);

  // Filter: remove excluded lines, keep others
  const result = lines
    .map(line => line.trim())
    .filter(line => line !== '' && !excludePattern.test(line));

  return result;
}

    const result = extractParagraphs(data.about);
    //console.log(result)
// Ensure container is created and cleared
let biographyContainer = document.querySelector('.character-about-container');

if (!biographyContainer) {
  biographyContainer = document.createElement('div');
  biographyContainer.classList.add('character-about-container');
  characterDetailContainer.appendChild(biographyContainer);
} else {
  biographyContainer.innerHTML = ''; // Clear previous content
}

// Append new paragraphs
result.forEach(item => {
  const paragraph = document.createElement('p');
  paragraph.classList.add('biography');
  paragraph.textContent = item;
  biographyContainer.appendChild(paragraph);
});


    characterOverlay.classList.add('open');

    // Close overlay on button click
    closeButton.addEventListener('click', () => {
        characterOverlay.classList.remove('open');
    });
};

function appendVaInfo(data) {
    const languageContainerUl = document.querySelector('.language-container-ul');
    languageContainerUl.innerHTML = '';

    const languageShortMap = {
        "Japanese": "JP",
        "English": "EN",
        "Italian": "IT",
        "Portuguese (BR)": "BR",
        "German": "DE",
        "Hungarian": "HU",
        "French": "FR",
        "Spanish": "ES",
        "Korean": "KR",
        "Hebrew": "HE",
        "Mandarin": "CMN"
    };

    data.forEach(item => {
        const li = document.createElement('li');
        li.classList.add('language-container-ul-li');
        const shortLang = languageShortMap[item.language] || item.language;
        li.textContent = shortLang;

        li.addEventListener('click', () => {
            const characterName = document.querySelector('.character-name');
            const charImage = document.querySelector('.character-image');
            const characterDetailContainer = document.querySelector('.character-detail-container');
            const biographyContainer = document.querySelector('.character-about-container');

            const person_id = item.person.mal_id;

            // Clear existing content
            characterDetailContainer.innerHTML = '';
            biographyContainer.innerHTML = '';

            // Add loader
            const loader = document.createElement('p');
            loader.textContent = 'Loading voice actor info...';
            loader.style.color = 'var(--faded-grey)';
            characterDetailContainer.appendChild(loader);

            // Fetch full VA data
            fetch(`https://api.jikan.moe/v4/people/${person_id}/full`)
                .then(response => {
                    if (!response.ok) throw new Error('Error fetching person data');
                    return response.json();
                })
                .then(res => {
                    characterDetailContainer.innerHTML = ''; // Remove loader
                    // Set VA name and image
                    characterName.textContent = item.person.name || 'Unknown Voice Actor';
                    charImage.src = item.person.images.jpg.image_url;
                    // Render all VA details
                    voiceActorData(res.data);
                })
                .catch(err => {
                    console.error("VA fetch failed:", err);
                    characterDetailContainer.innerHTML = '';
                    const errorMsg = document.createElement('p');
                    errorMsg.textContent = 'Failed to load voice actor details.';
                    errorMsg.style.color = 'tomato';
                    characterDetailContainer.appendChild(errorMsg);
                });
        });

        languageContainerUl.appendChild(li);
    });
}

function voiceActorData(person) {
    const characterDetailContainer = document.querySelector('.character-detail-container');
    const biographyContainer = document.querySelector('.character-about-container');

    // Full Name
    if (person.name) {
        const fullName = document.createElement('p');
        fullName.classList.add('person_info');
        fullName.innerHTML = `<b>Full Name</b>: ${person.name}`;
        characterDetailContainer.appendChild(fullName);
    }

    // Given Name
    if (person.given_name) {
        const given = document.createElement('p');
        given.classList.add('person_info');
        given.innerHTML = `<b>Given Name</b>: ${person.given_name}`;
        characterDetailContainer.appendChild(given);
    }

    // Family Name
    if (person.family_name) {
        const family = document.createElement('p');
        family.classList.add('person_info');
        family.innerHTML = `<b>Family Name</b>: ${person.family_name}`;
        characterDetailContainer.appendChild(family);
    }

    // Alternate Names
    if (person.alternate_names?.length > 0) {
        const alt = document.createElement('p');
        alt.classList.add('person_info');
        alt.innerHTML = `<b>Also Known As</b>: ${person.alternate_names.join(', ')}`;
        characterDetailContainer.appendChild(alt);
    }

    // Birthday
    if (person.birthday) {
        const birthday = document.createElement('p');
        birthday.classList.add('person_info');
        birthday.innerHTML = `<b>Birthday</b>: ${new Date(person.birthday).toDateString()}`;
        characterDetailContainer.appendChild(birthday);
    }

    // Favorites count
    if (person.favorites) {
        const fav = document.createElement('p');
        fav.classList.add('person_info');
        fav.innerHTML = `<b>Favorites</b>: ${person.favorites.toLocaleString()}`;
        characterDetailContainer.appendChild(fav);
    }

    // Website
    if (person.website_url) {
        const web = document.createElement('p');
        web.classList.add('person_info');
        web.innerHTML = `<b>Website</b>: <a href="${person.website_url}" target="_blank">${person.website_url}</a>`;
        biographyContainer.appendChild(web);
    }

    // Biography
    if (person.about) {
        const aboutTitle = document.createElement('p');
        aboutTitle.innerHTML = `<b>Biography</b>:`;
        biographyContainer.appendChild(aboutTitle);

        const bio = document.createElement('p');
        bio.classList.add('biography');
        bio.textContent = person.about;
        biographyContainer.appendChild(bio);
    } else {
        const noBio = document.createElement('p');
        noBio.textContent = "No biography available for this person.";
        biographyContainer.appendChild(noBio);
    }
}
function appendVaInfo(data) {
    const languageContainerUl = document.querySelector('.language-container-ul');
    languageContainerUl.innerHTML = '';

    const languageShortMap = {
        "Japanese": "JP",
        "English": "EN",
        "Italian": "IT",
        "Portuguese (BR)": "BR",
        "German": "DE",
        "Hungarian": "HU",
        "French": "FR",
        "Spanish": "ES",
        "Korean": "KR",
        "Hebrew": "HE",
        "Mandarin": "CMN"
    };

    data.forEach(item => {
        const li = document.createElement('li');
        li.classList.add('language-container-ul-li');
        const shortLang = languageShortMap[item.language] || item.language;
        li.textContent = shortLang;

        li.addEventListener('click', () => {
            const characterName = document.querySelector('.character-name');
            const charImage = document.querySelector('.character-image');
            const characterDetailContainer = document.querySelector('.character-detail-container');
            const biographyContainer = document.querySelector('.character-about-container');

            const person_id = item.person_mal_id;

            // Clear existing content
            characterDetailContainer.innerHTML = '';
            biographyContainer.innerHTML = '';

            // Add loader
            const loader = document.createElement('p');
            loader.textContent = 'Loading voice actor info...';
            loader.style.color = 'var(--faded-grey)';
            characterDetailContainer.appendChild(loader);

            fetch(`/api/va/${person_id}/roles`)
            .then(response => {
                    if (!response.ok) throw new Error('Error fetching person data');
                    return response.json();
                })
                .then(data => {
                  vaOtherRoles(data)
                })
            // Fetch full VA data
            fetch(`https://api.jikan.moe/v4/people/${person_id}/full`)
                .then(response => {
                    if (!response.ok) throw new Error('Error fetching person data');
                    return response.json();
                })
                .then(res => {
                    characterDetailContainer.innerHTML = ''; // Remove loader
                    // Set VA name and image
                    characterName.textContent = item.name || 'Unknown Voice Actor';
                    charImage.src = item.image_url;
                    // Render all VA details
                    voiceActorData(res.data);
                })
                .catch(err => {
                    console.error("VA fetch failed:", err);
                    characterDetailContainer.innerHTML = '';
                    const errorMsg = document.createElement('p');
                    errorMsg.textContent = 'Failed to load voice actor details.';
                    errorMsg.style.color = 'tomato';
                    characterDetailContainer.appendChild(errorMsg);
                });
        });
        

        languageContainerUl.appendChild(li);
    });
}

function voiceActorData(person) {
    const characterDetailContainer = document.querySelector('.character-detail-container');
    const biographyContainer = document.querySelector('.character-about-container');

    // Full Name
    if (person.name) {
        const fullName = document.createElement('p');
        fullName.classList.add('person_info');
        fullName.innerHTML = `<b>Full Name</b>: ${person.name}`;
        characterDetailContainer.appendChild(fullName);
    }

    // Given Name
    if (person.given_name) {
        const given = document.createElement('p');
        given.classList.add('person_info');
        given.innerHTML = `<b>Given Name</b>: ${person.given_name}`;
        characterDetailContainer.appendChild(given);
    }

    // Family Name
    if (person.family_name) {
        const family = document.createElement('p');
        family.classList.add('person_info');
        family.innerHTML = `<b>Family Name</b>: ${person.family_name}`;
        characterDetailContainer.appendChild(family);
    }

    // Alternate Names
    if (person.alternate_names?.length > 0) {
        const alt = document.createElement('p');
        alt.classList.add('person_info');
        alt.innerHTML = `<b>Also Known As</b>: ${person.alternate_names.join(', ')}`;
        characterDetailContainer.appendChild(alt);
    }

    // Birthday
    if (person.birthday) {
        const birthday = document.createElement('p');
        birthday.classList.add('person_info');
        birthday.innerHTML = `<b>Birthday</b>: ${new Date(person.birthday).toDateString()}`;
        characterDetailContainer.appendChild(birthday);
    }

    // Favorites count
    if (person.favorites) {
        const fav = document.createElement('p');
        fav.classList.add('person_info');
        fav.innerHTML = `<b>Favorites</b>: ${person.favorites.toLocaleString()}`;
        characterDetailContainer.appendChild(fav);
    }

    // Website
    if (person.website_url) {
        const web = document.createElement('p');
        web.classList.add('person_info');
        web.innerHTML = `<b>Website</b>: <a href="${person.website_url}" target="_blank">${person.website_url}</a>`;
        biographyContainer.appendChild(web);
    }

    // Biography
    if (person.about) {
        const aboutTitle = document.createElement('p');
        aboutTitle.innerHTML = `<b>Biography</b>:`;
        biographyContainer.appendChild(aboutTitle);

        const bio = document.createElement('p');
        bio.classList.add('biography');
        bio.textContent = person.about;
        biographyContainer.appendChild(bio);
    } else {
        const noBio = document.createElement('p');
        noBio.textContent = "No biography available for this person.";
        biographyContainer.appendChild(noBio);
    }
}

function vaOtherRoles(data) {
    const biographyContainer = document.querySelector('.character-about-container');

    // Remove existing section if already there
    const existing = document.querySelector('.va-roles-section');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.classList.add('va-roles-section');

    const header = document.createElement('h3');
    header.textContent = 'Other Anime Roles';
    section.appendChild(header);

    const list = document.createElement('div');
    list.classList.add('va-roles-list');

    if (!data || data.length === 0) {
        const empty = document.createElement('p');
        empty.classList.add('no-va-roles');
        empty.textContent = 'No other roles found.';
        list.appendChild(empty);
    } else {
        data.forEach(role => {
            const card = document.createElement('div');
            card.classList.add('va-role-card');

            // Image wrapper
            const imageWrapper = document.createElement('div');
            imageWrapper.classList.add('va-role-image');
            const img = document.createElement('img');
            img.src = role.anime_image;
            img.alt = role.anime_title || 'Anime';
            imageWrapper.appendChild(img);

            // Details wrapper
            const details = document.createElement('div');
            details.classList.add('va-role-details');

            const title = document.createElement('a');
            title.classList.add('va-role-title');
            title.textContent = role.anime_title || 'Untitled';
            title.href= `/anime/${role.anime_mal_id || ''}`;

            const char = document.createElement('p');
            char.classList.add('va-role-character');
            char.textContent = `as ${role.character_name}`;

            details.appendChild(title);
            details.appendChild(char);

            card.appendChild(imageWrapper);
            card.appendChild(details);
            list.appendChild(card);
        });
    }

    section.appendChild(list);
    biographyContainer.appendChild(section);
}


const showSimilarCharacter = document.querySelector('.similar-character-form-container');
const detail=document.querySelector('.details')
const overlayContent = document.querySelector('.overlay-content');
const switchSimilarCharacter = document.querySelector('.switch-similar-character');

let isShowingSimilarForm = false;
let originalDetailHTML = detail.innerHTML; // store initial content

switchSimilarCharacter.addEventListener('click', () => {
  if (!isShowingSimilarForm) {
    // Hide the details section
    overlayContent.style.display = 'none';

    // Show the similar character form
    showSimilarCharacter.style.display = 'flex';
    isShowingSimilarForm = true;
  } else {
    // Show the original overlayContents again
    overlayContent.style.display = 'flex';

    // Hide the form
    showSimilarCharacter.style.display = 'none';
    isShowingSimilarForm = false;
  }
});


const toggleBtn = document.getElementById('toggle-stats-btn');
const statsPanel = document.getElementById('statistics-content');

toggleBtn.addEventListener('click', () => {
  statsPanel.classList.toggle('visible');

  toggleBtn.innerHTML = statsPanel.classList.contains('visible')
    ? '<i class="material-symbols-outlined">close</i> Hide Stats'
    : '<i class="material-symbols-outlined">bar_chart</i> Show Stats';
});
