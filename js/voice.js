// Voice logging: turns what was heard into set fields. The browser does the
// speech-to-text (js/speech.js); this is the understanding part, pure and
// tested in test/voice.test.mjs. Spec: docs/voice-logging-spec.md.
//
//   "60 lbs for 10 reps then 30 lbs for 12 reps add comment slow and heavy"
//     -> 60 lb × 10, drop 30 lb × 12, comment "Slow and heavy"
//
// It never guesses: words it cannot place come back in `unparsed`.

import { QUICK_NOTES } from './notes.js';

const ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const UNIT = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', kilogramme: 'kg',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  pin: 'block', pins: 'block', block: 'block', blocks: 'block', plate: 'block', plates: 'block',
};
// Mishearings seen in real use go here (the voice log collects them): "reps"
// comes back as "ribs" in a gym.
const REPS = new Set(['rep', 'reps', 'repetition', 'repetitions', 'times', 'ribs', 'rips', 'raps', 'wraps']);
const HALVES = new Set(['half', 'halves', 'partial', 'partials']);
const SECS = new Set(['s', 'sec', 'secs', 'second', 'seconds']);
const MINS = new Set(['min', 'mins', 'minute', 'minutes']);
const FILLER = new Set(['and', 'plus', 'with', 'at', 'of', 'the', 'a', 'an', 'um', 'uh', 'er', 'set', 'did', 'i', 'got',
  'just', 'like', 'okay', 'ok', 'so', 'then', 'that', 'was', 'it', 'on', 'up', 'down', 'about']);

// Spoken forms of the quick-note chips, and the support levels.
const NOTE_PHRASES = [
  [/\bultra slow( reps)?\b/, 'Ultra slow reps'],
  [/\bslow eccentrics?\b/, 'Slow eccentric'],
  [/\bgood form\b/, 'Good form'],
  [/\bhelp on the way up\b/, 'Help on the way up'],
  [/\blast (two|2) (supped|supported|spotted)\b/, 'Last 2 supped'],
  [/\bstruggled( (on )?(the )?last reps)?\b/, 'Struggled last reps'],
  [/\bwrist pain\b/, 'Wrist pain'],
].filter(([, n]) => QUICK_NOTES.includes(n));
const SUPPORT_PHRASES = [
  [/\b(to failure|failure|failed)\b/, 'failure'],
  [/\b(light help|little help|a bit of help|light spot|light support)\b/, 'light'],
  [/\b(spotted|supported|supped|help|assisted)\b/, 'supported'],
];

/** Lowercase words, digits kept whole ("62.5"), "60lbs" split into "60 lbs". */
export function words(text) {
  return String(text || '').toLowerCase()
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/[^a-z0-9.\s'-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/).filter(Boolean);
}

/**
 * Number words become numbers: "sixty two point five" -> 62.5, "one hundred
 * and five" -> 105. "for" and "to" stay words: as markers ("for 10 reps",
 * "drop to 5") they matter more than as the numbers 4 and 2, and recognisers
 * write those as digits anyway.
 */
export function numberize(ws) {
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (/^\d+(\.\d+)?$/.test(w)) {
      let n = parseFloat(w);
      if (ws[i + 1] === 'point' && /^\d+$/.test(ws[i + 2] || '')) { n = parseFloat(`${Math.trunc(n)}.${ws[i + 2]}`); i += 2; }
      out.push(n); continue;
    }
    if (!(w in ONES) && !(w in TENS) && w !== 'hundred') { out.push(w); continue; }
    let j = i;
    // "sixty two", "twelve", "five": one to ninety-nine
    const small = () => {
      if (ws[j] in TENS) {
        let v = TENS[ws[j]]; j++;
        if (ONES[ws[j]] > 0 && ONES[ws[j]] < 10) { v += ONES[ws[j]]; j++; }
        return v;
      }
      if (ws[j] in ONES) return ONES[ws[j++]];
      return null;
    };
    let n = small();
    if (ws[j] === 'hundred') {
      n = (n ?? 1) * 100; j++;
      const back = j;
      if (ws[j] === 'and') j++;
      const rest = small();
      if (rest == null) j = back; else n += rest;
    }
    if (ws[j] === 'point' && (ws[j + 1] in ONES || /^\d+$/.test(ws[j + 1] || ''))) {
      const d = ws[j + 1] in ONES ? ONES[ws[j + 1]] : ws[j + 1];
      n = parseFloat(`${n}.${d}`); j += 2;
    }
    out.push(n);
    i = j - 1;
  }
  return out;
}

