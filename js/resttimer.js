// Live rest timer: the count-up under a person's last set while they rest.
//
// Closer to true rest than the "Rest:" rows between sets: a set is logged when
// it ends, so this starts at the end of the set and has nothing else mixed in.
//
// Pure, tested in test/resttimer.test.mjs. Spec: docs/rest-timer-spec.md.

import { timeOf } from './rest.js';

/** Rest limit, in seconds: Settings → Rest timer. */
export const LIMIT_DEFAULT = 300;
export const LIMIT_MIN = 60;
export const LIMIT_MAX = 600;
export const LIMIT_STEP = 30;

/** Past this they have stopped training, not resting: the timer goes. */
export const LIVE_MAX_MS = 30 * 60_000;

/**
 * The buzz fires only within this long after the limit passes. Opening the app
 * ten minutes late should show red, not buzz about something long gone.
 */
export const BUZZ_WINDOW_MS = 60_000;

/** A stored limit, or the default when missing or junk; always on a step. */
export function parseLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return LIMIT_DEFAULT;
  return Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.round(n / LIMIT_STEP) * LIMIT_STEP));
}

/** One press of − or + on the limit. */
export const stepLimit = (sec, dir) => parseLimit(sec + dir * LIMIT_STEP);

/**
 * The set a person is resting after: their latest set today on ANY exercise.
 * Null when they have none today, or it was over LIVE_MAX_MS ago.
 *
 * Any exercise, so moving on stops the old exercise's timer. A partner's phone
 * a few seconds ahead would give a negative time, which reads as 0:00.
 *
 * @returns { set, since, elapsed } or null
 */
export function restingAfter(sets, { profileId, today, now }) {
  let last = null, since = -Infinity;
  for (const s of sets) {
    if (s.profileId !== profileId || s.date !== today) continue;
    const t = timeOf(s);
    if (t != null && t > since) { last = s; since = t; }
  }
  if (!last) return null;
  const elapsed = Math.max(0, now - since);
  return elapsed > LIVE_MAX_MS ? null : { set: last, since, elapsed };
}

/** 0 until half the limit, rising to 1 at the limit. */
export function restHeat(elapsedMs, limitSec) {
  const r = elapsedMs / (limitSec * 1000);
  return Math.min(1, Math.max(0, (r - 0.5) / 0.5));
}

// The app's own --faint, --gold and --bad, so the timer shades through colours
// that already mean "quiet", "attention" and "problem" everywhere else.
const GREY  = [0x8d, 0x82, 0xa3];
const AMBER = [0xf0, 0xb4, 0x29];
const RED   = [0xf8, 0x71, 0x71];

const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const hex = (rgb) => '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');

/** Grey at 0, amber at 0.5, red at 1. */
export function heatColor(heat) {
  const h = Math.min(1, Math.max(0, heat));
  return hex(h <= 0.5 ? mix(GREY, AMBER, h * 2) : mix(AMBER, RED, (h - 0.5) * 2));
}

/** True during the minute after the limit passes. */
export function shouldBuzz(elapsedMs, limitSec) {
  const over = elapsedMs - limitSec * 1000;
  return over >= 0 && over < BUZZ_WINDOW_MS;
}
