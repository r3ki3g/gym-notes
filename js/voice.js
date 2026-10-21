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
const REPS = new Set(['rep', 'reps', 'repetition', 'repetitions', 'times']);
// What "reps" comes back as in a gym (from the voice log, 10/21/26). Only read
// as reps straight after a number, so "grapes" in a sentence stays grapes.
const REP_ALIASES = new Set(['ribs', 'rips', 'raps', 'rapes', 'wraps', 'grapes', 'tips', 'apps', 'reds', 'rap', 'rep']);
const ORDINAL = new Set(['th', 'st', 'nd', 'rd']);
const SEPARATOR = /\b(?:then|drop(?:ped)?(?:\s+set)?(?:\s+(?:down\s+)?to)?)\b/;
const HALVES = new Set(['half', 'halves', 'partial', 'partials']);
const SECS = new Set(['s', 'sec', 'secs', 'second', 'seconds']);
const MINS = new Set(['min', 'mins', 'minute', 'minutes']);
const FILLER = new Set(['and', 'plus', 'with', 'at', 'of', 'the', 'a', 'an', 'um', 'uh', 'er', 'set', 'did', 'i', 'got',
  'just', 'like', 'okay', 'ok', 'so', 'then', 'that', 'was', 'it', 'on', 'up', 'down', 'about']);

const WARM = /\bwarm(?:ing)?[\s-]?ups?\b/;   // warm up, warm-up, warmup, warm ups, warming up
const COMMENT = /\b(?:add\s+(?:a\s+)?)?(?:comment|note)\b[\s:,.-]*/i;

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

/** A number starting at ws[i] (digits or words), and the index after it; null if none. */
function readNumber(ws, i) {
  const w = ws[i];
  if (/^\d+(\.\d+)?$/.test(w)) {
    if (ws[i + 1] === 'point' && /^\d+$/.test(ws[i + 2] || '')) return { value: parseFloat(`${Math.trunc(parseFloat(w))}.${ws[i + 2]}`), next: i + 3 };
    return { value: parseFloat(w), next: i + 1 };
  }
  if (!(w in ONES) && !(w in TENS) && w !== 'hundred') return null;
  // the longest run of words (a number is at most 7: "one hundred and twenty
  // two point five") that reads as a single number
  for (let j = Math.min(ws.length, i + 7); j > i; j--) {
    const n = numberize(ws.slice(i, j));
    if (n.length === 1 && typeof n[0] === 'number') return { value: n[0], next: j };
  }
  return null;
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

/**
 * Repairs the recogniser's habits inside one part (the set, or one drop),
 * only where the grammar makes the repair plausible (voice log, 10/21/26):
 *   "10 grapes"          -> 10 reps      a reps-like word right after a number
 *   "5 kg is"            -> 5 kg         "kgs" split into "kg is"
 *   "20th"               -> 20           an ordinal where a count belongs
 *   "5 kg 4 12"          -> 5 kg for 12  a "4" between a weight and the reps
 *   "5 kg 420 g"         -> 5 kg for 20  "for 20" run together, reps expected
 *   "5 kg for to enter"  -> 5 kg for 20  "twenty", reps expected
 *   "5 kg 20 g"          -> 20 reps      "g" (no grams here) where reps go
 * "Reps expected" means a weight with its unit has been said and no reps yet,
 * so a real 4 kg dumbbell, "for 4 reps" or a 420 lb leg press stay as they are.
 *
 * @param ws     numberize(words(part))
 * @param heard  what each of ws was heard as ("sixty two" for 62), for display
 * @returns { toks, items }  toks for the parser; items ({ text, changed, heard })
 *          for the "Understood" line
 */
export function repair(ws, heard = ws.map(String)) {
  const toks = [], items = [];
  let weight = false, reps = false;
  const num = (x) => typeof x === 'number';
  const put = (tok, h, text = String(tok)) => { toks.push(tok); items.push({ text, changed: h !== text, heard: h }); };
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], next = ws[i + 1], prev = toks[toks.length - 1], h = heard[i];
    const repsExpected = weight && !reps;
    if (num(w)) {
      // a new weight after a complete set: the next set, possibly without "then"
      if (UNIT[next] && weight && reps) reps = false;
      if (ORDINAL.has(next)) { put(w, `${h}${next}`); i++; if (weight) reps = true; continue; }
      if (repsExpected && w === 4 && num(next)) { put('for', h, 'for'); continue; }
      if (repsExpected && w >= 410 && w <= 460 && Number.isInteger(w) && (next === undefined || next === 'g' || REPS.has(next) || REP_ALIASES.has(next))) {
        put('for', h, 'for'); toks.push(w - 400); items.push({ text: String(w - 400), changed: true, heard: '' }); reps = true; continue;
      }
      put(w, h);
      const pinAhead = next === 'pin' && num(ws[i + 2]);   // "14 pin 5": 14 is not "14 pins"
      if ((UNIT[next] && !pinAhead) || UNIT[prev]) weight = true;   // "5 kg", "pin 5": a weight, not reps
      else if (weight) reps = true;
      continue;
    }
    if (UNIT[w]) {
      if (num(next) && weight && reps) reps = false;   // "… for 14 pin 5 for 10"
      if (next === 'is') { put(w, `${h} is`, w); i++; } else put(w, h);
      if (num(prev)) weight = true;
      continue;
    }
    if (repsExpected && w === 'to' && next === 'enter') { put(20, 'to enter', '20'); reps = true; i++; continue; }
    if (num(prev) && (REP_ALIASES.has(w) || (w === 'g' && weight))) { put('reps', h, 'reps'); reps = true; continue; }
    put(w, h);
  }
  return { toks, items };
}

