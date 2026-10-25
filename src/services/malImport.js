'use strict';

const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');

/**
 * Importing a MyAnimeList export.
 *
 * MAL lets you export your list from your profile page as XML. The `my_status`,
 * `my_score` and `my_watched_episodes` fields map cleanly onto what Nikkilog
 * tracks, and `series_animedb_id` is the MAL id — which is the same id we key
 * our catalogue on, so matching is exact rather than fuzzy.
 *
 * A CSV is accepted too, because plenty of third-party converters produce one.
 * Column names are matched loosely.
 *
 * Deliberately pure: no database, no HTTP. Everything here is testable directly.
 */

// The statuses this app uses (see views/anime.ejs and profile.js).
const OUR_STATUSES = ['watching', 'completed', 'on-hold', 'dropped', 'plan-to-watch'];

/** MAL writes "On-Hold" and "Plan to Watch"; normalise before comparing. */
function mapStatus(raw) {
  const key = String(raw == null ? '' : raw)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!key) return null;
  if (key === 'watching') return 'watching';
  if (key === 'completed') return 'completed';
  if (key === 'on-hold' || key === 'onhold') return 'on-hold';
  if (key === 'dropped') return 'dropped';
  if (key === 'plan-to-watch' || key === 'plantowatch' || key === 'plan') return 'plan-to-watch';
  return null;
}

/** MAL uses 0 to mean "not rated". */
function mapScore(raw) {
  const n = Number(String(raw == null ? '' : raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 10) return null;
  return Math.round(n);
}

function mapEpisodes(raw) {
  const n = Number(String(raw == null ? '' : raw).trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function text(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value['#text'] == null ? '' : value['#text']).trim();
  return String(value).trim();
}

// ---------------------------------------------------------------------------
// MAL XML
// ---------------------------------------------------------------------------

function parseMalXml(source) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false, // keep ids as strings; leading zeros and big ints
    trimValues: true,
    isArray: (name) => name === 'anime' || name === 'manga',
  });

  const doc = parser.parse(source);
  const root = doc && doc.myanimelist;
  if (!root) throw new Error('That does not look like a MyAnimeList export.');

  const raw = root.anime == null ? [] : (Array.isArray(root.anime) ? root.anime : [root.anime]);
  const entries = [];
  const problems = [];

  raw.forEach((node, i) => {
    const malId = Number(text(node.series_animedb_id));
    if (!Number.isInteger(malId) || malId <= 0) {
      problems.push(`entry ${i + 1}: no usable anime id`);
      return;
    }
    const status = mapStatus(text(node.my_status));
    if (!status) {
      problems.push(`entry ${i + 1} (${text(node.series_title) || malId}): unrecognised status "${text(node.my_status)}"`);
      return;
    }
    entries.push({
      malId,
      title: text(node.series_title),
      status,
      episodes: mapEpisodes(text(node.my_watched_episodes)),
      score: mapScore(text(node.my_score)),
    });
  });

  return { entries, problems, format: 'mal-xml' };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Splits one CSV line, honouring quoted fields with doubled quotes. */
function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(field); field = ''; }
    else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const CSV_COLUMNS = {
  id: ['mal_id', 'anime_id', 'series_animedb_id', 'id', 'malid'],
  status: ['status', 'my_status', 'list_status'],
  score: ['score', 'my_score', 'rating', 'my_rating'],
  episodes: ['watched', 'episodes_watched', 'my_watched_episodes', 'progress', 'current_episode', 'episodes'],
  title: ['title', 'series_title', 'name'],
};

