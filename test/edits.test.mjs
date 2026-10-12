import { EDITABLE, PROTECTED, draftFromSet, editPatch, changedFields } from '../js/edits.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};

// The real 09/21/26 mistake: 75 lb dumbbells logged as kg.
const wrong = {
  id: 's1', profileId: 'p1', exerciseId: 'e1', date: '2026-09-21',
  loggedAt: 1758450000000, createdAt: { seconds: 1758450001 },
  enteredBy: 'Prabhashwara', deviceId: 'd-fchpspkzb0ya',
  metric: 'reps', bodyweight: false,
  weight: 75, unit: 'kg', reps: 14, halfReps: 0, perSide: false, unilateral: false,
  support: 'none', warmup: false, comment: 'good form', drops: [],
};

console.log('\nan edit never touches what the set IS\n');
const draft = draftFromSet(wrong);
draft.unit = 'lb';                       // the fix
const patch = editPatch({ ...draft, ...wrong, unit: 'lb' }, { by: 'Prabhashwara', deviceId: 'd-x', now: 1760000000000 });
for (const k of PROTECTED) eq(`"${k}" is not in the patch`, k in patch, false);
eq('loggedAt survives, so the set does not glow as fresh or move in time', 'loggedAt' in patch, false);

console.log('\nwhat an edit does carry\n');
eq('the corrected unit', patch.unit, 'lb');
eq('the number is unchanged — fixing a unit is not a conversion', patch.weight, 75);
eq('who edited', patch.editedBy, 'Prabhashwara');
eq('when', patch.editedAt, 1760000000000);
eq('on which phone', patch.editedDeviceId, 'd-x');
eq('only editable fields plus edit metadata',
   Object.keys(patch).filter((k) => !EDITABLE.includes(k)).sort(), ['editedAt', 'editedBy', 'editedDeviceId']);

console.log('\ndrops are copied, not shared\n');
const withDrop = { ...wrong, drops: [{ weight: 50, unit: 'kg', reps: 6 }] };
const d2 = draftFromSet(withDrop);
d2.drops[0].weight = 99;
eq('editing the draft leaves the original drop alone', withDrop.drops[0].weight, 50);
const p2 = editPatch(d2);
p2.drops[0].reps = 1;
eq('mutating the patch leaves the draft alone', d2.drops[0].reps, 6);

console.log('\nchangedFields — a Save with no change writes nothing\n');
eq('unchanged form -> nothing to save', changedFields(wrong, editPatch(draftFromSet(wrong))), []);
eq('unit fixed -> exactly unit', changedFields(wrong, editPatch({ ...draftFromSet(wrong), unit: 'lb' })), ['unit']);
eq('comment edited', changedFields(wrong, editPatch({ ...draftFromSet(wrong), comment: 'actually lb' })), ['comment']);
eq('a drop added', changedFields(wrong, editPatch({ ...draftFromSet(wrong), drops: [{ weight: 50, unit: 'lb', reps: 6 }] })), ['drops']);

// Sets logged before a field existed simply lack it; that is not a change.
const old = { ...wrong }; delete old.halfReps; delete old.support; delete old.seconds; delete old.drops;
eq('missing fields on an old set do not count as changes', changedFields(old, editPatch(draftFromSet(old))), []);

console.log('\ndraftFromSet fills gaps on old sets\n');
const sparse = draftFromSet({ weight: 5, unit: 'block', reps: 12 });
eq('defaults', [sparse.support, sparse.halfReps, sparse.comment, sparse.drops, sparse.metric],
   ['none', 0, '', [], 'reps']);
eq('timed set stays timed', draftFromSet({ metric: 'time', seconds: 60 }).metric, 'time');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