/** Pull known phrases out of a string; returns [rest, found values]. */
function take(str, table) {
  const found = [];
  for (const [re, val] of table) {
    if (re.test(str)) { found.push(val); str = str.replace(new RegExp(re.source, 'g'), ' '); }
  }
  return [str, found];
}

/** One part: the set, or one drop. */
function readPart(text, { timed, bodyweight }) {
  const r = { unparsed: [] };
  const ws = numberize(words(text));
  const isNum = (x) => typeof x === 'number';
  let repsEnd = -2;   // where the reps phrase ended, for "12 reps each side"

  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], next = ws[i + 1], prev = ws[i - 1];

    // "each side" / "per side": reps per side right after the reps, else weight per side
    if ((w === 'each' || w === 'per') && (next === 'side' || next === 'sides')) {
      if (repsEnd === i - 1) r.unilateral = true; else r.perSide = true;
      i++; continue;
    }
    if (isNum(w)) {
      // "twelve and a half kilos" is a weight; "and a half" after reps is a half rep
      if (next === 'and' && ws[i + 2] === 'a' && HALVES.has(ws[i + 3]) && UNIT[ws[i + 4]]) {
        r.weight = w + 0.5; r.unit = UNIT[ws[i + 4]]; i += 4; continue;
      }
      if (UNIT[next] && r.weight == null) { r.weight = w; r.unit = UNIT[next]; i++; continue; }
      if (UNIT[prev] && r.weight == null) { r.weight = w; r.unit = UNIT[prev]; continue; }
      if (HALVES.has(next)) { r.halfReps = (r.halfReps || 0) + w; i += REPS.has(ws[i + 2]) ? 2 : 1; continue; }
      if (SECS.has(next)) { r.seconds = (r.seconds || 0) + w; i++; continue; }
      if (MINS.has(next)) { r.seconds = (r.seconds || 0) + w * 60; i++; continue; }
      if (r.reps == null && (REPS.has(next) || ['for', 'x', 'by'].includes(prev))) {
        r.reps = w; if (REPS.has(next)) i++; repsEnd = i; continue;
      }
      if (timed) { r.seconds = (r.seconds || 0) + w; continue; }
      if (!bodyweight && r.weight == null) { r.weight = w; continue; }
      if (r.reps == null) { r.reps = w; repsEnd = i; continue; }
      r.unparsed.push(String(w));
      continue;
    }
    if (w === 'a' && MINS.has(next)) { r.seconds = (r.seconds || 0) + 60; i++; continue; }
    if (w === 'and' && next === 'a' && HALVES.has(ws[i + 2])) { r.halfReps = (r.halfReps || 0) + 1; i += 2; continue; }
    if (UNIT[w] || REPS.has(w) || HALVES.has(w) || ['for', 'x', 'by', 'to'].includes(w) || FILLER.has(w)) continue;
    r.unparsed.push(w);
  }
  return r;
}

/**
 * @param text  what the recogniser heard
 * @param opts.timed       a timed exercise: bare numbers are seconds
 * @param opts.bodyweight  no load: bare numbers are reps
 * @param opts.unit        the unit already in the form, for a weight said without one
 * @returns {
 *   set:   { weight?, unit?, reps?, halfReps?, seconds?, support?, warmup?, perSide?, unilateral? },
 *   drops: [{ weight, unit, reps, halfReps }],
 *   notes: quick-note phrases, comment: string | null,
 *   unparsed: words it could not place, warnings: strings
 * }
 */
