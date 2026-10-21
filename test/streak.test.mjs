import { weekStart, parseTarget, gymDays, level, grid, streaks, TARGET_DEFAULT } from '../js/streak.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
const days = (...dates) => new Map(dates.map((d) => [d, 12]));

console.log('\nweeks start on Monday\n');
eq('Wednesday 10/21/26 -> Monday 10/19', weekStart('2026-10-21'), '2026-10-19');
eq('Monday is its own week', weekStart('2026-10-19'), '2026-10-19');
eq('Sunday belongs to the week before', weekStart('2026-10-25'), '2026-10-19');
eq('across a month', weekStart('2026-10-01'), '2026-09-28');

console.log('\nsettings and levels\n');
eq('default target is 4 days', [parseTarget(null), TARGET_DEFAULT], [4, 4]);
eq('clamped to 1-7', [parseTarget('0'), parseTarget('9'), parseTarget('3')], [1, 7, 3]);
eq('levels by sets logged', [level(0), level(5), level(12), level(25)], [0, 1, 2, 3]);
eq('gym days per person, all sets counted',
   [...gymDays([{ profileId: 'p', date: 'x' }, { profileId: 'p', date: 'x', warmup: true }, { profileId: 'q', date: 'x' }], 'p')], [['x', 2]]);

console.log('\nthe grid\n');
const g = grid(days('2026-10-19', '2026-10-21'), { today: '2026-10-21', weeks: 13 });
eq('13 weeks, Monday first', [g.length, g[12].start, g[0].start], [13, '2026-10-19', '2026-07-27']);
eq('this week: Mon and Wed filled, Thu onwards in the future',
   g[12].days.map((d) => (d.future ? '-' : d.count ? 'X' : '.')).join(''), 'X.X----');

console.log('\nstreaks, in weeks hitting the target\n');
// weeks of 09/28, 10/05, 10/12: 4, 4, 2 days; this week (10/19): 1 day so far
const hist = days('2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
                  '2026-10-05', '2026-10-06', '2026-10-08', '2026-10-10',
                  '2026-10-12', '2026-10-14',
                  '2026-10-19');
eq('last week missed the target: streak 0, best 2', streaks(hist, { today: '2026-10-21', target: 4 }), { thisWeek: 1, current: 0, best: 2 });
eq('same history, target 2: every week hits', streaks(hist, { today: '2026-10-21', target: 2 }), { thisWeek: 1, current: 3, best: 3 });
const hit = days('2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22');
eq('this week, before the target: does not break it', streaks(hit, { today: '2026-10-21', target: 4 }), { thisWeek: 3, current: 1, best: 1 });
eq('this week, once it hits: adds to it', streaks(hit, { today: '2026-10-22', target: 4 }), { thisWeek: 4, current: 2, best: 2 });
eq('no gym days', streaks(new Map(), { today: '2026-10-21', target: 4 }), { thisWeek: 0, current: 0, best: 0 });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
