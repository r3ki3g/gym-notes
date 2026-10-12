import {
  metricsFor, convert, chartUnit, suspectIds, dailySeries, axisLabel, niceAxis, labelledIndexes, dayIndex,
  buildProgress, polylineLength, revealDelay,
} from '../js/progress.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};

let n = 0;
const set = (o) => ({ id: 's' + (++n), reps: 0, halfReps: 0, support: 'none', drops: [], loggedAt: n, ...o });

console.log('\nwhich metrics an exercise offers\n');
eq('reps exercise',  metricsFor({}), ['weight', 'reps', 'volume']);
eq('bodyweight',     metricsFor({ bodyweight: true }), ['reps']);
eq('timed',          metricsFor({ metric: 'time', bodyweight: true }), ['longest', 'total']);

console.log('\nunit conversion\n');
eq('lb -> kg',            Math.round(convert(45, 'lb', 'kg') * 10) / 10, 20.4);
eq('kg -> lb',            Math.round(convert(20, 'kg', 'lb') * 10) / 10, 44.1);
eq('same unit untouched', convert(17.5, 'kg', 'kg'), 17.5);
eq('blocks never become mass', convert(5, 'block', 'kg'), null);
eq('mass never becomes blocks', convert(5, 'kg', 'block'), null);

console.log('\none unit per chart\n');
eq('only kg',            chartUnit([set({ unit: 'kg' })]).unit, 'kg');
eq('only lb',            chartUnit([set({ unit: 'lb' })]).unit, 'lb');
eq('kg + lb -> kg',      chartUnit([set({ unit: 'kg' }), set({ unit: 'lb' })]).unit, 'kg');
eq('blocks stay blocks', chartUnit([set({ unit: 'block' })]).unit, 'block');
eq('no sets',            chartUnit([]).unit, null);
eq('blocks + mass: larger family wins, rest reported',
   chartUnit([set({ unit: 'block' }), set({ unit: 'block' }), set({ unit: 'kg' })]), { unit: 'block', excluded: 1 });

console.log('\nwarm-ups and the top set\n');
const day = [
  set({ date: '2026-10-05', unit: 'block', weight: 3, reps: 12, warmup: true }),
  set({ date: '2026-10-05', unit: 'block', weight: 7, reps: 10 }),
  set({ date: '2026-10-05', unit: 'block', weight: 7, reps: 12 }),
  set({ date: '2026-10-05', unit: 'block', weight: 5, reps: 14 }),
];
const w = dailySeries(day, { metric: 'weight', unit: 'block' });
eq('top weight is the heaviest working set', w[0].value, 7);
eq('ties broken by reps — 7 x 12 beats 7 x 10', w[0].top.reps, 12);
eq('a heavier warm-up would not count', dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 40, reps: 5, warmup: true }),
  set({ date: '2026-10-05', unit: 'kg', weight: 20, reps: 10 }),
], { metric: 'weight', unit: 'kg' })[0].value, 20);
eq('warm-ups still listed in the day detail', w[0].sets.length, 4);
eq('a day of only warm-ups yields no point', dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 10, reps: 12, warmup: true }),
], { metric: 'weight', unit: 'kg' }), []);

console.log('\nreps means reps at the top set, not total reps\n');
eq('reps of the heaviest set', dailySeries(day, { metric: 'reps', unit: 'block' })[0].value, 12);
eq('half reps count 0.5', dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 20, reps: 10, halfReps: 1 }),
], { metric: 'reps', unit: 'kg' })[0].value, 10.5);

console.log('\nvolume\n');
eq('sum of weight x reps over working sets', dailySeries(day, { metric: 'volume', unit: 'block' })[0].value, 7*10 + 7*12 + 5*14);
eq('drops included', dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 20, reps: 10, drops: [{ weight: 12.5, unit: 'kg', reps: 4 }] }),
], { metric: 'volume', unit: 'kg' })[0].value, 250);
eq('per side counts both sides', dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 15, reps: 8, perSide: true }),
], { metric: 'volume', unit: 'kg' })[0].value, 240);
eq('mixed units converted into the chart unit', dailySeries([
  set({ date: '2026-10-05', unit: 'lb', weight: 45, reps: 10 }),
  set({ date: '2026-10-05', unit: 'kg', weight: 20, reps: 10 }),
], { metric: 'volume', unit: 'kg' })[0].value, Math.round(45 * 0.45359237 * 10 + 200));

