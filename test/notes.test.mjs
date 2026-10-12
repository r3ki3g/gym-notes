import { QUICK_NOTES, hasNote, toggleNote } from '../js/notes.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};

console.log('\nthe chosen phrases\n');
eq('eight, in the agreed order', QUICK_NOTES.length, 8);
// a chip duplicating a structured field would record one fact in two places
eq('none duplicates a field (Support / Warm-up)',
   QUICK_NOTES.some((q) => /^(no sup|supped|failure|warm.?up)$/i.test(q)), false);

console.log('\nadding\n');
eq('into an empty comment',     toggleNote('', 'Good form'), 'Good form');
eq('after a previous note',     toggleNote('Ultra slow reps', 'Good form'), 'Ultra slow reps. Good form');
eq('after typed text ending in a period — no double dot',
   toggleNote('Felt strong.', 'Good form'), 'Felt strong. Good form');
eq('emoji phrase',              toggleNote('', 'Chad 💪'), 'Chad 💪');

console.log('\nremoving — tapping a lit chip takes it back out\n');
eq('the only note',     toggleNote('Good form', 'Good form'), '');
eq('from the end',      toggleNote('Ultra slow reps. Good form', 'Good form'), 'Ultra slow reps');
eq('from the start',    toggleNote('Good form. Ultra slow reps', 'Good form'), 'Ultra slow reps');
eq('from the middle',   toggleNote('A. Good form. B', 'Good form'), 'A. B');
eq('case-insensitive',  toggleNote('good FORM', 'Good form'), '');
eq('round trip leaves the comment as it was',
   toggleNote(toggleNote('Wrist pain', 'Chad 💪'), 'Chad 💪'), 'Wrist pain');

console.log('\nhand-typed text is never mangled\n');
eq('decimals are not split',  toggleNote('Rested 1.5 min', 'Good form'), 'Rested 1.5 min. Good form');
eq('commas left alone',       toggleNote('good form, last rep hard', 'Good form'), 'good form, last rep hard. Good form');
eq('a phrase INSIDE a sentence is not treated as the chip',
   hasNote('good form, last rep hard', 'Good form'), false);

console.log('\nhasNote — drives the lit/unlit state of each chip\n');
eq('present',    hasNote('Ultra slow reps. Good form', 'Good form'), true);
eq('absent',     hasNote('Ultra slow reps', 'Good form'), false);
eq('empty',      hasNote('', 'Good form'), false);
eq('null-safe',  hasNote(null, 'Good form'), false);
eq('trailing period still counts', hasNote('Good form.', 'Good form'), true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
