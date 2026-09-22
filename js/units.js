// Units of measure.
//
// Three exist, and only two of them are comparable:
//   block — machine stack position (#5). The printed weights are worn off, so the
//           number means nothing outside that one machine. NOT convertible, ever.
//   kg / lb — real mass, freely convertible.
//
// Weight is stored per SET, not per exercise, so an exercise can accept both kg
// and lb (dumbbells) and every historical entry stays truthful if the default
// later changes.

export const UNITS = {
  block: { key:'block', label:'#',  name:'Blocks',     convertible:false },
  kg:    { key:'kg',    label:'kg', name:'Kilograms',  convertible:true, perKg:1 },
  lb:    { key:'lb',    label:'lb', name:'Pounds',     convertible:true, perKg:0.45359237 },
};

export const UNIT_KEYS = Object.keys(UNITS);

/**
 * Stepper increment per unit, taken from every weight in the WhatsApp export:
 *   blocks  -> all integers (#0 … #17)
 *   kg      -> all multiples of 2.5 (the one 17.4 is a typo for 17.5)
 *   lb      -> all multiples of 5, no exceptions
 * A flat step would be wrong for two of the three.
 */
export const STEPS = { block: 1, kg: 2.5, lb: 5 };
export const stepFor = (unit) => STEPS[unit] ?? 1;

/** Snap to the unit's grid so +/- never produces 17.4 from a typed 17.4. */
export function snapTo(value, unit) {
  const step = stepFor(unit);
  return Math.round(value / step) * step;
}
const LB_PER_KG = 1 / UNITS.lb.perKg; // 2.2046226218

export function toKg(value, unit) {
  const u = UNITS[unit];
  if (!u || !u.convertible) return null;
  return value * u.perKg;
}

export function toLb(value, unit) {
  const kg = toKg(value, unit);
  return kg === null ? null : kg * LB_PER_KG;
}

/**
 * Total load in kg for graphing, or null when the set can't be compared
 * (block-based machines). `perSide` doubles it — `15kg each side` on a Z-bar
 * is 30 kg of plates.
 *
 * Deliberately ignores bar/handle weight: we don't know it, and guessing would
 * make the numbers look precise while being wrong.
 */
export function normalizedKg(set) {
  const base = toKg(set.weight, set.unit);
  if (base === null) return null;
  return set.perSide ? base * 2 : base;
}

/**
 * How an exercise is counted. Stored on the SET as well as the exercise, for the
 * same reason `unit` is: flipping an exercise from reps to time later must not
 * rewrite what already happened.
 */
export const METRICS = {
  reps: { key: 'reps', label: 'Reps', noun: 'reps' },
  time: { key: 'time', label: 'Time', noun: 'seconds' },
};

/** Seconds step for the duration stepper — 1s would be unusable for a 90s plank. */
export const TIME_STEP = 5;

/** 45 -> "45s", 90 -> "1:30", 120 -> "2:00". */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const isTimed = (set) => set?.metric === 'time';

/** Total reps including halves, which count as 0.5. */
export function totalReps(set) {
  return (set.reps || 0) + (set.halfReps || 0) * 0.5;
}

const trim = (n) => (Math.round(n * 100) / 100).toString();

/** "17.5 kg", "#5", "15 kg/side" */
export function formatLoad(weight, unit, perSide) {
  const u = UNITS[unit];
  if (!u) return `${trim(weight)}`;
  const body = u.key === 'block' ? `#${trim(weight)}` : `${trim(weight)} ${u.label}`;
  return perSide ? `${body}/side` : body;
}

/** The load column for a set — "BW" when there is no external weight. */
export function formatSetLoad(set) {
  if (set.bodyweight) return 'BW';
  return formatLoad(set.weight, set.unit, set.perSide);
}

/** Whatever this set is counted in — reps or a duration. */
export function formatEffort(set) {
  return isTimed(set) ? formatDuration(set.seconds) : formatReps(set);
}

/** "12 + 1 half", "14 each side" — mirrors how the WhatsApp log reads. */
export function formatReps(set) {
  let s = `${set.reps}`;
  if (set.halfReps) s += ` + ${set.halfReps} half`;
  s += set.reps === 1 && !set.halfReps ? ' rep' : ' reps';
  if (set.unilateral) s += ' each side';
  return s;
}

/**
 * Total kg x reps for a set INCLUDING its drops, or null if any part of it is
 * block-based. "20kg for 10 THEN 12.5kg for 4" is one set doing 290 kg of work,
 * not 200 — dropping the tail would undercount every drop set in the log.
 *
 * Returns null rather than a partial figure when any component is a block
 * machine: half a number is worse than an honest gap.
 */
export function setVolumeKg(set) {
  // weight x seconds is not the same quantity as weight x reps, so a timed set
  // is excluded rather than silently summed into a kg total. Bodyweight sets
  // have no external load at all, so they are excluded too — counting them as
  // zero would quietly drag a session's average down.
  if (isTimed(set) || set.bodyweight) return null;

  const main = normalizedKg(set);
  if (main === null) return null;

  let volume = main * totalReps(set);
  for (const d of set.drops || []) {
    const kg = toKg(d.weight, d.unit);
    if (kg === null) return null;
    const load = set.perSide ? kg * 2 : kg;
    volume += load * ((d.reps || 0) + (d.halfReps || 0) * 0.5);
  }
  return volume;
}

export const SUPPORT = {
  none:     { key:'none',     label:'No sup',  cls:'sup-none'  },
  light:    { key:'light',    label:'Light',   cls:'sup-light' },
  supported:{ key:'supported',label:'Supped',  cls:'sup-heavy' },
  failure:  { key:'failure',  label:'Failure', cls:'sup-heavy' },
};
