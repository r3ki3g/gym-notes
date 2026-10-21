import { parseStore, recordPick, learnedPick, phraseCount, listPicks, forgetPhrase, MAX_PHRASES, EXPIRE_MS } from '../js/learn.js';
import { searchExercises } from '../js/search.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 9, 21, 12);
const pick = (store, q, id, t = T0) => recordPick(store, q, id, t);

console.log('\nstorage\n');
eq('missing -> empty', parseStore(null), { phrases: {} });
eq('corrupt -> empty', parseStore('{not json'), { phrases: {} });
eq('wrong shape -> empty', parseStore('{"phrases":null}'), { phrases: {} });
let s = pick(parseStore(null), '  Lateral ', 'latraise');
eq('stored lowercased and trimmed', Object.keys(s.phrases), ['lateral']);
eq('counted', s.phrases.lateral.latraise.n, 1);
eq('one-letter queries are not learned', pick(parseStore(null), 'l', 'x'), { phrases: {} });
eq('counts add up', pick(s, 'lateral', 'latraise', T0 + 1).phrases.lateral.latraise.n, 2);

console.log('\nyour words, your exercise\n');
eq('same words -> that exercise', learnedPick(s, 'lateral', T0), 'latraise');
eq('any casing', learnedPick(s, 'LATERAL', T0), 'latraise');
eq('the start of a saved phrase works: "lat"', learnedPick(s, 'lat', T0), 'latraise');
eq('one letter: nothing yet', learnedPick(s, 'l', T0), null);
eq('words never used: nothing', learnedPick(s, 'raise', T0), null);
eq('typing past the saved phrase: nothing', learnedPick(s, 'lateral raise', T0), null);

console.log('\nthe exact phrase outranks longer ones\n');
let t = pick(pick(pick(parseStore(null), 'lateral', 'latraise'), 'lateral', 'latraise'), 'lateral', 'latraise');
t = pick(t, 'lat', 'pulldown');
eq('"lat" picked once beats "lateral" picked 3 times', learnedPick(t, 'lat', T0), 'pulldown');
eq('"la" falls back to every phrase starting with it: most picks', learnedPick(t, 'la', T0), 'latraise');

console.log('\nmistakes wash out\n');
let m = pick(parseStore(null), 'raise', 'wrong', T0);
m = pick(m, 'raise', 'right', T0 + 60_000);
eq('a tie goes to the most recent tap', learnedPick(m, 'raise', T0 + 120_000), 'right');
m = pick(m, 'raise', 'right', T0 + 120_000);
eq('and then it simply has more picks', learnedPick(m, 'raise', T0 + 180_000), 'right');

console.log('\nold picks expire, the store stays small\n');
const old = pick(parseStore(null), 'curl', 'hammer', T0);
eq('59 days later: still used', learnedPick(old, 'curl', T0 + 59 * DAY), 'hammer');
eq('61 days later: ignored', learnedPick(old, 'curl', T0 + 61 * DAY), null);
eq('and dropped on the next save', Object.keys(pick(old, 'press', 'bench', T0 + EXPIRE_MS + DAY).phrases), ['press']);
let big = parseStore(null);
for (let i = 0; i < MAX_PHRASES + 15; i++) big = pick(big, 'phrase ' + i, 'x', T0 + i);
eq(`capped at ${MAX_PHRASES} phrases`, phraseCount(big, T0 + MAX_PHRASES + 15), MAX_PHRASES);
eq('the least recently used go first', !!big.phrases['phrase 0'] || !!big.phrases['phrase 14'], false);
eq('the newest stay', !!big.phrases['phrase ' + (MAX_PHRASES + 14)], true);

console.log('\nsearch puts the learned pick first, among real matches only\n');
const POOL = [
  { id: 'latraise', name: 'Dumbbell lateral raise', muscles: ['side delts'] },
  { id: 'pulldown', name: 'Lat pull down', muscles: ['lats'] },
  { id: 'calf',     name: 'Calf raise', muscles: ['calves'] },
];
const ids = (q, pinned) => searchExercises(POOL, q, { pinned }).map((e) => e.id);
eq('without learning, "raise" is A-Z', ids('raise'), ['calf', 'latraise']);
eq('pinned goes first', ids('raise', 'latraise'), ['latraise', 'calf']);
eq('the rest keep their order', ids('lat', 'latraise'), ['latraise', 'pulldown']);
eq('a pinned exercise that does not match is NOT added', ids('raise', 'pulldown'), ['calf', 'latraise']);
eq('empty box: no pinning', ids('', 'pulldown')[0], 'calf');

console.log('\nShow my picks\n');
let L = pick(parseStore(null), 'raise', 'calf', T0);
L = pick(L, 'raise', 'latraise', T0 + 1000);
L = pick(L, 'raise', 'calf', T0 + 2000);
L = pick(L, 'curl', 'hammer', T0 + 5000);
L = recordPick(L, 'press', 'bench', T0 - 70 * DAY);          // long expired
const list = listPicks(L, T0 + 6000);
eq('newest phrase first, expired left out', list.map((x) => x.phrase), ['curl', 'raise']);
eq('within a phrase, the one search uses on top', list[1].picks.map((x) => [x.id, x.n]), [['calf', 2], ['latraise', 1]]);
eq('agrees with search', list[1].picks[0].id, learnedPick(L, 'raise', T0 + 6000));
eq('count leaves out expired too', phraseCount(L, T0 + 6000), 2);
const F = forgetPhrase(L, 'raise');
eq('delete one phrase', listPicks(F, T0 + 6000).map((x) => x.phrase), ['curl']);
eq('and search stops using it', learnedPick(F, 'raise', T0 + 6000), null);
eq('the original is untouched', !!L.phrases.raise, true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
