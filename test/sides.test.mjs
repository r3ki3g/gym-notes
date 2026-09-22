import { layoutSides, resolveTarget, lastSessionFor } from '../js/sides.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};

const PRA  = { id: 'p1', name: 'Prabhashwara' };
const CHA  = { id: 'p2', name: 'Chamuth' };
const TEST = { id: 'p3', name: 'Test' };
const ALL  = [PRA, CHA, TEST];

console.log('\nlayoutSides — LEFT is always the device owner\n');

eq('left is owner, right defaults to first other',
  (() => { const r = layoutSides({ profiles: ALL, owner: 'Prabhashwara' });
           return [r.mode, r.left.name, r.right.name]; })(),
  ['dual', 'Prabhashwara', 'Chamuth']);

eq('picking Test moves Test RIGHT and leaves left alone',
  (() => { const r = layoutSides({ profiles: ALL, owner: 'Prabhashwara', rightId: 'p3' });
           return [r.left.name, r.right.name]; })(),
  ['Prabhashwara', 'Test']);

eq('picking Chamuth does NOT put Chamuth on the left',
  (() => { const r = layoutSides({ profiles: ALL, owner: 'Prabhashwara', rightId: 'p2' });
           return [r.left.name, r.right.name]; })(),
  ['Prabhashwara', 'Chamuth']);

eq('owner never appears in the right-hand options',
  layoutSides({ profiles: ALL, owner: 'Prabhashwara' }).options.map((p) => p.name),
  ['Chamuth', 'Test']);

eq('Chamuth on this phone -> Chamuth left, Prabhashwara selectable',
  (() => { const r = layoutSides({ profiles: ALL, owner: 'Chamuth' });
           return [r.left.name, r.options.map((p) => p.name)]; })(),
  ['Chamuth', ['Prabhashwara', 'Test']]);

eq('stale rightId falls back instead of breaking',
  layoutSides({ profiles: ALL, owner: 'Prabhashwara', rightId: 'deleted' }).right.name,
  'Chamuth');

eq('rightId pointing at the owner falls back (cannot face yourself)',
  layoutSides({ profiles: ALL, owner: 'Prabhashwara', rightId: 'p1' }).right.name,
  'Chamuth');

eq('one profile -> single column, no picker',
  (() => { const r = layoutSides({ profiles: [PRA], owner: 'Prabhashwara' });
           return [r.mode, r.left.name, r.right, r.options.length]; })(),
  ['single', 'Prabhashwara', null, 0]);

eq('two profiles -> dual, exactly one option',
  (() => { const r = layoutSides({ profiles: [PRA, CHA], owner: 'Prabhashwara' });
           return [r.mode, r.left.name, r.right.name, r.options.length]; })(),
  ['dual', 'Prabhashwara', 'Chamuth', 1]);

eq('unknown owner still yields a usable screen',
  (() => { const r = layoutSides({ profiles: ALL, owner: 'Nobody' });
           return [r.mode, r.left.name]; })(),
  ['dual', 'Prabhashwara']);

eq('no profiles -> nothing, no crash',
  layoutSides({ profiles: [], owner: 'Prabhashwara' }).mode, 'none');

eq('no owner set -> first profile left',
  layoutSides({ profiles: ALL, owner: null }).left.name, 'Prabhashwara');

console.log('\nresolveTarget — the form logs for the URL profile, not the selected one\n');

eq('URL profile wins',            resolveTarget(ALL, 'p3', 'p1').name, 'Test');
eq('URL profile wins for Chamuth', resolveTarget(ALL, 'p2', 'p1').name, 'Chamuth');
eq('missing URL id -> fallback',  resolveTarget(ALL, null, 'p1').name, 'Prabhashwara');
eq('stale URL id -> fallback',    resolveTarget(ALL, 'gone', 'p1').name, 'Prabhashwara');
eq('neither resolves -> null',    resolveTarget(ALL, 'gone', 'also-gone'), null);

console.log('\nlastSessionFor — works for EITHER person, not just the active one\n');

const POOL = [
  { profileId: 'p1', exerciseId: 'e1', date: '2026-09-20', weight: 5, loggedAt: 2 },
  { profileId: 'p1', exerciseId: 'e1', date: '2026-09-20', weight: 4, loggedAt: 3 },
  { profileId: 'p1', exerciseId: 'e1', date: '2026-09-15', weight: 3, loggedAt: 1 },
  { profileId: 'p2', exerciseId: 'e1', date: '2026-09-21', weight: 7, loggedAt: 1 },
  { profileId: 'p2', exerciseId: 'e1', date: '2026-09-21', weight: 8, loggedAt: 2 },
  { profileId: 'p1', exerciseId: 'e2', date: '2026-09-21', weight: 9, loggedAt: 1 },
  { profileId: 'p1', exerciseId: 'e1', date: '2026-09-22', weight: 6, loggedAt: 1 },
];
const TODAY = '2026-09-22';

eq('Prabhashwara: most recent day BEFORE today',
  (() => { const r = lastSessionFor(POOL, { exerciseId: 'e1', profileId: 'p1', excludeDate: TODAY });
           return [r.date, r.sets.map((s) => s.weight)]; })(),
  ['2026-09-20', [5, 4]]);

eq('Chamuth: his own day, not Prabhashwara\'s',
  (() => { const r = lastSessionFor(POOL, { exerciseId: 'e1', profileId: 'p2', excludeDate: TODAY });
           return [r.date, r.sets.map((s) => s.weight)]; })(),
  ['2026-09-21', [7, 8]]);

eq('today is excluded even though it has sets',
  lastSessionFor(POOL, { exerciseId: 'e1', profileId: 'p1', excludeDate: TODAY }).date !== TODAY, true);

// e2 does have an earlier set, so the check is that it returns e2's numbers
// and none of e1's — not that it returns nothing.
eq('does not leak across exercises',
  (() => { const r = lastSessionFor(POOL, { exerciseId: 'e2', profileId: 'p1', excludeDate: TODAY });
           return [r.date, r.sets.map((x) => x.weight)]; })(),
  ['2026-09-21', [9]]);

eq('unknown exercise -> null',
  lastSessionFor(POOL, { exerciseId: 'nope', profileId: 'p1', excludeDate: TODAY }), null);

eq('no history -> null',
  lastSessionFor(POOL, { exerciseId: 'e1', profileId: 'nobody', excludeDate: TODAY }), null);

eq('empty pool -> null, no crash',
  lastSessionFor([], { exerciseId: 'e1', profileId: 'p1', excludeDate: TODAY }), null);

eq('sets come back in logging order',
  lastSessionFor(POOL, { exerciseId: 'e1', profileId: 'p2', excludeDate: TODAY }).sets.map((s) => s.loggedAt),
  [1, 2]);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
