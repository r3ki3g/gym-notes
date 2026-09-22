import { stepFor, snapTo, normalizedKg, setVolumeKg, formatLoad, formatReps, totalReps } from '../js/units.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};

console.log('\nstepper increments follow the unit\n');
eq('blocks step 1', stepFor('block'), 1);
eq('kg step 2.5',   stepFor('kg'), 2.5);
eq('lb step 5',     stepFor('lb'), 5);
eq('17.4 kg snaps to 17.5 (the typo in the log)', snapTo(17.4, 'kg'), 17.5);
eq('22 lb snaps to 20',  snapTo(22, 'lb'), 20);
eq('5.5 blocks snaps to 6', snapTo(5.5, 'block'), 6);

console.log('\nblocks are never treated as mass\n');
eq('block set is not comparable', normalizedKg({ weight: 5, unit: 'block', perSide: false }), null);
eq('block volume is null, not partial',
  setVolumeKg({ weight: 8, unit: 'block', perSide: false, reps: 7, halfReps: 0,
                drops: [{ weight: 5, unit: 'block', reps: 8, halfReps: 0 }] }), null);

console.log('\nperSide doubles, drops are counted\n');
eq('15 kg/side x 8 = 240 kg', setVolumeKg({ weight: 15, unit: 'kg', perSide: true, reps: 8, halfReps: 0, drops: [] }), 240);
eq('20kg x10 then 12.5kg x4 = 250 kg (drops were once ignored)',
  setVolumeKg({ weight: 20, unit: 'kg', perSide: false, reps: 10, halfReps: 0,
                drops: [{ weight: 12.5, unit: 'kg', reps: 4, halfReps: 0 }] }), 250);
eq('mixed units inside one set convert separately',
  Math.round(setVolumeKg({ weight: 20, unit: 'lb', perSide: false, reps: 12, halfReps: 0,
                drops: [{ weight: 7.5, unit: 'kg', reps: 6, halfReps: 0 }] }) * 10) / 10, 153.9);

console.log('\nhalf reps count as 0.5\n');
eq('12 + 1 half = 12.5', totalReps({ reps: 12, halfReps: 1 }), 12.5);

console.log('\nformatting matches how the log reads\n');
eq('#5',          formatLoad(5, 'block', false), '#5');
eq('15 kg/side',  formatLoad(15, 'kg', true), '15 kg/side');
eq('17.5 kg',     formatLoad(17.5, 'kg', false), '17.5 kg');
eq('12 + 1 half reps', formatReps({ reps: 12, halfReps: 1 }), '12 + 1 half reps');
eq('each side',   formatReps({ reps: 12, halfReps: 0, unilateral: true }), '12 reps each side');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