console.log('\nper side is plotted as logged\n');
eq('15 kg / side stays 15, not 30', dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 15, reps: 8, perSide: true }),
], { metric: 'weight', unit: 'kg' })[0].value, 15);
eq('axis says so', axisLabel('weight', 'kg', true), 'kg / side');
eq('blocks axis', axisLabel('weight', 'block', false), '#');
eq('volume axis', axisLabel('volume', 'lb', false), 'lb × reps');

console.log('\nassisted reps vs failure\n');
eq('supported top set -> hollow dot', dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 20, reps: 10, support: 'supported' }),
], { metric: 'weight', unit: 'kg' })[0].hollow, true);
eq('failure is NOT marked — 23% of sets', dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 20, reps: 10, support: 'failure' }),
], { metric: 'weight', unit: 'kg' })[0].hollow, false);

console.log('\ntimed and bodyweight\n');
const holds = [
  set({ date: '2026-10-05', metric: 'time', bodyweight: true, seconds: 45 }),
  set({ date: '2026-10-05', metric: 'time', bodyweight: true, seconds: 90 }),
];
eq('longest hold', dailySeries(holds, { metric: 'longest', unit: null })[0].value, 90);
eq('total time',   dailySeries(holds, { metric: 'total', unit: null })[0].value, 135);
eq('bodyweight reps = best set', dailySeries([
  set({ date: '2026-10-05', bodyweight: true, unit: 'kg', weight: 0, reps: 12 }),
  set({ date: '2026-10-05', bodyweight: true, unit: 'kg', weight: 0, reps: 15 }),
], { metric: 'reps', unit: 'kg' })[0].value, 15);
eq('bodyweight has no top weight', dailySeries([
  set({ date: '2026-10-05', bodyweight: true, unit: 'kg', weight: 0, reps: 12 }),
], { metric: 'weight', unit: 'kg' }), []);

console.log('\none point per day, oldest first\n');
const two = dailySeries([
  set({ date: '2026-10-05', unit: 'kg', weight: 22, reps: 10 }),
  set({ date: '2026-10-02', unit: 'kg', weight: 20, reps: 10 }),
  set({ date: '2026-10-05', unit: 'kg', weight: 24, reps: 8 }),
], { metric: 'weight', unit: 'kg' });
eq('sorted by date', two.map((p) => p.date), ['2026-10-02', '2026-10-05']);
eq('one point per day', two.map((p) => p.value), [20, 24]);

console.log('\nwrong-unit detection — the real 09/21/26 incline press\n');
const incline = [
  ...[65, 75, 75].map((x) => set({ date: '2026-09-21', unit: 'kg', weight: x, reps: 14 })),
  ...[65, 65, 65].map((x) => set({ date: '2026-09-23', unit: 'lb', weight: x, reps: 12 })),
  ...[75, 65, 75, 65].map((x) => set({ date: '2026-10-02', unit: 'lb', weight: x, reps: 12 })),
  ...[75, 65, 75].map((x) => set({ date: '2026-10-05', unit: 'lb', weight: x, reps: 14 })),
];
const flagged = suspectIds(incline);
eq('all three 09/21 kg sets flagged', incline.filter((s) => s.date === '2026-09-21').every((s) => flagged.has(s.id)), true);
eq('nothing else flagged', flagged.size, 3);
const series = dailySeries(incline, { metric: 'weight', unit: 'kg' });
eq('the 09/21 point is marked suspect', series.find((p) => p.date === '2026-09-21').suspect, true);
eq('normal days are not', series.filter((p) => p.suspect).length, 1);
eq('too few sets -> no guessing', suspectIds(incline.slice(0, 3)).size, 0);

