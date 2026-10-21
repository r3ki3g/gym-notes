// Personal records: which sets beat everything before them. Worked out from
// the data on every render, never stored, so edits and deletes stay right.
// Pure, tested in test/pr.test.mjs. Spec: docs/pro-features-spec.md.

import { convert, chartUnit, suspectIds } from './progress.js';
import { byTime, timeOf } from './rest.js';
import { isTimed } from './units.js';

/** Sets this new are celebrated as they arrive; older ones only get the tag. */
export const CELEBRATE_WITHIN_MS = 2 * 60_000;

const repsOf = (s) => (s.reps || 0) + (s.halfReps || 0) * 0.5;

/**
 * PRs for ONE person on ONE exercise.
 *
 * A working set (warm-ups excluded) is a PR when it beats every earlier set:
 *   weight — heavier than ever (lb converted to kg, blocks with blocks)
 *   reps   — at a weight done before: more reps than ever at it or heavier
 *   time   — the longest hold, for timed exercises
 * A tie is not a PR, and nothing on the first day counts: there was nothing to
 * beat. Sets that look logged in the wrong unit are left out entirely. Sets are
 * only compared with sets counted the same way (per side, each side).
 *
 * @returns Map setId -> 'weight' | 'reps' | 'time'
 */
export function findPRs(sets) {
  const working = sets.filter((s) => !s.warmup).sort(byTime);
  const out = new Map();
  if (!working.length) return out;

  const skip = suspectIds(working);
  const { unit } = chartUnit(working);
  const firstDay = working.reduce((d, s) => (s.date < d ? s.date : d), working[0].date);
  const history = new Map();   // "perSide|unilateral" -> earlier [{ load, reps, secs }]

  for (const s of working) {
    if (skip.has(s.id)) continue;
    const key = `${!!s.perSide}|${!!s.unilateral}`;
    const earlier = history.get(key) || [];
    let entry;

    if (isTimed(s)) {
      if (!(s.seconds > 0)) continue;
      entry = { secs: s.seconds };
      if (s.date !== firstDay && earlier.length && s.seconds > Math.max(...earlier.map((e) => e.secs ?? 0))) out.set(s.id, 'time');
    } else {
      const load = s.bodyweight ? 0 : convert(s.weight || 0, s.unit, unit);
      const reps = repsOf(s);
      if (load == null || reps <= 0) continue;
      entry = { load, reps };
      const loads = earlier.filter((e) => e.load != null);
      if (s.date !== firstDay && loads.length) {
        const heaviest = Math.max(...loads.map((e) => e.load));
        if (load > heaviest + 1e-9) out.set(s.id, 'weight');
        else if (loads.some((e) => Math.abs(e.load - load) < 1e-9)) {
          // a weight done before: beat the best reps at it and at anything heavier.
          // A first visit to a lighter weight (a back-off set, a slow-tempo set)
          // is not a record, however many reps it gets.
          const atOrAbove = loads.filter((e) => e.load >= load - 1e-9).map((e) => e.reps);
          if (reps > Math.max(...atOrAbove)) out.set(s.id, 'reps');
        }
      }
    }
    earlier.push(entry);
    history.set(key, earlier);
  }
  return out;
}

/** findPRs for everyone and every exercise at once: Map setId -> kind. */
export function allPRs(sets) {
  const groups = new Map();
  for (const s of sets) {
    const k = s.profileId + '|' + s.exerciseId;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const out = new Map();
  for (const g of groups.values()) for (const [id, kind] of findPRs(g)) out.set(id, kind);
  return out;
}

/** PRs that just appeared and are recent enough to celebrate. */
export function newPRs(before, after, setsById, now) {
  const out = [];
  for (const id of after.keys()) {
    if (before.has(id)) continue;
    const t = timeOf(setsById.get(id));
    if (t != null && now - t <= CELEBRATE_WITHIN_MS) out.push(id);
  }
  return out;
}
