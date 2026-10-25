'use strict';
process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key-for-import-tests';
process.env.DB_HOST = '127.0.0.1';

const http = require('http');
const path = require('path');
const ejs = require('ejs');
const app = require('../src/app');
const zlib = require('zlib');
const imp = require('../src/services/malImport');

let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

const get = (port, p) => new Promise((resolve) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    let body = ''; res.on('data', (d) => (body += d));
    res.on('end', () => resolve({ code: res.statusCode, body }));
  }).on('error', () => resolve({ code: 0, body: '' }));
});

// A realistic MyAnimeList export: every status, a zero score, an unrated entry.
const MAL_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo>
    <user_id>123</user_id>
    <user_name>tester</user_name>
    <user_export_type>1</user_export_type>
  </myinfo>
  <anime>
    <series_animedb_id>52991</series_animedb_id>
    <series_title><![CDATA[Frieren: Beyond Journey's End]]></series_title>
    <series_type>TV</series_type>
    <series_episodes>28</series_episodes>
    <my_watched_episodes>28</my_watched_episodes>
    <my_start_date>2023-10-01</my_start_date>
    <my_finish_date>2024-03-23</my_finish_date>
    <my_score>10</my_score>
    <my_status>Completed</my_status>
    <my_rewatching>0</my_rewatching>
    <my_tags>favourites</my_tags>
  </anime>
  <anime>
    <series_animedb_id>1</series_animedb_id>
    <series_title>Cowboy Bebop</series_title>
    <my_watched_episodes>0</my_watched_episodes>
    <my_score>0</my_score>
    <my_status>Plan to Watch</my_status>
  </anime>
  <anime>
    <series_animedb_id>5114</series_animedb_id>
    <series_title>Fullmetal Alchemist: Brotherhood</series_title>
    <my_watched_episodes>41</my_watched_episodes>
    <my_score>9</my_score>
    <my_status>Watching</my_status>
  </anime>
  <anime>
    <series_animedb_id>20</series_animedb_id>
    <series_title>Naruto</series_title>
    <my_watched_episodes>110</my_watched_episodes>
    <my_score>7</my_score>
    <my_status>On-Hold</my_status>
  </anime>
  <anime>
    <series_animedb_id>30</series_animedb_id>
    <series_title>Neon Genesis Evangelion</series_title>
    <my_watched_episodes>12</my_watched_episodes>
    <my_score>6</my_score>
    <my_status>Dropped</my_status>
  </anime>
</myanimelist>`;

(async () => {
  // ---- status mapping: MAL's wording onto ours ----
  const cases = [
    ['Watching', 'watching'], ['Completed', 'completed'], ['On-Hold', 'on-hold'],
    ['Dropped', 'dropped'], ['Plan to Watch', 'plan-to-watch'],
    ['plan_to_watch', 'plan-to-watch'], ['onhold', 'on-hold'],
    ['  Completed  ', 'completed'], ['On Hold', 'on-hold'],
  ];
  cases.forEach(([from, to]) => ck(`status "${from}" -> ${to}`, imp.mapStatus(from) === to, imp.mapStatus(from)));
  ck('an unknown status maps to nothing', imp.mapStatus('nonsense') === null);
  ck('a missing status maps to nothing', imp.mapStatus('') === null && imp.mapStatus(null) === null);
  ck('every mapped status is one this app uses', cases.every(([, to]) => imp.OUR_STATUSES.includes(to)));

  // ---- score: MAL uses 0 for unrated ----
  ck('score 0 means unrated, not zero', imp.mapScore('0') === null);
  ck('score 10 is kept', imp.mapScore('10') === 10);
  ck('score 7 is kept', imp.mapScore(7) === 7);
  ck('an out-of-range score is dropped', imp.mapScore('42') === null);
  ck('a non-numeric score is dropped', imp.mapScore('abc') === null && imp.mapScore('') === null);

  // ---- episodes ----
  ck('episodes are read', imp.mapEpisodes('28') === 28);
  ck('episodes default to 0', imp.mapEpisodes('') === 0 && imp.mapEpisodes('x') === 0);
  ck('a negative episode count becomes 0', imp.mapEpisodes('-3') === 0);

  // ---- MAL XML ----
  const xml = imp.parseMalXml(MAL_XML);
  ck('every anime block is read', xml.entries.length === 5, xml.entries.length + ' entries');
  ck('it reports the format', xml.format === 'mal-xml');
  ck('no problems on a clean export', xml.problems.length === 0, xml.problems.join(' | ') || 'none');

  const frieren = xml.entries.find((e) => e.malId === 52991);
  ck('the MAL id is read as a number', frieren.malId === 52991, typeof frieren.malId);
  ck('the title is read', frieren.title === "Frieren: Beyond Journey's End", frieren.title);
  ck('the status is mapped', frieren.status === 'completed', frieren.status);
  ck('the score is read', frieren.score === 10, frieren.score);
  ck('the episode progress is read', frieren.episodes === 28, frieren.episodes);

  const bebop = xml.entries.find((e) => e.malId === 1);
  ck('an unrated entry imports with no score', bebop.score === null);
  ck('"Plan to Watch" maps correctly', bebop.status === 'plan-to-watch', bebop.status);
  ck('all five MAL statuses survive the round trip',
    new Set(xml.entries.map((e) => e.status)).size === 5,
    [...new Set(xml.entries.map((e) => e.status))].join(','));

  // ---- quirks a real MAL export has, which a hand-written sample does not ----
  const REAL_QUIRKS = `<?xml version="1.0" encoding="UTF-8" ?>
		<!--
		 Created by XML Export feature at MyAnimeList.net
		 Version 1.1.0
		-->
		<myanimelist>
			<myinfo>
				<user_id>1</user_id>
				<user_total_anime>2</user_total_anime>
			</myinfo>
				<anime>
					<series_animedb_id>36793</series_animedb_id>
					<series_title><![CDATA[3D Kanojo: Real Girl]]></series_title>
					<series_episodes>12</series_episodes>
					<my_id>0</my_id>
					<my_watched_episodes>12</my_watched_episodes>
					<my_start_date>0000-00-00</my_start_date>
					<my_finish_date>0000-00-00</my_finish_date>
					<my_score>7</my_score>
					<my_status>Completed</my_status>
					<my_times_watched>1</my_times_watched>
					<my_tags></my_tags>
					<my_priority>2</my_priority>
					<my_storage></my_storage>
					<my_comments></my_comments>
					<update_on_import>1</update_on_import>
				</anime>
				<anime>
					<series_animedb_id>20</series_animedb_id>
					<series_title><![CDATA[Naruto: Shippuuden]]></series_title>
					<my_watched_episodes>0</my_watched_episodes>
					<my_score>0</my_score>
					<my_status>Plan to Watch</my_status>
					<my_tags>shounen, long</my_tags>
				</anime>
		</myanimelist>`;
  const q = imp.parse(REAL_QUIRKS, 'animelist.xml');
  ck('a real-format export parses', q.entries.length === 2, q.entries.length + ' entries');
  ck('no problems on a real-format export', q.problems.length === 0, q.problems.join(' | ') || 'none');
  ck('a comment after the XML declaration is tolerated', q.format === 'mal-xml');
  ck('CDATA titles are unwrapped', q.entries[0].title === '3D Kanojo: Real Girl', q.entries[0].title);
  ck('zero dates (0000-00-00) do not break anything', q.entries[0].status === 'completed');
  ck('unknown fields are ignored, not fatal', q.entries[0].episodes === 12 && q.entries[0].score === 7);
  ck('a populated my_tags is ignored', q.entries[1].status === 'plan-to-watch');
  ck('MAL id 36793 is read', q.entries[0].malId === 36793);

  // ---- gzipped exports (MAL hands these out, and the browser cannot unpack them) ----
  const gz = zlib.gzipSync(Buffer.from(MAL_XML, 'utf8'));
  ck('a gzipped export is detected by its magic bytes', imp.isGzipped(gz) === true);
  ck('plain bytes are not mistaken for gzip', imp.isGzipped(Buffer.from(MAL_XML)) === false);
  ck('a gzipped export parses', imp.parse(gz, 'animelist.xml.gz').entries.length === 5, imp.parse(gz, 'animelist.xml.gz').entries.length + ' entries');
  ck('a gzipped export named .csv still parses as XML', imp.parse(gz, 'animelist.csv').format === 'mal-xml');
  const tinyCsv = 'mal_id,my_status,my_score,my_watched_episodes\n52991,Completed,10,28\n1,Plan to Watch,0,0\n20,On-Hold,7,110\n';
  ck('a gzipped CSV parses too', imp.parse(zlib.gzipSync(Buffer.from(tinyCsv, 'utf8')), 'x.csv').entries.length === 3);

  let brokenGz = '';
  try { imp.parse(Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03]), 'broken.gz'); } catch (e) { brokenGz = e.message; }
  ck('a corrupt gzip says so clearly', /gzipped but could not be decompressed/i.test(brokenGz), brokenGz.slice(0, 50));

  const junk = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x11, 0x22, 0x00, 0x33]);
  ck('binary junk is recognised as not-text', imp.looksBinary(junk.toString('utf8')) === true);
  let junkMsg = '';
  try { imp.parse(junk, 'junk.bin'); } catch (e) { junkMsg = e.message; }
  ck('binary junk is rejected with a useful message', /does not look like readable text/i.test(junkMsg), junkMsg.slice(0, 50));

  // ---- malformed input must fail clearly, not silently ----
  const badInputs = [
    ['plain text', 'hello world'],
    ['empty', '   '],
    ['xml but not MAL', '<?xml version="1.0"?><rss><channel><title>x</title></channel></rss>'],
    ['json', '{"anime": []}'],
  ];
  badInputs.forEach(([name, body]) => {
    let threw = false;
    let message = '';
    try { imp.parse(body, 'x.xml'); } catch (e) { threw = true; message = e.message; }
    ck(`${name} is rejected with a clear message`, threw && message.length > 10, message.slice(0, 46));
  });

  // ---- CSV ----
  const csv = [
    'anime_id,title,status,score,episodes_watched',
    '52991,"Frieren: Beyond Journey\'s End",Completed,10,28',
    '1,Cowboy Bebop,Plan to Watch,0,0',
    '5114,Fullmetal Alchemist: Brotherhood,Watching,9,41',
  ].join('\n');
  const parsedCsv = imp.parseCsv(csv);
  ck('CSV entries are read', parsedCsv.entries.length === 3, parsedCsv.entries.length + ' entries');
  ck('CSV format is reported', parsedCsv.format === 'csv');
  ck('a quoted field containing a comma and apostrophe survives', parsedCsv.entries[0].title === "Frieren: Beyond Journey's End", parsedCsv.entries[0].title);
  ck('CSV statuses are mapped', parsedCsv.entries[2].status === 'watching', parsedCsv.entries[2].status);
  ck('CSV scores are read', parsedCsv.entries[0].score === 10);

  // alternate header spellings, and a BOM
  const altCsv = '\ufeffmal_id,my_status,my_score,my_watched_episodes\n52991,Completed,10,28\n';
  const alt = imp.parseCsv(altCsv);
  ck('alternate CSV headers are understood', alt.entries.length === 1 && alt.entries[0].malId === 52991, alt.entries.length + ' entries');
  ck('a byte-order mark does not break the header', alt.entries[0].status === 'completed');

  let noIdThrew = '';
  try { imp.parseCsv('foo,bar\n1,2\n'); } catch (e) { noIdThrew = e.message; }
  ck('a CSV without an id column is rejected clearly', /id column/i.test(noIdThrew), noIdThrew.slice(0, 50));
  ck('that error names the header it actually read', /header read: foo, bar/i.test(noIdThrew), noIdThrew.slice(-40));

  let noStatusThrew = '';
  try { imp.parseCsv('mal_id,foo\n1,2\n'); } catch (e) { noStatusThrew = e.message; }
  ck('a CSV without a status column is rejected clearly', /status column/i.test(noStatusThrew), noStatusThrew.slice(0, 50));

  // ---- format detection by content, not just the filename ----
  ck('XML is detected by content even with a .csv name', imp.parse(MAL_XML, 'export.csv').format === 'mal-xml');
  ck('CSV is detected with a .xml name', imp.parse(csv, 'export.xml').format === 'csv');
  ck('a truncated MAL file still parses', imp.parse('<myanimelist><anime><series_animedb_id>5</series_animedb_id><my_status>Watching</my_status></anime></myanimelist>', 'x.xml').entries.length === 1);

  // ---- duplicates ----
  const dup = imp.dedupe([
    { malId: 1, status: 'watching', episodes: 1, score: null },
    { malId: 1, status: 'completed', episodes: 12, score: 8 },
    { malId: 2, status: 'dropped', episodes: 3, score: null },
  ]);
  ck('duplicate ids are collapsed', dup.entries.length === 2, dup.entries.length + ' entries');
  ck('the later duplicate wins', dup.entries.find((e) => e.malId === 1).status === 'completed');
  ck('duplicates are counted and reported', dup.duplicates === 1, dup.duplicates);

  // ---- what an import cannot carry ----
  ck('the import states what it does not carry', Array.isArray(imp.NOT_IMPORTED) && imp.NOT_IMPORTED.length >= 3, imp.NOT_IMPORTED.join(', '));

  // ---- the endpoints are gated ----
  const server = app.listen(5188);
  await new Promise((r) => server.once('listening', r));

  const page = await get(5188, '/import');
  ck('/import redirects a logged-out visitor', page.code === 302, page.code);

  const preview = await new Promise((resolve) => {
    // valid JSON, so the body parser does not reject it before the auth check
    const body = JSON.stringify({});
    const req = http.request({ host: '127.0.0.1', port: 5188, path: '/api/import/preview', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ code: res.statusCode, body: b })); });
    req.on('error', () => resolve({ code: 0, body: '' }));
    req.write(body); req.end();
  });
  ck('the preview endpoint returns 401, not a redirect', preview.code === 401, preview.code);

  const apply = await new Promise((resolve) => {
    const body = JSON.stringify({ token: 'x' });
    const req = http.request({ host: '127.0.0.1', port: 5188, path: '/api/import/apply', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ code: res.statusCode })); });
    req.on('error', () => resolve({ code: 0 }));
    req.write(body); req.end();
  });
  ck('the apply endpoint returns 401, not a redirect', apply.code === 401, apply.code);

  server.close();

  // ---- the page renders and explains itself ----
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'import.ejs'), {
    currentUser: { id: 1, display_name: 'T', is_admin: false, profile_pic: '/default-profile.png' }, isLoggedIn: true,
  });
  ck('the import page renders', html.includes('Import from MyAnimeList'));
  ck('it tells you where to get the file', /Export/.test(html) && /\.xml/.test(html));
  ck('it promises nothing is written before you confirm', /Nothing is written/i.test(html));
  ck('it loads its script', html.includes('/js/import.js'));
  ck('the import page is noindex', html.includes('name="robots" content="noindex"'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