export function parseUtterance(text, { timed = false, bodyweight = false, unit = null } = {}) {
  const raw = String(text || '').trim();
  const out = { set: {}, drops: [], notes: [], comment: null, unparsed: [], warnings: [] };
  if (!raw) return out;

  // 1. the comment: "add comment …", "comment …", "note …" is a command, and
  //    everything after it is the comment, as heard
  let body = raw;
  const cm = /\b(?:add\s+(?:a\s+)?)?(?:comment|note)\b[\s:,.-]*/i.exec(raw);
  if (cm) {
    const c = raw.slice(cm.index + cm[0].length).trim().replace(/[.\s]+$/, '');
    if (c) out.comment = c[0].toUpperCase() + c.slice(1);
    body = raw.slice(0, cm.index);
  }

  // 2. phrases that are not numbers: support, warm-up, quick notes
  let low = ' ' + body.toLowerCase() + ' ';
  let found;
  [low, found] = take(low, NOTE_PHRASES); out.notes = found;
  [low, found] = take(low, SUPPORT_PHRASES); if (found.length) out.set.support = found[0];
  if (/\bwarm(ing)?[\s-]?up\b/.test(low)) { out.set.warmup = true; low = low.replace(/\bwarm(ing)?[\s-]?up\b/g, ' '); }

  // 3. the set, then its drops: "then", "drop set", "drop to", "dropped (to)"
  const parts = low.split(/\b(?:then|drop(?:ped)?(?:\s+set)?(?:\s+(?:down\s+)?to)?)\b/);
  const main = readPart(parts[0], { timed, bodyweight });
  for (const k of ['weight', 'unit', 'reps', 'halfReps', 'seconds', 'perSide', 'unilateral']) if (main[k] != null) out.set[k] = main[k];
  out.unparsed.push(...main.unparsed);
  if (out.set.weight != null && !out.set.unit && unit) out.set.unit = unit;

  const setUnit = out.set.unit || unit;
  for (const p of parts.slice(1)) {
    if (!p.trim()) continue;
    const d = readPart(p, { timed: false, bodyweight });
    out.unparsed.push(...d.unparsed);
    if (d.weight == null && d.reps == null) continue;
    if (out.drops.length === 3) { out.warnings.push('Only 3 drops: the rest were left out'); break; }
    const drop = { weight: d.weight ?? 0, unit: d.unit || setUnit || 'kg', reps: d.reps ?? 0, halfReps: d.halfReps || 0 };
    if (out.set.weight != null && drop.weight > out.set.weight && drop.unit === (out.set.unit || setUnit)) {
      out.warnings.push(`Drop ${out.drops.length + 1} is heavier than the set`);
      drop.heavier = true;
    }
    out.drops.push(drop);
  }
  return out;
}

/** The fields a set form ends up with, in one comparable shape (for the voice log). */
export function setSummary(x) {
  const out = {};
  for (const k of ['weight', 'unit', 'reps', 'halfReps', 'seconds', 'support', 'warmup', 'perSide', 'unilateral', 'comment']) {
    if (x[k] !== undefined && x[k] !== null && x[k] !== '') out[k] = x[k];
  }
  out.drops = (x.drops || []).map(({ weight, unit, reps, halfReps }) => ({ weight, unit, reps, halfReps: halfReps || 0 }));
  return out;
}

/**
 * What the person changed after voice filled the form: the voice log's main
 * signal for finding mishearings ("ribs" for "reps").
 *   corrected: fields voice filled that were saved differently   { reps: [12, 10] }
 *   missed:    fields voice left alone that were saved with a value
 */
export function voiceDiff(parsed, saved) {
  const corrected = {}, missed = [];
  const heard = { ...parsed.set };
  const blank = { weight: 0, reps: 0, halfReps: 0, seconds: 0, support: 'none', warmup: false, perSide: false, unilateral: false };
  // flags come pre-set from the exercise or the suggestion, so they are only
  // "missed" if never set at all; for them, only corrections count
  const ownValue = new Set(['weight', 'reps', 'halfReps', 'seconds', 'support']);
  for (const k of Object.keys(blank)) {
    const h = heard[k], s = saved[k] ?? blank[k];
    if (h !== undefined && h !== s) corrected[k] = [h, s];
    if (h === undefined && s !== blank[k] && ownValue.has(k)) missed.push(k);
  }
  if (heard.unit !== undefined && saved.unit !== heard.unit) corrected.unit = [heard.unit, saved.unit];
  const hd = parsed.drops.length, sd = (saved.drops || []).length;
  if (hd !== sd) corrected.drops = [hd, sd];
  if (parsed.comment && !(saved.comment || '').includes(parsed.comment)) corrected.comment = [parsed.comment, saved.comment || ''];
  return { corrected, missed };
}