/**
 * Where a set runs into the next without "then": once a set has its weight and
 * its reps, the next number with a unit ("13 kgs", "pin 5") starts a new one.
 *   "20 kgs for 20 reps 13 kgs for 20 15 lbs for 20" -> cuts before 13 and 15
 * @returns indexes in toks where a new set starts
 */
export function implicitCuts(toks) {
  const cuts = [];
  let weight = false, reps = false;
  const num = (x) => typeof x === 'number';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], next = toks[i + 1], prev = toks[i - 1];
    // "pin 5" binds the pin to the number after it: "14 pin 5" is 14, then pin 5
    const numUnit = num(t) && UNIT[next] && !(next === 'pin' && num(toks[i + 2]));
    // a unit right after its own number was skipped above, so a unit met here
    // with a number after it is "pin 5"
    const unitNum = UNIT[t] && num(next);
    if (numUnit || unitNum) {
      if (weight && reps) { cuts.push(i); reps = false; }
      weight = true; i++;   // past the unit, or the number after "pin"
      continue;
    }
    if (num(t) && weight && !HALVES.has(next)) reps = true;
  }
  return cuts;
}

/** An explicit part split further wherever a new set starts without "then". */
function splitSets(text) {
  const toks = repair(numberize(words(text))).toks;
  const out = [];
  let a = 0;
  for (const c of implicitCuts(toks)) { out.push(toks.slice(a, c)); a = c; }
  out.push(toks.slice(a));
  return out;
}

