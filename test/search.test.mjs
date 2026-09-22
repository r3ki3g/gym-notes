import { searchExercises } from '../js/search.js';
import { SEED_EXERCISES } from '../js/seed.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
  cond ? pass++ : fail++;
};
const names = (q) => searchExercises(SEED_EXERCISES, q).map((e) => e.name);
const idx = (q, n) => names(q).indexOf(n);

console.log('\nmuscle priority beats name matching\n');

const tri = searchExercises(SEED_EXERCISES, 'tricep');
const firstSecondary = tri.findIndex((e) => e.muscles.indexOf('triceps') > 0);
const lastPrimary    = tri.map((e) => e.muscles.indexOf('triceps') === 0).lastIndexOf(true);
ok('every tricep-primary ranks above every tricep-secondary',
  lastPrimary < firstSecondary, `lastPrimary=${lastPrimary} firstSecondary=${firstSecondary}`);

ok('"tricep extension" keeps machine AND dumbbell versions',
  idx('tricep extension', 'Tricep extension machine') >= 0 &&
  idx('tricep extension', 'Overhead tricep extension (dumbbell)') >= 0);

ok('"tricep extension" narrows vs "tricep"',
  names('tricep extension').length < names('tricep').length);

console.log('\nsynonyms from the chat log\n');
ok('db -> dumbbell', idx('incline db', 'Incline dumbbell press') === 0);
ok('cabel -> cable', names('cabel').length > 0);

console.log('\nevery token must match\n');
ok('nonsense returns nothing', names('zzzz').length === 0);
ok('one bad token kills the match', names('tricep zzzz').length === 0);

console.log('\nempty query lists everything alphabetically\n');
ok('all returned', names('').length === SEED_EXERCISES.length);
ok('sorted', JSON.stringify(names('')) === JSON.stringify([...names('')].sort((a, b) => a.localeCompare(b))));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
