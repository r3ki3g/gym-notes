import { timeOf, byTime, restGaps, formatRest } from '../js/rest.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
const T = (min, sec = 0) => Date.UTC(2026, 9, 10, 14, min, sec);

console.log('\ntimeOf — client clock first, server time as fallback\n');
eq('loggedAt wins',              timeOf({ loggedAt: 5, createdAt: { seconds: 9 } }), 5);
eq('old set: createdAt seconds', timeOf({ createdAt: { seconds: 9 } }), 9000);
eq('Firestore Timestamp',        timeOf({ createdAt: { toMillis: () => 7 } }), 7);
eq('no time at all',             timeOf({}), null);
eq('null-safe',                  timeOf(null), null);

console.log('\nbyTime — mixed old and new sets end up in logging order\n');
const mixed = [
  { id: 'c', loggedAt: T(10) },
  { id: 'a', createdAt: { seconds: T(2) / 1000 } },   // pre-loggedAt set
  { id: 'b', loggedAt: T(6) },
];
eq('ordered by when logged, whichever field holds it', [...mixed].sort(byTime).map((s) => s.id), ['a', 'b', 'c']);

console.log('\nrestGaps\n');
const day = [{ loggedAt: T(0) }, { loggedAt: T(2, 40) }, { loggedAt: T(5, 25) }];
eq('nothing before the first set', restGaps(day)[0], null);
eq('2:40 between the first two',   restGaps(day)[1], 160000);
eq('2:45 between the next two',    restGaps(day)[2], 165000);
eq('a set with no time breaks only its own gap',
   restGaps([{ loggedAt: T(0) }, {}, { loggedAt: T(4) }]), [null, null, null]);
// two phones' clocks a few seconds apart can put a later set "before" an earlier one
eq('negative gap from clock skew -> blank, not nonsense',
   restGaps([{ loggedAt: T(5) }, { loggedAt: T(4, 58) }])[1], null);
eq('empty list', restGaps([]), []);
eq('one set', restGaps([{ loggedAt: T(0) }]), [null]);

console.log('\nformatRest\n');
eq('under a minute', formatRest(45000), '0:45');
eq('a few minutes',  formatRest(160000), '2:40');
eq('padded seconds', formatRest(65000), '1:05');
eq('over ten minutes', formatRest(725000), '12:05');
eq('over an hour',   formatRest(3900000), '1h 05m');
eq('zero',           formatRest(0), '0:00');
eq('null',           formatRest(null), '0:00');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
