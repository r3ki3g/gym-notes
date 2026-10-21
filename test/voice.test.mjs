import { parseUtterance, numberize, words, setSummary, voiceDiff } from '../js/voice.js';

let pass = 0, fail = 0;
// field order never matters
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const eq = (name, got, want) => {
  const ok = canon(got) === canon(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
const P = (t, o) => parseUtterance(t, o);
const drops = (r) => r.drops.map((d) => `${d.weight}${d.unit}x${d.reps}${d.halfReps ? '+' + d.halfReps + 'h' : ''}`);

console.log('\nnumbers as spoken\n');
eq('words to numbers', numberize(words('sixty two point five')), [62.5]);
eq('teens and tens', numberize(words('twelve reps fourteen')), [12, 'reps', 14]);
eq('a hundred and five', numberize(words('one hundred and five')), [105]);
eq('a hundred, then words', numberize(words('hundred and ten kg')), [110, 'kg']);
eq('"and" that is not part of the number', numberize(words('one hundred and good form')), [100, 'and', 'good', 'form']);
eq('digits stay digits, 60lbs splits', numberize(words('60lbs 62.5kg')), [60, 'lbs', 62.5, 'kg']);
eq('"for" and "to" stay words', numberize(words('for 10 drop to 5')), ['for', 10, 'drop', 'to', 5]);

console.log('\nthe spec examples\n');
let r = P('60 lbs for 10 reps then 30 lbs for 12 reps');
eq('set: 60 lb x 10', r.set, { weight: 60, unit: 'lb', reps: 10 });
eq('drop: 30 lb x 12', drops(r), ['30lbx12']);
r = P('pin 7 for 14, drop to 5 for 10');
eq('pin 7 x 14', r.set, { weight: 7, unit: 'block', reps: 14 });
eq('drop to 5: pins carried over', drops(r), ['5blockx10']);
r = P('62.5 kg 8 reps dropped 50 for 6 then 40 for 6');
eq('62.5 kg x 8', r.set, { weight: 62.5, unit: 'kg', reps: 8 });
eq('two drops, kg carried', drops(r), ['50kgx6', '40kgx6']);
r = P('sixty kilos twelve reps failure');
eq('words + failure', r.set, { support: 'failure', weight: 60, unit: 'kg', reps: 12 });
r = P('40 for 12 plus 2 halves add comment wrist felt weird', { unit: 'lb' });
eq('form unit used, half reps', r.set, { weight: 40, unit: 'lb', reps: 12, halfReps: 2 });
eq('comment is the words after the command', r.comment, 'Wrist felt weird');
eq('nothing left over', r.unparsed, []);
r = P('warm up 20 kg 15 reps');
eq('warm-up', r.set, { warmup: true, weight: 20, unit: 'kg', reps: 15 });

console.log('\ncomments are a command, never a dumping ground\n');
r = P('50 kg 10 reps blah banana');
eq('unknown words are reported, not saved', [r.comment, r.unparsed], [null, ['blah', 'banana']]);
eq('"note" works too', P('50 kg 10 reps note left shoulder tight').comment, 'Left shoulder tight');
eq('"add a comment"', P('add a comment great pump').comment, 'Great pump');
eq('numbers inside a comment stay in it', P('50 kg 10 reps comment 3 sets of this next time').set, { weight: 50, unit: 'kg', reps: 10 });

console.log('\ndrop-set words\n');
eq('"drop set"', drops(P('60 kg 10 reps drop set 40 kg 8 reps')), ['40kgx8']);
eq('"dropped to"', drops(P('60 kg 10 reps dropped to 40 for 8')), ['40kgx8']);
eq('"drop down to"', drops(P('60 kg 10 reps drop down to 40 for 8')), ['40kgx8']);
eq('a drop heavier than the set is flagged', P('40 kg 10 then 60 for 8').warnings, ['Drop 1 is heavier than the set']);
eq('at most 3 drops', P('100 kg 5 then 90 for 5 then 80 for 5 then 70 for 5 then 60 for 5').drops.length, 3);

console.log('\nflags and notes\n');
eq('spotted -> supported', P('50 kg 10 spotted').set.support, 'supported');
eq('light help -> light', P('50 kg 10 light help').set.support, 'light');
eq('help on the way up is the quick note, not support', [P('50 kg 10 help on the way up').notes, P('50 kg 10 help on the way up').set.support], [['Help on the way up'], undefined]);
eq('quick notes', P('30 kg 12 ultra slow good form').notes, ['Ultra slow reps', 'Good form']);
eq('last two supped', P('30 kg 12 last two supped').notes, ['Last 2 supped']);
eq('15 kg each side -> weight per side', P('15 kg each side 12 reps').set, { weight: 15, unit: 'kg', perSide: true, reps: 12 });
eq('12 reps each side -> reps per side', P('20 kg 12 reps each side').set, { weight: 20, unit: 'kg', reps: 12, unilateral: true });
eq('"and a half" after reps: one half rep', P('50 kg 12 and a half').set, { weight: 50, unit: 'kg', reps: 12, halfReps: 1 });
eq('"and a half" before a unit: a weight', P('twelve and a half kilos for 10').set, { weight: 12.5, unit: 'kg', reps: 10 });

console.log('\nexercise types\n');
eq('timed: seconds', P('45 seconds', { timed: true }).set, { seconds: 45 });
eq('timed: a minute 30', P('a minute 30', { timed: true }).set, { seconds: 90 });
eq('timed: bare number is seconds', P('60', { timed: true }).set, { seconds: 60 });
eq('bodyweight: a bare number is reps', P('15', { bodyweight: true }).set, { reps: 15 });
eq('60 x 10', P('60x10', { unit: 'kg' }).set, { weight: 60, reps: 10, unit: 'kg' });
eq('empty', P('   '), { set: {}, drops: [], notes: [], comment: null, unparsed: [], warnings: [] });

console.log('\nmishearings and the voice log\n');
eq('"ribs" means reps', P('50 kg 12 ribs').set, { weight: 50, unit: 'kg', reps: 12 });
eq('"rips" too', P('50 kg for 12 rips').set, { weight: 50, unit: 'kg', reps: 12 });
const heard = P('50 kg 12 reps then 30 for 10');
eq('nothing changed: empty diff', voiceDiff(heard, { weight: 50, unit: 'kg', reps: 12, support: 'none', drops: [{ weight: 30, unit: 'kg', reps: 10 }] }), { corrected: {}, missed: [] });
eq('reps corrected 12 -> 10, failure added by hand, drop removed',
   voiceDiff(heard, { weight: 50, unit: 'kg', reps: 10, support: 'failure', drops: [] }), { corrected: { reps: [12, 10], drops: [1, 0] }, missed: ['support'] });
eq('a per-side default the person never spoke is not "missed"',
   voiceDiff(heard, { weight: 50, unit: 'kg', reps: 12, perSide: true, drops: [{ weight: 30, unit: 'kg', reps: 10 }] }), { corrected: {}, missed: [] });
eq('summary keeps what matters, drops simplified',
   setSummary({ weight: 50, unit: 'kg', reps: 10, halfReps: 0, comment: '', drops: [{ weight: 30, unit: 'kg', reps: 8, extra: 1 }] }),
   { weight: 50, unit: 'kg', reps: 10, halfReps: 0, drops: [{ weight: 30, unit: 'kg', reps: 8, halfReps: 0 }] });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
