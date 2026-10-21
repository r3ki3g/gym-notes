import { parseLimit, stepLimit, restingAfter, restHeat, heatColor, shouldBuzz,
         LIMIT_DEFAULT, LIVE_MAX_MS } from '../js/resttimer.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
const T = (min, sec = 0) => Date.UTC(2026, 9, 21, 14, min, sec);
const TODAY = '2026-10-21';

console.log('\nrest limit setting\n');
eq('missing -> 5:00', parseLimit(null), LIMIT_DEFAULT);
eq('junk -> 5:00', parseLimit('abc'), 300);
eq('stored 90 kept', parseLimit('90'), 90);
eq('snapped to 30s steps', parseLimit('100'), 90);
eq('floor 1:00', parseLimit('10'), 60);
eq('cap 10:00', parseLimit('9999'), 600);
eq('+ from 5:00', stepLimit(300, 1), 330);
eq('- stops at 1:00', stepLimit(60, -1), 60);
eq('+ stops at 10:00', stepLimit(600, 1), 600);

console.log('\nwho is resting, since when\n');
const S = [
  { id: 'a1', profileId: 'p', exerciseId: 'bench', date: TODAY, loggedAt: T(0) },
  { id: 'a2', profileId: 'p', exerciseId: 'bench', date: TODAY, loggedAt: T(3) },
  { id: 'b1', profileId: 'q', exerciseId: 'bench', date: TODAY, loggedAt: T(4) },
  { id: 'old', profileId: 'p', exerciseId: 'bench', date: '2026-10-20', loggedAt: T(9) },
];
const r = restingAfter(S, { profileId: 'p', today: TODAY, now: T(5) });
eq('latest set today, not yesterday', r && r.set.id, 'a2');
eq('elapsed since it', r && r.elapsed, 2 * 60_000);
eq('partner tracked separately', restingAfter(S, { profileId: 'q', today: TODAY, now: T(5) }).set.id, 'b1');
eq('nobody with no sets today', restingAfter(S, { profileId: 'z', today: TODAY, now: T(5) }), null);
const moved = [...S, { id: 'a3', profileId: 'p', exerciseId: 'row', date: TODAY, loggedAt: T(4, 30) }];
eq('moved to another exercise: resting after THAT set', restingAfter(moved, { profileId: 'p', today: TODAY, now: T(5) }).set.exerciseId, 'row');
eq('order of the list does not matter', restingAfter([...S].reverse(), { profileId: 'p', today: TODAY, now: T(5) }).set.id, 'a2');
eq('partner clock ahead -> 0, not negative', restingAfter(S, { profileId: 'q', today: TODAY, now: T(3, 58) }).elapsed, 0);
eq('still shown at 30:00', !!restingAfter(S, { profileId: 'p', today: TODAY, now: T(3) + LIVE_MAX_MS }), true);
eq('gone after 30:00', restingAfter(S, { profileId: 'p', today: TODAY, now: T(3) + LIVE_MAX_MS + 1000 }), null);
eq('server time used when loggedAt missing',
   restingAfter([{ id: 'x', profileId: 'p', date: TODAY, createdAt: { seconds: T(1) / 1000 } }], { profileId: 'p', today: TODAY, now: T(2) }).elapsed, 60_000);
eq('a set with no time at all is skipped',
   restingAfter([{ id: 'x', profileId: 'p', date: TODAY }], { profileId: 'p', today: TODAY, now: T(2) }), null);

console.log('\ncolour: grey, then amber, then red at the limit\n');
eq('2:00 of 5:00 -> no heat', restHeat(120_000, 300), 0);
eq('2:30 of 5:00 -> heat starts', restHeat(150_000, 300), 0);
eq('3:45 of 5:00 -> halfway', restHeat(225_000, 300), 0.5);
eq('5:00 -> full', restHeat(300_000, 300), 1);
eq('9:00 -> still full', restHeat(540_000, 300), 1);
eq('1:00 limit scales too', restHeat(45_000, 60), 0.5);
eq('heat 0 = the app grey', heatColor(0), '#8d82a3');
eq('heat 0.5 = the app gold', heatColor(0.5), '#f0b429');
eq('heat 1 = the app red', heatColor(1), '#f87171');
eq('out of range clamps', [heatColor(-1), heatColor(3)], ['#8d82a3', '#f87171']);
const LIGHT = ['#675b7d', '#8f5609', '#b4231f'];
eq('light theme stops used when given', [heatColor(0, LIGHT), heatColor(0.5, LIGHT), heatColor(1, LIGHT)], LIGHT);
eq('a stop it cannot read falls back', heatColor(0, ['', ' #8f5609', 'red']), '#8d82a3');

console.log('\nbuzz: once, at the limit\n');
eq('4:59 -> no', shouldBuzz(299_000, 300), false);
eq('5:00 -> yes', shouldBuzz(300_000, 300), true);
eq('5:59 -> yes (screen just woke)', shouldBuzz(359_000, 300), true);
eq('6:00 -> no (opened late: red, no buzz)', shouldBuzz(360_000, 300), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