/** One part: the set, or one drop (repaired tokens). */
function readPart(ws, { timed, bodyweight }) {
  const r = { unparsed: [] };
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
  const cm = COMMENT.exec(raw);
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
  if (WARM.test(low)) { out.set.warmup = true; low = low.replace(new RegExp(WARM.source, 'g'), ' '); }

  // 3. the set, then its drops: "then", "drop set", "drop to", "dropped (to)"
  // explicit "then" / "drop to", and sets run together without them
  const parts = low.split(SEPARATOR).flatMap((p) => splitSets(p));
  const main = readPart(parts[0], { timed, bodyweight });
  for (const k of ['weight', 'unit', 'reps', 'halfReps', 'seconds', 'perSide', 'unilateral']) if (main[k] != null) out.set[k] = main[k];
  out.unparsed.push(...main.unparsed);
  if (out.set.weight != null && !out.set.unit && unit) out.set.unit = unit;

  const setUnit = out.set.unit || unit;
  for (const p of parts.slice(1)) {
    if (!p.length) continue;
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

// What each heard word is understood as, for the "Understood" line: spelling
// variants and known mishearings shown in their proper form.
const CANON = {
  kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', kilogramme: 'kg',
  lbs: 'lb', pound: 'lb', pounds: 'lb',
  pins: 'pin', block: 'pin', blocks: 'pin', plate: 'pin', plates: 'pin',
  rep: 'reps', repetition: 'reps', repetitions: 'reps', ribs: 'reps', rips: 'reps', raps: 'reps', wraps: 'reps',
  halves: 'half reps', partial: 'half reps', partials: 'half reps',
  supped: 'supported', spotted: 'supported', failed: 'failure', warmup: 'warm-up', warmups: 'warm-up',
};

/**
 * What was heard, rewritten as it was understood: number words as digits,
 * units and "reps" in one spelling, known mishearings corrected. Each piece
 * says whether it changed, so the corrections can be shown in green.
 *
 *   "sixty kilos for twelve ribs" ->
 *     60 (changed) · kg (changed) · for · 12 (changed) · reps (changed)
 *
 * @returns [{ text, changed, heard }]
 */
export function understand(text) {
  const raw = String(text || '');
  const cm = COMMENT.exec(raw);
  const body = (cm ? raw.slice(0, cm.index) : raw).toLowerCase();
  const out = [];
  // part by part, as the parser reads it, keeping "then" / "drop to" as said
  const pieces = body.split(new RegExp(`(${SEPARATOR.source})`));
  for (const piece of pieces) {
    if (!piece.trim()) continue;
    if (SEPARATOR.test(piece) && piece.trim() === piece.trim().match(SEPARATOR)?.[0]) {
      out.push({ text: piece.trim(), changed: false, heard: piece.trim() });
      continue;
    }
    const ws = words(piece);
    // number words first ("sixty two" -> 62), keeping what was heard
    const nums = [], heardNums = [];
    for (let i = 0; i < ws.length;) {
      const n = readNumber(ws, i);
      if (n) { nums.push(n.value); heardNums.push(ws.slice(i, n.next).join(' ')); i = n.next; }
      else { nums.push(ws[i]); heardNums.push(ws[i]); i++; }
    }
    const { toks, items } = repair(nums, heardNums);
    // where a new set started without "then", show the "then" it was read as
    for (const c of implicitCuts(toks).reverse()) items.splice(c, 0, { text: 'then', changed: true, heard: '' });
    for (const it of items) {
      // "warm up(s)", "warming up" as one term
      const c = CANON[it.text];
      out.push(c && !it.changed ? { text: c, changed: true, heard: it.heard } : it);
    }
  }
  // join "warm" + "up(s)" into warm-up
  for (let i = 0; i < out.length - 1; i++) {
    if ((out[i].text === 'warm' || out[i].text === 'warming') && /^ups?$/.test(out[i + 1].text)) {
      const heard = `${out[i].heard} ${out[i + 1].heard}`;
      out.splice(i, 2, { text: 'warm-up', changed: heard !== 'warm up', heard });
    }
  }
  if (cm) {
    out.push({ text: 'comment:', changed: false, heard: cm[0].trim() });
    const rest = raw.slice(cm.index + cm[0].length).trim();
    if (rest) out.push({ text: rest, changed: false, heard: rest });
  }
  return out;
}

/**
 * How complete a reading is: weight and reps for the set and each drop count;
 * words left over and warnings count against. Used to choose between Chrome's
 * answer and its alternatives.
 */
export function scoreParse(r) {
  let s = 0;
  if (r.set.weight != null) s += 5;
  if (r.set.reps != null || r.set.seconds != null) s += 5;
  for (const d of r.drops) { if (d.weight) s += 5; if (d.reps) s += 5; }
  return s - 2 * r.unparsed.length - r.warnings.length;
}

const reading = (r) => JSON.stringify([r.set.weight, r.set.unit, r.set.reps, r.drops.map((d) => [d.weight, d.reps])]);

/**
 * Chrome's final answer and its alternatives, each a whole guess at the
 * sentence: parse every one, keep the most complete reading. Readings two or
 * more guesses agree on get a bonus. When the runner-up says different numbers
 * and scores within 2, `doubt` carries it so it can be shown, not silently lost.
 *
 * @returns { text, index, r, doubt: { text, r } | null }
 */
export function pickBest(texts, opts) {
  const cands = texts.filter((t) => t && t.trim()).map((t, i) => ({ t, i, r: parseUtterance(t, opts) }));
  if (!cands.length) return { text: '', index: 0, r: parseUtterance('', opts), doubt: null };
  for (const c of cands) {
    c.score = scoreParse(c.r) + (cands.some((o) => o !== c && reading(o.r) === reading(c.r)) ? 3 : 0);
  }
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  const [best, next] = cands;
  const doubt = next && reading(next.r) !== reading(best.r) && best.score - next.score <= 2 ? { text: next.t, r: next.r } : null;
  return { text: best.t, index: best.i, r: best.r, doubt };
}