function findColumn(header, names) {
  for (const name of names) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

function parseCsv(source) {
  const lines = source.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error('The file is empty.');

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/^\ufeff/, ''));
  const cols = {};
  for (const [key, names] of Object.entries(CSV_COLUMNS)) cols[key] = findColumn(header, names);

  if (cols.id < 0) {
    const seen = header.filter(Boolean).slice(0, 8).join(', ') || '(nothing)';
    throw new Error(
      'No anime-id column found in the CSV header. Looked for one of: ' + CSV_COLUMNS.id.join(', ') +
      '. The header read: ' + seen
    );
  }
  if (cols.status < 0) {
    throw new Error('No status column found. Expected one of: ' + CSV_COLUMNS.status.join(', '));
  }

  const entries = [];
  const problems = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = splitCsvLine(lines[i]);
    const malId = Number(row[cols.id]);
    if (!Number.isInteger(malId) || malId <= 0) {
      problems.push(`row ${i + 1}: no usable anime id`);
      continue;
    }
    const status = mapStatus(row[cols.status]);
    if (!status) {
      problems.push(`row ${i + 1}: unrecognised status "${row[cols.status]}"`);
      continue;
    }
    entries.push({
      malId,
      title: cols.title >= 0 ? row[cols.title] || '' : '',
      status,
      episodes: cols.episodes >= 0 ? mapEpisodes(row[cols.episodes]) : 0,
      score: cols.score >= 0 ? mapScore(row[cols.score]) : null,
    });
  }

  return { entries, problems, format: 'csv' };
}

// ---------------------------------------------------------------------------

/** Gzip magic bytes. MyAnimeList hands out .gz exports, and the browser upload
 *  path has no way to decompress them, so we do it here for every caller. */
function isGzipped(buf) {
  return Buffer.isBuffer(buf) && buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/** Accepts a Buffer or a string; transparently decompresses gzip. */
function decode(source) {
  if (!Buffer.isBuffer(source)) return { text: String(source == null ? '' : source), gzipped: false };

  if (isGzipped(source)) {
    try {
      return { text: zlib.gunzipSync(source).toString('utf8'), gzipped: true };
    } catch (err) {
      throw new Error('That file is gzipped but could not be decompressed. Try exporting it again.');
    }
  }
  return { text: source.toString('utf8'), gzipped: false };
}

/** A gzipped file read as text is mostly replacement characters. */
function looksBinary(text) {
  const sample = text.slice(0, 1000);
  if (!sample.length) return false;
  if (sample.includes('\u0000')) return true;
  let bad = 0;
  for (const ch of sample) if (ch === '\ufffd') bad += 1;
  return bad / sample.length > 0.1;
}

/**
 * Picks a parser. Content wins over the filename — people rename files, and a
 * CSV saved as .xml should still import rather than fail confusingly.
 */
function parse(source, filename) {
  const decoded = decode(source);
  const s = decoded.text.replace(/^\ufeff/, '');

  if (!s.trim()) throw new Error('The file is empty.');

  if (looksBinary(s)) {
    throw new Error('That file does not look like readable text. If it is a compressed export, upload the file as it downloaded and it will be unpacked automatically.');
  }

  if (/^\s*<\?xml/i.test(s) || /<myanimelist[\s>]/i.test(s)) return parseMalXml(s);

  const firstLine = s.split(/\r?\n/)[0] || '';
  const looksLikeCsv = firstLine.includes(',') && !firstLine.trim().startsWith('<');
  if (looksLikeCsv) return parseCsv(s);

  // genuinely ambiguous — fall back to what the name suggests
  return /\.xml$/i.test(String(filename || '')) ? parseMalXml(s) : parseCsv(s);
}

/** Collapses duplicate ids, keeping the last one (MAL should not emit them). */
function dedupe(entries) {
  const byId = new Map();
  let duplicates = 0;
  for (const e of entries) {
    if (byId.has(e.malId)) duplicates += 1;
    byId.set(e.malId, e);
  }
  return { entries: Array.from(byId.values()), duplicates };
}

/** What an import cannot carry across, stated plainly rather than dropped silently. */
const NOT_IMPORTED = [
  'start and finish dates',
  'tags',
  'rewatch counts',
];

module.exports = {
  parse,
  decode,
  isGzipped,
  looksBinary,
  parseMalXml,
  parseCsv,
  mapStatus,
  mapScore,
  mapEpisodes,
  dedupe,
  splitCsvLine,
  OUR_STATUSES,
  NOT_IMPORTED,
};
