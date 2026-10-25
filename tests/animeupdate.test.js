'use strict';
// The mapping from a Jikan entry to the `anime` table is the part of the
// updater that can be tested without a network or a database, so it is tested
// hard. Column names come from populate_anime_db.py.
const up = require('../src/services/animeUpdate');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

// A realistic Jikan v4 entry: currently airing, unrated, ongoing episode count.
const JIKAN = {
  mal_id: 60123,
  url: 'https://myanimelist.net/anime/60123',
  images: {
    jpg: { image_url: 'https://cdn/jpg.jpg', small_image_url: 'https://cdn/jpg-s.jpg', large_image_url: 'https://cdn/jpg-l.jpg' },
    webp: { image_url: 'https://cdn/webp.webp', small_image_url: 'https://cdn/webp-s.webp', large_image_url: 'https://cdn/webp-l.webp' },
  },
  titles: [
    { type: 'Default', title: 'Yoru no Koe' },
    { type: 'English', title: 'The Voice of Night' },
    { type: 'Japanese', title: '夜の声' },
  ],
  title: 'Yoru no Koe',
  title_english: 'The Voice of Night',
  title_japanese: '夜の声',
  type: 'TV',
  source: 'Original',
  episodes: 12,
  status: 'Currently Airing',
  airing: true,
  aired: { from: '2026-10-05T00:00:00+00:00', to: null, string: 'Oct 5, 2026 to ?' },
  duration: '23 min per ep',
  rating: 'PG-13 - Teens 13 or older',
  score: 8.12,
  scored_by: 12043,
  rank: 431,
  popularity: 1220,
  members: 88231,
  favorites: 3120,
  synopsis: 'A girl who can hear the night.',
  season: 'fall',
  year: 2026,
  genres: [{ mal_id: 8, type: 'anime', name: 'Drama', url: 'x' }, { mal_id: 10, type: 'anime', name: 'Fantasy', url: 'x' }],
  explicit_genres: [],
  themes: [{ mal_id: 62, type: 'anime', name: 'Isekai', url: 'x' }],
  demographics: [{ mal_id: 22, type: 'anime', name: 'Shounen', url: 'x' }],
  studios: [{ mal_id: 43, type: 'anime', name: 'ufotable', url: 'x' }],
  producers: [{ mal_id: 17, type: 'anime', name: 'Aniplex', url: 'x' }],
  licensors: [{ mal_id: 130, type: 'anime', name: 'Crunchyroll', url: 'x' }],
};

// The column list from populate_anime_db.py, verbatim.
const REAL_COLUMNS = ['title_en', 'title_jp', 'synopsis', 'episodes', 'status', 'start_date',
  'poster_image_url', 'average_rating', 'end_date', 'airing', 'duration', 'favorites', 'mal_id',
  'members', 'popularity', 'anime_rank', 'rating', 'scored_by', 'season', 'anime_source',
  'title', 'anime_type', 'url', 'anime_year'];

const row = up.mapAnime(JIKAN);

// ---- the column list must not drift from the schema ----
ck('writes exactly the columns the schema has', up.ANIME_COLUMNS.length === REAL_COLUMNS.length, up.ANIME_COLUMNS.length + ' vs ' + REAL_COLUMNS.length);
ck('in the same order as populate_anime_db.py', up.ANIME_COLUMNS.join(',') === REAL_COLUMNS.join(','), up.ANIME_COLUMNS.join(','));
ck('the mapped row has no extra keys', Object.keys(row).sort().join(',') === REAL_COLUMNS.slice().sort().join(','));

// ---- field by field ----
ck('mal_id', row.mal_id === 60123);
ck('title_en from title_english', row.title_en === 'The Voice of Night', row.title_en);
ck('title_jp from title_japanese', row.title_jp === '夜の声', row.title_jp);
ck('title is the default title', row.title === 'Yoru no Koe');
ck('anime_type from type', row.anime_type === 'TV');
ck('episodes', row.episodes === 12);
ck('status', row.status === 'Currently Airing');
ck('duration', row.duration === '23 min per ep');
ck('rating is the age rating', row.rating === 'PG-13 - Teens 13 or older');
ck('average_rating from score', row.average_rating === 8.12);
ck('members / favorites / scored_by', row.members === 88231 && row.favorites === 3120 && row.scored_by === 12043);
ck('anime_rank from rank', row.anime_rank === 431);
ck('popularity', row.popularity === 1220);
ck('season and year', row.season === 'fall' && row.anime_year === 2026);
ck('url', row.url === 'https://myanimelist.net/anime/60123');
ck('synopsis', row.synopsis === 'A girl who can hear the night.');
ck('anime_source from source — NOT `source`', row.anime_source === 'Original' && row.source === undefined, row.anime_source);