console.log('\naxis ticks\n');
const ax = niceAxis([20.4, 24.9]);
eq('bounds contain the data', ax.min <= 20.4 && ax.max >= 24.9, true);
eq('not forced to zero', ax.min > 0, true);
eq('ticks ascending, evenly spaced', ax.ticks.every((t, i) => i === 0 || Math.abs((t - ax.ticks[i - 1]) - (ax.ticks[1] - ax.ticks[0])) < 1e-9), true);
eq('a flat series still gets a range', niceAxis([7, 7]).max > niceAxis([7, 7]).min, true);
eq('never below zero', niceAxis([0.5, 1]).min >= 0, true);
eq('empty is safe', niceAxis([]), { min: 0, max: 1, ticks: [0, 1] });
// the real lat pulldown range, #8 to #16, drew 7.5 / 12.5 / 17.5 before this
const blk = niceAxis([8, 10, 12, 14, 16], { integer: true });
eq('integer axis: whole ticks only', blk.ticks.every(Number.isInteger), true);
eq('integer axis: still contains the data', blk.min <= 8 && blk.max >= 16, true);
eq('integer axis: a narrow range steps by 1, never 0.5', (() => {
  const t = niceAxis([14, 15], { integer: true }).ticks; return t[1] - t[0];
})(), 1);
// 20.4-24.9 genuinely picks a step of 2 (all whole); 10-17.2 needs the 2.5 step
eq('non-integer axis still allows 2.5 steps', niceAxis([10, 17.2]).ticks.some((t) => !Number.isInteger(t)), true);

console.log('\ndate labels never collide, newest always kept\n');
eq('spread out -> all kept', labelledIndexes([0, 60, 120], 46), [0, 1, 2]);
// 40px apart would break the 46px minimum, so only the ends fit — 2 labels is
// the most possible while still keeping the newest.
eq('crowded -> thinned',     labelledIndexes([0, 20, 40, 60, 80], 46), [0, 4]);
eq('newest kept even when crowded', labelledIndexes([0, 50, 70], 46).includes(2), true);
eq('kept labels are far enough apart', (() => {
  const xs = [0, 10, 30, 47, 52, 90, 95]; const k = labelledIndexes(xs, 46);
  return k.every((v, i) => i === 0 || xs[v] - xs[k[i - 1]] >= 46);
})(), true);

console.log('\nreal calendar spacing\n');
eq('same day',        dayIndex('2026-10-05', '2026-10-05'), 0);
eq('across a month',  dayIndex('2026-10-02', '2026-09-21'), 11);
eq('rest days are gaps, not equal ticks', dayIndex('2026-10-09', '2026-10-05') > dayIndex('2026-10-05', '2026-10-03'), true);

console.log('\nbuildProgress — what the screen decides to show\n');
const ME = { id: 'p1', name: 'Prabhashwara' }, THEM = { id: 'p2', name: 'Chamuth' };
const db = (o) => set({ exerciseId: 'e', unit: 'lb', ...o });
const two_days = [
  db({ profileId: 'p1', date: '2026-10-02', weight: 75, reps: 12 }),
  db({ profileId: 'p1', date: '2026-10-05', weight: 75, reps: 14 }),
  db({ profileId: 'p2', date: '2026-10-02', weight: 45, reps: 10 }),
  db({ profileId: 'p2', date: '2026-10-05', weight: 45, reps: 12, unit: 'kg' }),
];
const P = buildProgress({ exercise: {}, people: [ME, THEM], pool: two_days, metric: 'weight' });
function P0() { return buildProgress({ exercise: {}, people: [ME], pool: two_days, metric: 'reps' }); }
eq('blocks get an integer axis', buildProgress({ exercise: {}, people: [ME], metric: 'weight',
  pool: [set({ exerciseId: 'e', profileId: 'p1', date: '2026-10-02', unit: 'block', weight: 7, reps: 10 })] }).integerAxis, true);
