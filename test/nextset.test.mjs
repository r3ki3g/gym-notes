import { suggestNext, hardWhy, effReps, evenReps, earnedStepUp, painNote, AIM_REPS } from '../js/nextset.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
let clock = Date.UTC(2026, 9, 1, 12);
const S = (date, weight, reps, extra = {}) => ({ id: 's' + clock, date, weight, reps, unit: 'kg', profileId: 'p', exerciseId: 'e', loggedAt: (clock += 120_000), ...extra });
const LAST = '2026-10-19', TODAY = '2026-10-21';
const run = (sets) => suggestNext({ sets, profileId: 'p', exerciseId: 'e', today: TODAY });
const w = (x) => x && `${x.weight}${x.unit === 'block' ? '#' : x.unit}x${x.reps}${x.warmup ? 'W' : ''}`;
const brief = (r) => r && { rule: r.rule, primary: w(r.primary), alt: w(r.alt) };

// last session: warm-up 20, then a ramp 50 → 55 → 60
const last = () => [S(LAST, 20, 12, { warmup: true }), S(LAST, 50, 12), S(LAST, 55, 12), S(LAST, 60, 10)];

console.log('\nopening the exercise\n');
eq('1. warmed up last time: that warm-up again, opener as the option', brief(run(last())), { rule: 1, primary: '20kgx12W', alt: '50kgx12' });
eq('2. no warm-up last time: start where you STARTED (50), not where you ended (60)',
   brief(run(last().slice(1))), { rule: 2, primary: '50kgx12', alt: '55kgx12' });
eq('2. a warm-up already done today: straight to the opener', brief(run([...last(), S(TODAY, 20, 12, { warmup: true })])), { rule: 2, primary: '50kgx12', alt: '55kgx12' });
eq('the reason says so', run(last().slice(1)).reason, 'Started at 50 kg last time, so starting there again');

console.log('\nduring the session\n');
eq('3. clean and below last top: climb to the next weight used last time',
   brief(run([...last(), S(TODAY, 50, 12)])), { rule: 3, primary: '55kgx12', alt: '50kgx12' });
eq('3. reps follow the last set, in 2s, capped at 12', brief(run([...last(), S(TODAY, 50, 11)])).primary, '55kgx12');
eq('4. failure: same again, next weight up as the option',
   brief(run([...last(), S(TODAY, 55, 12, { support: 'failure' })])), { rule: 4, primary: '55kgx12', alt: '60kgx12' });
eq('4. the reason names it', run([...last(), S(TODAY, 55, 12, { support: 'failure' })]).reason, 'Repeating: last set hit failure');
eq('5. at last top: same again, +1 step as the option',
   brief(run([...last(), S(TODAY, 60, 10)])), { rule: 5, primary: '60kgx10', alt: '62.5kgx12' });
eq('6. first session, 12+ clean reps: one step up', brief(run([S(TODAY, 40, 12)])), { rule: 6, primary: '42.5kgx12', alt: '40kgx12' });
eq('6. first session, under 12: same again', brief(run([S(TODAY, 40, 9)])), { rule: 6, primary: '40kgx9', alt: null });
eq('7. never done it: says so, suggests nothing', run([]).rule, 7);
eq('timed holds: left to the old pre-fill', run([S(LAST, 0, 0, { metric: 'time', seconds: 60 })]), null);

console.log('\nsafety rules\n');
const pained = [S(LAST, 50, 12), S(LAST, 60, 10, { comment: 'Wrist pain' })];
eq('pain last time: hold, never heavier, no option', brief(run([...pained, S(TODAY, 50, 12)])), { rule: 'pain', primary: '50kgx12', alt: null });
eq('and the reason names the note', run([...pained, S(TODAY, 50, 12)]).reason, 'Holding: wrist pain noted last time');
eq('tempo sets: the same tempo set again', brief(run([...last(), S(TODAY, 30, 12, { comment: 'Ultra slow reps' })])), { rule: 'tempo', primary: '30kgx12', alt: null });
eq('tempo sets never set the opener', brief(run([S(LAST, 30, 12, { comment: 'Ultra slow reps' }), S(LAST, 50, 12)])).primary, '50kgx12');
eq('assisted reps do not count', [effReps({ reps: 12, comment: 'Last 2 supped' }), effReps({ reps: 12, support: 'light' })], [10, 11]);
eq('pin 7 → 8 is a big jump: 12 reps is not enough', earnedStepUp({ weight: 7, unit: 'block', reps: 12 }), false);
eq('… 16 is', earnedStepUp({ weight: 7, unit: 'block', reps: 16 }), true);
eq('a 2.5 kg step on 100 kg: 12 is enough', earnedStepUp({ weight: 100, unit: 'kg', reps: 12 }), true);
eq('first session at pin 7 x 12: same weight suggested', brief(run([S(TODAY, 7, 12, { unit: 'block' })])).primary, '7#x12');
eq('… but one step up is the option at the top of last time', brief(run([S(LAST, 7, 12, { unit: 'block' }), S(TODAY, 7, 12, { unit: 'block' })])).alt, '8#x12');

console.log('\nhelpers\n');
eq('reps in 2s, ties up', [evenReps(11), evenReps(12), evenReps(13), evenReps(1)], [12, 12, 14, 2]);
eq('hard sets', [hardWhy({ support: 'supported' }), hardWhy({ halfReps: 2 }), hardWhy({ drops: [{}] }), hardWhy({ comment: 'Struggled last reps' }), hardWhy({})],
   ['had help', 'had partials', 'was a drop set', 'was a struggle', null]);
eq('pain notes', [painNote({ comment: 'Wrist pain' }), painNote({ comment: 'knee hurt a bit' }), painNote({ comment: 'Good form' })], ['wrist pain', 'knee hurt', null]);
eq('lb and kg: 25 lb counts as the same as 11.5 kg', brief(run([S(LAST, 25, 12, { unit: 'lb' }), S(LAST, 30, 12, { unit: 'lb' }), S(TODAY, 11.5, 12)])).primary, '30lbx12');
eq('other people and exercises are ignored', brief(suggestNext({ sets: [...last(), S(TODAY, 90, 5, { profileId: 'q' })], profileId: 'p', exerciseId: 'e', today: TODAY })).rule, 1);
eq('the aim is 12', AIM_REPS, 12);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
