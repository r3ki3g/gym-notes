import { parseUtterance, numberize, words, setSummary, voiceDiff, understand, pickBest } from '../js/voice.js';

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

console.log('\nwarm ups, and the Understood line\n');
eq('"warm ups" ticks warm-up', P('warm ups 20 kg 15 reps').set.warmup, true);
eq('"warmup" and "warming up" too', [P('warmup 20 kg 15').set.warmup, P('warming up 20 kg 15').set.warmup], [true, true]);
const U = (t) => understand(t).map((x) => (x.changed ? `[${x.text}]` : x.text)).join(' ');
eq('ribs -> reps, words -> digits, kilos -> kg', U('sixty kilos for twelve ribs'), '[60] [kg] for [12] [reps]');
eq('digits and correct words are left alone', U('60 kg for 12 reps'), '60 kg for 12 reps');
eq('decimals', U('sixty two point five kg'), '[62.5] kg');
eq('a hundred and five', U('one hundred and five pounds'), '[105] [lb]');
eq('warm ups', U('warm ups 20 kg'), '[warm-up] 20 kg');
eq('the comment stays as said', U('50 kg 10 reps add comment felt strong'), '50 kg 10 reps comment: felt strong');
eq('what was heard is kept for a tooltip', understand('12 ribs')[1], { text: 'reps', changed: true, heard: 'ribs' });

console.log('\nthe 9 real transcripts from the voice log (10/21/26)\n');
const sets = (t) => { const r = P(t); return [`${r.set.weight ?? '?'}${r.set.unit || ''}x${r.set.reps ?? '?'}`, ...r.drops.map((d) => `${d.weight}${d.unit}x${d.reps || '?'}`)]; };
eq('1. rips, raps, "lb is", grapes', sets('20 kgs for 10 rips then 15 kgs for 20 raps then 30 lb is for 10 grapes'), ['20kgx10', '15kgx20', '30lbx10']);
eq('2. high rep counts', sets('20 kgs for 10 raps then 13 kgs for 20 raps then 5 kgs for 40 rips'), ['20kgx10', '13kgx20', '5kgx40']);
eq('3. "20 tips for": 20 reps, no weight invented', P('20 tips for').set, { reps: 20 });
eq('4. "420 g" is for 20 reps', sets('20 kgs for 10 ribs then 5 kg is 420 g'), ['20kgx10', '5kgx20']);
eq('5. "warm UPS": warm-up, no reps invented', P('20 kg warm UPS').set, { warmup: true, weight: 20, unit: 'kg' });
eq('6. "to enter apps" is twenty reps', sets('20 kgs for 10 raps then 5 kg is for to enter apps'), ['20kgx10', '5kgx20']);
eq('7. "4" is for', sets('20 kgs for 10 ribs then 10 kg is five raps then 5 kg is 4 2 rapes'), ['20kgx10', '10kgx5', '5kgx2']);
eq('8. grapes, two, "kg is"', sets('20 kgs for 10 grapes then 5 kgs for two reps then 2 kg is 20 raps'), ['20kgx10', '5kgx2', '2kgx20']);
eq('9. wraps, "kg is for two"', sets('10 kgs for 20 wraps then 5 kg is 25 raps then 30 kg is for two reps'), ['10kgx20', '5kgx25', '30kgx2']);
eq('nothing left unparsed in them', ['20 kgs for 10 rips then 15 kgs for 20 raps then 30 lb is for 10 grapes', '20 kgs for 10 ribs then 10 kg is five raps then 5 kg is 4 2 rapes',
  '20 kgs for 10 grapes then 5 kgs for two reps then 2 kg is 20 raps'].flatMap((t) => P(t).unparsed), []);
eq('"20th" where a count goes', sets('2 kg is for 20th'), ['2kgx20']);

console.log('\nwhat must NOT be "corrected"\n');
eq('"for 4 reps" stays 4 reps', P('20 kg for 4 reps').set.reps, 4);
eq('a real 4 kg dumbbell', P('4 kg for 12 reps').set, { weight: 4, unit: 'kg', reps: 12 });
eq('a 420 lb leg press', P('420 lb for 10 reps').set, { weight: 420, unit: 'lb', reps: 10 });
eq('"20 kg" alone gets no reps', P('20 kg').set, { weight: 20, unit: 'kg' });
eq('grapes in a comment stay grapes', [P('50 kg 10 reps add comment grapes were good').comment, P('50 kg 10 reps add comment grapes were good').set.reps], ['Grapes were good', 10]);
eq('words in a comment set nothing', P('50 kg 10 reps add comment slow failure help').set, { weight: 50, unit: 'kg', reps: 10 });
eq('grapes not after a number is not reps', P('50 kg grapes').unparsed, ['grapes']);
eq('blocks stay blocks', P('5 blocks for 10 reps').set, { weight: 5, unit: 'block', reps: 10 });

console.log('\nChrome\'s alternatives\n');
eq('a complete alternative beats a broken first guess',
   pickBest(['20 kgs for 10 grapes then 5 kg is', '20 kgs for 10 grapes then 5 kgs for 20 reps']).index, 1);
eq('agreeing guesses keep the first', pickBest(['5 kg is 4 2 rapes', '5 kg is 4 2 raps', '5 kgs for 2 rapes']).index, 0);
const amb = pickBest(['5 kg for 2 reps', '5 kg for 4 reps']);
eq('different numbers, close: the doubt is kept', [amb.index, amb.doubt?.text], [0, '5 kg for 4 reps']);

console.log('\nthe Understood line shows the repairs\n');
eq('"5 kg is 4 2 rapes"', U('5 kg is 4 2 rapes'), '5 [kg] [for] 2 [reps]');
eq('"5 kg is 420 g"', U('5 kg is 420 g'), '5 [kg] [for] [20] [reps]');
eq('"for to enter apps"', U('5 kg is for to enter apps'), '5 [kg] for [20] [reps]');
eq('grapes only after a number', U('50 kg grapes'), '50 kg grapes');

console.log('\nsets that run together without "then"\n');
eq('the real one: "20 kgs for 20 raps 13 kgs for 20th 15 LBS for 20th"',
   sets('20 kgs for 20 raps 13 kgs for 20th 15 LBS for 20th'), ['20kgx20', '13kgx20', '15lbx20']);
eq('… with nothing left over', P('20 kgs for 20 raps 13 kgs for 20th 15 LBS for 20th').unparsed, []);
eq('pins', sets('pin 7 for 14 pin 5 for 10'), ['7blockx14', '5blockx10']);
eq('plain', sets('60 kg 10 reps 40 kg 8 reps'), ['60kgx10', '40kgx8']);
eq('"then" and run-together mixed', sets('20 kg 10 reps then 15 kg 8 reps 10 kg 6 reps'), ['20kgx10', '15kgx8', '10kgx6']);
eq('a run-together drop with no reps gets none', sets('50 kg 10 reps 30 kg'), ['50kgx10', '30kgx?']);
eq('"4" as "for" in the second set too', sets('20 kg 10 reps 5 kg is 4 2 rapes'), ['20kgx10', '5kgx2']);
eq('no split: "15 kg each side 12 reps"', sets('15 kg each side 12 reps'), ['15kgx12']);
eq('no split: half reps after the reps', P('20 kg 12 reps plus 2 halves').set, { weight: 20, unit: 'kg', reps: 12, halfReps: 2 });
eq('no split before the reps are said', sets('20 kg for 12'), ['20kgx12']);
eq('Understood shows the "then" it inserted', U('20 kgs for 20 raps 13 kgs for 20th'), '20 [kg] for 20 [reps] [then] 13 [kg] for [20]');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