// ---- the two things that broke the anime page before ----
ck('start_date is a DATE, not a timestamp', row.start_date === '2026-10-05', row.start_date);
ck('an unset end_date is null, not "Invalid Date"', row.end_date === null, String(row.end_date));
ck('airing is stored as 1/0, not true/false', row.airing === 1, typeof row.airing);

// ---- images ----
ck('prefers the large webp', row.poster_image_url === 'https://cdn/webp-l.webp', row.poster_image_url);
ck('falls back to the large jpg', up.pickImage({ jpg: { large_image_url: 'J' }, webp: {} }) === 'J');
ck('falls back to the small image', up.pickImage({ jpg: { image_url: 'S' } }) === 'S');
ck('no images means null', up.pickImage({}) === null && up.pickImage(null) === null);

// ---- the awkward values Jikan actually sends ----
ck('an ongoing show has no episode count', up.mapAnime({ ...JIKAN, episodes: null }).episodes === null);
ck('an unrated show has no score', up.mapAnime({ ...JIKAN, score: null }).average_rating === null);
ck('score 0 is treated as unrated', up.mapAnime({ ...JIKAN, score: 0 }).average_rating === null);
ck('a null rank is null', up.mapAnime({ ...JIKAN, rank: null }).anime_rank === null);
ck('rank 0 is treated as missing', up.mapAnime({ ...JIKAN, rank: 0 }).anime_rank === null);
ck('0000-00-00 dates become null', up.dateOnly('0000-00-00T00:00:00+00:00') === null);
ck('a plain date passes through', up.dateOnly('2026-01-02') === '2026-01-02');
ck('a missing date is null', up.dateOnly(null) === null && up.dateOnly(undefined) === null && up.dateOnly('') === null);
ck('empty strings become null, not ""', up.mapAnime({ ...JIKAN, synopsis: '   ' }).synopsis === null);
ck('title_english missing falls back to the titles array', up.mapAnime({ ...JIKAN, title_english: null }).title_en === 'The Voice of Night');
ck('a show with no titles array still maps', up.mapAnime({ ...JIKAN, titles: undefined, title_english: null }).title_en === null);
ck('airing false maps to 0', up.mapAnime({ ...JIKAN, airing: false }).airing === 0);
ck('a null aired object is tolerated', up.mapAnime({ ...JIKAN, aired: null }).start_date === null);

// ---- which rows are worth inserting ----
ck('a row with an id and a title is usable', up.usable([row]).length === 1);
ck('a row with no mal_id is dropped', up.usable([{ ...row, mal_id: null }]).length === 0);
ck('a row with no title at all is dropped', up.usable([{ ...row, title: null, title_en: null, title_jp: null }]).length === 0);
ck('a row with only a Japanese title is kept', up.usable([{ ...row, title: null, title_en: null }]).length === 1);

// ---- parsing a pasted list of ids ----
ck('parses space separated ids', up.parseIdList('52991 20 30').join(',') === '52991,20,30');
ck('parses comma separated ids', up.parseIdList('52991,20,30').join(',') === '52991,20,30');
ck('parses a mix of separators', up.parseIdList('52991, 20\n30; 40|50').join(',') === '52991,20,30,40,50');
ck('strips a leading hash', up.parseIdList('#52991 #20').join(',') === '52991,20');
ck('dedupes', up.parseIdList('20 20 20').join(',') === '20');
ck('drops nonsense', up.parseIdList('abc -5 0 20').join(',') === '20', up.parseIdList('abc -5 0 20').join(','));
ck('drops absurdly large values', up.parseIdList('99999999999').length === 0);
ck('an empty string yields nothing', up.parseIdList('').length === 0 && up.parseIdList(null).length === 0 && up.parseIdList(undefined).length === 0);
ck('trims surrounding whitespace', up.parseIdList('  20 , 30  ').join(',') === '20,30');
ck('handles a realistic pasted column', up.parseIdList('52991\r\n20\r\n30\r\n').join(',') === '52991,20,30');

// ---- the link tables ----
const linkKeys = up.LINK_TABLES.map((l) => l.key);
ck('all seven link types are configured', up.LINK_TABLES.length === 7, linkKeys.join(','));
ck('genres link to anime_genre_link_table', up.LINK_TABLES[0].link === 'anime_genre_link_table' && up.LINK_TABLES[0].linkCol === 'genre_id');
ck('the demographics table name is the awkward one', up.LINK_TABLES[3].link === 'anime_demographics_link_table' && up.LINK_TABLES[3].linkCol === 'demographics_id');
ck('studios use master_studio / studio_name', up.LINK_TABLES[4].master === 'master_studio' && up.LINK_TABLES[4].masterName === 'studio_name');
ck('every link config has the four fields it needs',
  up.LINK_TABLES.every((l) => l.master && l.masterId && l.masterName && l.link && l.linkCol));
ck('the fixture exercises every link type except explicit_genres',
  up.LINK_TABLES.filter((l) => (JIKAN[l.key] || []).length).length === 6);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
