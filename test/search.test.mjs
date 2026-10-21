import { searchExercises, recentFrequency } from '../js/search.js';
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

console.log('\ncase never matters\n');
for (const q of ['tricep', 'incline db', 'z bar', 'plank']) {
  const want = names(q).join('|');
  ok(`"${q}" identical in every casing`,
     [q.toUpperCase(), q[0].toUpperCase() + q.slice(1), q.split('').map((c, i) => i % 2 ? c.toUpperCase() : c).join('')]
       .every((v) => names(v).join('|') === want));
}

// The four words that were dead in the live pool on 10/12/26. The old one-way
// synonym map REPLACED the typed word, so the exercise name never got searched.
const LIVE = [
  { id: 'a', name: 'Calf raises seated machine (pwg37)', muscles: [] },
  { id: 'b', name: 'Incline dumbbell bicep curls', muscles: [] },
  { id: 'c', name: '30 deg bent over dumbell shrugs for upper back', muscles: [] },
  { id: 'd', name: 'Single arm lat pulldown', muscles: [] },
  { id: 'e', name: 'Hammer curl', muscles: ['biceps', 'forearms'] },
  { id: 'f', name: 'Leg curl', muscles: ['hamstrings'] },
  { id: 'g', name: 'Lat pull down (new machine)', muscles: ['lats'] },
];
const ids = (q) => searchExercises(LIVE, q).map((e) => e.id);
const has = (q, id) => ids(q).includes(id);

console.log('\nthe typed word is always searched as typed\n');
ok('"calf" finds Calf raises (was rewritten to calves)',    has('calf', 'a'));
ok('"Calf" too — the case your phone keyboard sends',     has('Calf', 'a'));
ok('"bicep" finds bicep curls (was rewritten to biceps)',   has('bicep', 'b'));
ok('"dumbell" finds the dumbell shrugs (was rewritten)',    has('dumbell', 'c'));
ok('"pulldown" finds lat pulldown (became two words)',      has('pulldown', 'd'));

console.log('\nspelling variants are symmetric\n');
ok('calves -> Calf raises',     has('calves', 'a'));
ok('biceps -> bicep curls',     has('biceps', 'b'));
ok('dumbbell -> dumbell shrugs', has('dumbbell', 'c'));
ok('db -> dumbbell names',      has('db', 'b'));
ok('"pull down" -> pulldown',   has('pull down', 'd'));
ok('pulldown -> "pull down"',   has('pulldown', 'g'));

console.log('\nbroadening must not create stray matches\n');
// expansions match whole words only, or "hamstrings" -> "ham" -> "hammer"
ok('hamstrings does NOT surface Hammer curl', !has('hamstrings', 'e'));
ok('hamstrings still finds Leg curl',          has('hamstrings', 'f'));
ok('typed "ham" still prefix-matches Hammer',  has('ham', 'e'));
// muscle matching is word-prefix, or "tri" hits the middle of "hamstrings"
ok('tricep does NOT surface Leg curl',  !has('tricep', 'f'));
ok('tri does NOT surface Leg curl',     !has('tri', 'f'));

// Ranking (10/21/26): a NAME match beats a muscle-only match, then the
// exercises trained on more days in the last 2 weeks come first.
const POOL = [
  { id: 'bench',  name: 'Flat bench press',         muscles: ['chest', 'triceps'] },
  { id: 'fly',    name: 'Pec fly machine',          muscles: ['chest'] },
  { id: 'csrow',  name: 'Chest supported row',      muscles: ['upper back', 'lats'] },
  { id: 'cdip',   name: 'Chest dips',               muscles: ['chest', 'triceps'] },
  { id: 'latpd',  name: 'Lat pull down',            muscles: ['lats'] },
  { id: 'latrse', name: 'Lateral raise',            muscles: ['side delts'] },
  { id: 'row',    name: 'Seated cable row',         muscles: ['lats', 'upper back'] },
];
const rank = (q, freq) => searchExercises(POOL, q, { frequency: freq ? new Map(Object.entries(freq)) : null }).map((e) => e.id);
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(a) < list.indexOf(b);

console.log('\nname matches come before muscle-only matches\n');
const chest = rank('chest');
ok('"chest": Chest supported row above Flat bench press', before(chest, 'csrow', 'bench'), chest.join(','));
ok('"chest": Chest dips above Pec fly machine',           before(chest, 'cdip', 'fly'), chest.join(','));
ok('"chest": muscle-only matches still listed',           chest.includes('bench') && chest.includes('fly'));
const lat = rank('lat');
ok('"lat": exact word "Lat" above prefix "Lateral"',      before(lat, 'latpd', 'latrse'), lat.join(','));
ok('"lat": prefix "Lateral" above muscle-only rows',      before(lat, 'latrse', 'row'), lat.join(','));

console.log('\nrecent use breaks ties, never crosses a match level\n');
const busy = rank('chest', { bench: 9, fly: 2 });
ok('heavy use does NOT lift a muscle match over a name match', before(busy, 'cdip', 'bench') && before(busy, 'csrow', 'bench'), busy.join(','));
ok('within muscle-only matches, more-used first',             before(busy, 'bench', 'fly'), busy.join(','));
const dips = rank('chest', { cdip: 3 });
ok('within name matches, more-used first',                    before(dips, 'cdip', 'csrow'), dips.join(','));

console.log('\nempty query: most-used first, then A-Z\n');
const empty = rank('', { row: 5, fly: 2 });
ok('most-used on top',        empty[0] === 'row' && empty[1] === 'fly', empty.join(','));
ok('rest A-Z after them',     empty[2] === 'cdip' && empty[3] === 'csrow', empty.join(','));
ok('no frequency -> plain A-Z', rank('')[0] === 'cdip');

console.log('\nrecentFrequency counts days, not sets\n');
const SETS = [
  { exerciseId: 'x', date: '2026-10-21' }, { exerciseId: 'x', date: '2026-10-21' }, { exerciseId: 'x', date: '2026-10-21' },
  { exerciseId: 'x', date: '2026-10-08' },                       // 13 days back: day 14 of the window
  { exerciseId: 'x', date: '2026-10-07' },                       // 14 days back: outside
  { exerciseId: 'y', date: '2026-10-15', profileId: 'p1' },
  { exerciseId: 'y', date: '2026-10-15', profileId: 'p2' },      // same day, other person: still one day
  { exerciseId: 'y', date: '2026-10-16', profileId: 'p2' },
  { exerciseId: 'z', date: '2026-10-22' },                       // future (bad clock): ignored
];
const f = recentFrequency(SETS, { today: '2026-10-21' });
ok('three sets on one day = 1 day, window is 14 days incl. today', f.get('x') === 2, String(f.get('x')));
ok('both people together, distinct days',                         f.get('y') === 2, String(f.get('y')));
ok('future dates ignored',                                        !f.has('z'));
ok('crosses a month boundary', recentFrequency([{ exerciseId: 'm', date: '2026-09-30' }], { today: '2026-10-05' }).get('m') === 1);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
