// Smart next set: what to suggest in the add-set form. Settings → Pro features
// → Smart next set. Spec: docs/next-set-suggestion-spec.md, from 411 real sets
// (docs/research/next-set/). Pure, tested in test/nextset.test.mjs.
//
// What the data showed: the first set of a day starts where the person STARTED
// last time (not where they ended); later sets climb back up last session's
// ladder; after a hard set they repeat it; reps sit at 12 and move in 2s.

import { convert } from './progress.js';
import { STEPS, isTimed, formatLoad } from './units.js';
import { byTime } from './rest.js';

export const AIM_REPS = 12;
const SAME_KG = 0.75;   // lb and kg rounding: 25 lb vs 11.5 kg is "the same weight"

const note = (s) => s?.comment || '';
const TEMPO = /ultra slow|slow eccentric/i;
const PAIN = /([a-z]+\s)?(pain|hurt|tweak)/i;

export const isTempo = (s) => TEMPO.test(note(s));
export const painNote = (s) => { const m = PAIN.exec(note(s)); return m ? m[0].trim().toLowerCase() : null; };

/** Why a set counts as hard, or null: failure, help, partials, a drop, a struggle. */
export function hardWhy(s) {
  if (s.support === 'failure') return 'hit failure';
  if (s.support === 'supported' || s.support === 'light' || /supp|help on the way up/i.test(note(s))) return 'had help';
  if (s.halfReps > 0) return 'had partials';
  if ((s.drops || []).length) return 'was a drop set';
  if (/struggled/i.test(note(s))) return 'was a struggle';
  return null;
}

/** Reps that count toward going heavier: assisted reps do not. */
export function effReps(s) {
  const n = s.reps || 0;
  if (s.support === 'supported' || /last 2 supp/i.test(note(s))) return n - 2;
  if (s.support === 'light' || /help on the way up/i.test(note(s))) return n - 1;
  return n;
}

/** Reps move in 2s: 95.3% of their logged reps are even. Ties round up. */
export const evenReps = (n) => Math.max(2, 2 * Math.round(n / 2));

/** Comparable load: blocks as pin numbers, mass in kg. */
const load = (s) => (s.unit === 'block' ? s.weight || 0 : convert(s.weight || 0, s.unit, 'kg'));
const sameFamily = (a, b) => (a.unit === 'block') === (b.unit === 'block');
const tol = (s) => (s.unit === 'block' ? 1e-9 : SAME_KG);
const lighter = (a, b) => sameFamily(a, b) && load(a) < load(b) - tol(a);
const sameLoad = (a, b) => sameFamily(a, b) && Math.abs(load(a) - load(b)) <= tol(a);

/**
 * One step heavier is only offered when the person has earned it. At light
 * weights a step is a big jump (pin 7 to 8 is 14.3%, 20 to 25 lb is 25.0%), so
 * it needs more reps than usual first: the reps that would still reach 10
 * after the jump (methods-findings c1), and never fewer than 14.
 */
export function earnedStepUp(s) {
  const step = STEPS[s.unit] || 1;
  if (!(s.weight > 0)) return effReps(s) >= 14;
  const rel = step / s.weight;
  if (rel < 0.10) return effReps(s) >= AIM_REPS;
  return effReps(s) >= Math.max(14, Math.ceil((10 + 30) * (1 + rel) - 30));
}

const pick = (s, reps, extra = {}) => ({
  weight: s.weight, unit: s.unit, perSide: !!s.perSide, unilateral: !!s.unilateral,
  reps, warmup: false, ...extra,
});
const stepUp = (s) => ({ ...s, weight: Math.round((s.weight + (STEPS[s.unit] || 1)) * 100) / 100 });
const fmt = (s) => formatLoad(s.weight, s.unit, s.perSide);

/**
 * The suggestion for this person's next set on this exercise, or null to fall
 * back to "copy the last set" (timed holds, or nothing to go on).
 *
 * @param sets  every set the phone holds (any people, any exercises)
 * @returns {
 *   rule, reason, sessions,
 *   primary: { weight, unit, perSide, unilateral, reps, warmup },
 *   alt:     same shape plus `label`, or null
 * }
 */
