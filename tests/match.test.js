'use strict';
// Server-side title scoring (the catalogue side of the extension's lookup).
const M = require('../src/services/match.js');
let pass = 0, fail = 0;
const ck = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  [' + x + ']' : ''}`); c ? pass++ : fail++; };

ck('exact match scores 1', M.score("Frieren: Beyond Journey's End", "Frieren: Beyond Journey's End") === 1);

const punct = M.score("Frieren Beyond Journeys End", "Frieren: Beyond Journey's End");
ck('punctuation-insensitive match is high', punct >= 0.95, punct);

const season = M.score('Frieren', 'Frieren Season 2');
ck('base title still matches a season entry', season >= 0.7, season);

const caseIns = M.score('frieren', 'FRIEREN');
ck('case-insensitive', caseIns >= 0.9, caseIns);

const unrelated = M.score('Frieren', 'Attack on Titan');
ck('unrelated titles score low', unrelated < 0.2, unrelated);

ck('empty input scores 0', M.score('', 'Frieren') === 0 && M.score('Frieren', '') === 0);

// ranking
const catalogue = [
  { title: 'Attack on Titan', title_en: 'Attack on Titan', title_jp: '進撃の巨人' },
  { title: "Frieren: Beyond Journey's End", title_en: "Frieren: Beyond Journey's End", title_jp: '葬送のフリーレン' },
  { title: 'Frieren Movie', title_en: 'Frieren Movie', title_jp: '' },
];
const ranked = M.rank("Frieren: Beyond Journey's End", catalogue);
ck('rank puts the exact title first', ranked[0].candidate.title_en.startsWith('Frieren:'), ranked[0].candidate.title_en);
ck('rank returns scores', typeof ranked[0].score === 'number', ranked[0].score);
ck('rank respects the limit', M.rank('Frieren', catalogue, 1).length === 1);

// japanese titles are considered
const jp = M.rank('葬送のフリーレン', catalogue);
ck('matches on the Japanese title too', jp[0].score > 0.9, jp[0].score);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
