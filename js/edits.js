// Editing an existing set: what may change, and what must never be touched.
//
// Pure, so the rule is tested — see test/edits.test.mjs. The danger it guards
// against is quiet: if an edit rewrote `loggedAt`, correcting a set from last
// month would make it glow as freshly logged, reorder it within its day, and
// corrupt any rest timing built on it. So an edit changes the NUMBERS only, and
// records who changed them alongside.

/** The fields an edit may change — the numbers and notes of the set. */
export const EDITABLE = [
  'weight', 'unit', 'perSide', 'unilateral',
  'reps', 'halfReps', 'seconds',
  'support', 'warmup', 'comment', 'drops',
];

/**
 * Never written by an edit. Who the set belongs to, which exercise, which day,
 * when it was logged, who typed it on which phone, and how it is counted.
 * Moving a set to another person or day is a delete and re-add, not an edit.
 */
export const PROTECTED = [
  'profileId', 'exerciseId', 'date',
  'loggedAt', 'createdAt',
  'enteredBy', 'deviceId',
  'metric', 'bodyweight',
];

const copyDrops = (drops) => (drops || []).map((d) => ({ ...d }));

/** A form draft prefilled from an existing set. Drops are copied, not shared. */
export function draftFromSet(set) {
  return {
    weight: set.weight ?? 0,
    unit: set.unit || 'block',
    perSide: !!set.perSide,
    unilateral: !!set.unilateral,
    metric: set.metric === 'time' ? 'time' : 'reps',
    bodyweight: !!set.bodyweight,
    reps: set.reps ?? 0,
    halfReps: set.halfReps ?? 0,
    seconds: set.seconds ?? 0,
    support: set.support || 'none',
    warmup: !!set.warmup,
    comment: set.comment || '',
    drops: copyDrops(set.drops),
  };
}

/**
 * The update to send: editable fields only, plus who edited and when. Anything
 * protected is dropped even if the form happens to carry it.
 */
export function editPatch(form, { by = null, deviceId = null, now = Date.now() } = {}) {
  const patch = {};
  for (const k of EDITABLE) if (k in form) patch[k] = k === 'drops' ? copyDrops(form.drops) : form[k];
  patch.editedAt = now;
  patch.editedBy = by;
  patch.editedDeviceId = deviceId;
  return patch;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Editable fields whose value differs. Empty means nothing to save — so a
 * Save tapped with no change writes nothing and stamps no `editedAt`.
 */
export function changedFields(original, patch) {
  return EDITABLE.filter((k) => k in patch && !same(original[k] ?? defaults[k], patch[k]));
}

// What a field means when an older set simply never stored it.
const defaults = {
  perSide: false, unilateral: false, halfReps: 0, seconds: 0,
  support: 'none', warmup: false, comment: '', drops: [],
};