export function suggestNext({ sets, profileId, exerciseId, today }) {
  const mine = sets.filter((s) => s.profileId === profileId && s.exerciseId === exerciseId).sort(byTime);
  if (!mine.length) return { rule: 7, reason: 'First time on this exercise', sessions: 0, primary: null, alt: null };
  if (mine.some(isTimed)) return null;

  const todays = mine.filter((s) => s.date === today);
  const past = mine.filter((s) => s.date < today);
  const lastDate = past.length ? past[past.length - 1].date : null;
  const lastSession = past.filter((s) => s.date === lastDate);
  const sessions = new Set(past.map((s) => s.date)).size;
  // last session's ladder: working sets, tempo sets left out (deliberately light)
  const ladder = lastSession.filter((s) => !s.warmup && !isTempo(s));
  const top = ladder.reduce((t, s) => (!t || lighter(t, s) ? s : t), null);
  const working = todays.filter((s) => !s.warmup);
  const prev = working[working.length - 1];

  const painToday = todays.map(painNote).find(Boolean);
  const painLast = lastSession.map(painNote).find(Boolean);
  const pain = painToday || painLast;
  const out = (rule, reason, primary, alt = null) => ({ rule, reason, sessions, primary, alt });

  /* ---- no working set yet today ---- */
  if (!prev) {
    const opener = ladder[0];
    const openerPick = opener && pick(opener, AIM_REPS);
    // 1. they warmed up last time: offer it again (69.6% repeat the habit)
    if (!todays.length && lastSession[0]?.warmup && opener) {
      const w = lastSession[0];
      return out(1, `Warmed up with ${fmt(w)} last time`,
        pick(w, w.reps || AIM_REPS, { warmup: true }),
        { ...openerPick, label: 'Skip warm-up' });
    }
    // 2. first working set: where they STARTED last time
    if (opener) {
      const second = ladder.find((s) => lighter(opener, s));
      return out(2, `Started at ${fmt(opener)} last time, so starting there again`, openerPick,
        second ? { ...pick(second, AIM_REPS), label: 'Last time\'s 2nd' } : null);
    }
    return null;   // no previous working session: nothing smart to say yet
  }

  /* ---- after a set today ---- */
  if (isTempo(prev)) return out('tempo', 'Same tempo set again', pick(prev, prev.reps));

  if (pain) {
    return out('pain', `Holding: ${pain} noted ${painToday ? 'today' : 'last time'}`, pick(prev, prev.reps));
  }

  // The way up, offered as the second option even before it is "earned": the
  // big-jump rule guards what is SUGGESTED first, not what can be tapped.
  // Backtest: one of the two options is right 64.9% of the time, 58.1% guarded.
  const nextFromLadder = ladder.filter((s) => lighter(prev, s)).sort((a, b) => load(a) - load(b))[0];
  const upOption = nextFromLadder ? pick(nextFromLadder, evenReps(Math.min(effReps(prev), AIM_REPS)))
    : pick(stepUp(prev), AIM_REPS);

  // 4. a hard set: same again
  const why = hardWhy(prev);
  if (why) {
    return out(4, `Repeating: last set ${why}`, pick(prev, prev.reps),
      upOption ? { ...upOption, label: 'Next weight up' } : null);
  }

  if (top) {
    // 3. below last time's top: climb back up the ladder
    if (lighter(prev, top)) {
      return out(3, `Climbing back to last time's ${fmt(nextFromLadder)}`, upOption,
        { ...pick(prev, prev.reps), label: 'Same weight' });
    }
    // 5. at or above last time's top: same again, +1 step as the option
    const at = sameLoad(prev, top);
    return out(5, at ? `At last time's top: same again, or one step up` : `Above last time's top: same again`,
      pick(prev, prev.reps),
      { ...pick(stepUp(prev), AIM_REPS), label: '+1 step' });
  }

  // 6. first session on this exercise
  if (earnedStepUp(prev)) {
    return out(6, `First session: ${prev.reps} clean reps, so one step up`, pick(stepUp(prev), AIM_REPS),
      { ...pick(prev, prev.reps), label: 'Same weight' });
  }
  return out(6, 'First session: same again', pick(prev, prev.reps));
}
