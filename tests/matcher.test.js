'use strict';
// Verifies the extension's title parser against titles streaming sites really use.
const M = require('../extension/lib/matcher.js');
let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

function parseOne(title, url) {
  return M.parse({ title, urlSlug: url ? M.slugFromUrl(url) : '' });
}

// --- episode extraction ---
const epCases = [
  ["Frieren: Beyond Journey's End Episode 5 English Subbed | HiAnime", 5],
  ["Watch One Piece Episode 1120 Online Free - AniWatch", 1120],
  ["Jujutsu Kaisen - Episode 24 [1080p]", 24],
  ["Sousou no Frieren 第5話", 5],
  ["Chainsaw Man Ep. 8", 8],
  ["Mob Psycho 100 E3", 3],
  ["Attack on Titan - 87 [Sub]", 87],
];
for (const [title, want] of epCases) {
  const got = parseOne(title).episode;
  ck('episode from: ' + title.slice(0, 44), got === want, got + ' (want ' + want + ')');
}

// --- series extraction ---
const seriesCases = [
  ["Frieren: Beyond Journey's End Episode 5 English Subbed | HiAnime", /frieren/i],
  ["Watch One Piece Episode 1120 Online Free - AniWatch", /one piece/i],
  ["Jujutsu Kaisen - Episode 24 [1080p]", /jujutsu kaisen/i],
];
for (const [title, want] of seriesCases) {
  const got = parseOne(title).series;
  ck('series from: ' + title.slice(0, 40), want.test(got), got);
}

// --- it must NOT mistake years or resolutions for episodes ---
const notEpisodes = [
  "Frieren: Beyond Journey's End (2023) | Site",
  "Demon Slayer Season 3 [1080p] - Site",
];
for (const title of notEpisodes) {
  const got = parseOne(title);
  ck('no false episode in: ' + title.slice(0, 38), got.episode === null || got.episode < 100, got.episode);
}

// --- noise stripping ---
ck('noise removed from series name', !/\b(watch|online|subbed|1080p)\b/i.test(parseOne("Watch Frieren Episode 5 Online Subbed 1080p").series), parseOne("Watch Frieren Episode 5 Online Subbed 1080p").series);

// --- confidence ordering: a real marker beats a bare number ---
ck('explicit "Episode N" scores high', M.parseCandidate('Frieren Episode 5').confidence >= 0.9, M.parseCandidate('Frieren Episode 5').confidence);
ck('bare trailing number scores lower', M.parseCandidate('Frieren 5').confidence < 0.9, M.parseCandidate('Frieren 5').confidence);

// --- URL slug fallback ---
ck('slug fallback works', /frieren/.test(M.slugFromUrl('https://site.to/watch/frieren-beyond-journeys-end-episode-5')), M.slugFromUrl('https://site.to/watch/frieren-beyond-journeys-end-episode-5'));

// --- degenerate input must not throw ---
for (const bad of ['', null, undefined, '   ', '|', ' - ']) {
  const r = M.parse({ title: bad });
  if (typeof r.confidence !== 'number') { ck('handles ' + JSON.stringify(bad), false); }
}
ck('handles empty/degenerate input', true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