eq('reps get an integer axis', P0().integerAxis, true);
eq('kg weight does not', buildProgress({ exercise: {}, people: [ME], pool: two_days, metric: 'weight' }).integerAxis, false);
eq('two people -> two series, you first', P.series.map((s) => [s.key, s.name, s.marker]),
   [['me', 'Prabhashwara', 'dot'], ['them', 'Chamuth', 'diamond']]);
eq('kg + lb across both people -> one shared kg axis', P.unit, 'kg');
eq('2+ sessions -> chart', P.layout, 'chart');
eq('conversion is announced', P.notes.includes('lb converted to kg'), true);
eq('...but not on a reps chart, where nothing was converted', buildProgress({ exercise: {}, people: [ME, THEM], pool: two_days, metric: 'reps' }).notes.includes('lb converted to kg'), false);
eq('unknown metric falls back to the default', buildProgress({ exercise: {}, people: [ME], pool: two_days, metric: 'bogus' }).metric, 'weight');

const one = buildProgress({ exercise: {}, people: [ME, THEM], pool: two_days.filter((s) => s.date === '2026-10-02'), metric: 'weight' });
eq('one session each -> stat tiles, not a one-dot chart', one.layout, 'tiles');
eq('tiles carry no chart-only notes (nothing was converted on a tile)', one.notes.includes('lb converted to kg'), false);
eq('nothing logged -> empty', buildProgress({ exercise: {}, people: [ME], pool: [], metric: 'weight' }).layout, 'empty');

// The unit is chosen from whoever is on screen: alone, all your sets are lb, so
// the chart stays in lb. Chamuth's kg set is what made the two-person chart kg.
const solo = buildProgress({
  exercise: {}, people: [ME], pool: [...two_days, db({ profileId: 'p9', date: '2026-10-02', weight: 999, reps: 1 })], metric: 'weight',
});
eq('someone not on screen is left out (no 999)', solo.series[0].points.map((p) => p.value), [75, 75]);
eq('and the unit follows who is shown', solo.unit, 'lb');

eq('timed exercise ignores stray rep sets', buildProgress({
  exercise: { metric: 'time' }, people: [ME], metric: 'longest',
  pool: [set({ exerciseId: 'e', profileId: 'p1', date: '2026-10-02', metric: 'time', seconds: 60 }),
         set({ exerciseId: 'e', profileId: 'p1', date: '2026-10-05', metric: 'time', seconds: 75 }),
         set({ exerciseId: 'e', profileId: 'p1', date: '2026-10-05', unit: 'kg', weight: 10, reps: 10 })],
}).series[0].points.map((p) => p.value), [60, 75]);

eq('reps metric says what it means', buildProgress({ exercise: {}, people: [ME], pool: two_days, metric: 'reps' })
   .notes.includes('reps at the heaviest set'), true);
eq('suspect points are announced', buildProgress({ exercise: {}, people: [ME], pool: incline.map((s) => ({ ...s, profileId: 'p1', exerciseId: 'e' })), metric: 'weight' })
   .notes.includes('dashed ring: unit looks wrong'), true);

console.log('\nanimation geometry\n');
eq('a 3-4-5 segment is 5 long', polylineLength([[0, 0], [3, 4]]), 5);
eq('segments add up', polylineLength([[0, 0], [3, 4], [6, 8]]), 10);
eq('one point has no length', polylineLength([[5, 5]]), 0);
eq('no points', polylineLength([]), 0);
eq('first dot drops at the start',  revealDelay(40, 40, 300), 60);
eq('last dot drops at the end',     revealDelay(340, 40, 300), 900);
eq('dots land left to right', revealDelay(100, 40, 300) < revealDelay(200, 40, 300), true);
eq('clamped outside the plot', [revealDelay(0, 40, 300), revealDelay(999, 40, 300)], [60, 900]);
eq('zero-width plot is safe', revealDelay(50, 40, 0), 60);
// keeps pace with the 900ms line: the dot delay spread must not finish early
eq('dot delays span the line draw', revealDelay(340, 40, 300) - revealDelay(40, 40, 300) >= 800, true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
