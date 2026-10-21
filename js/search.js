// Exercise search.
//
// The rule you asked for: typing "tricep" should surface exercises where triceps
// is the DOMINANT muscle before ones where it's merely involved. So muscle
// position is the primary signal, and a match at index 0 outranks any name match.
//
//   "tricep"           -> tricep-primary machines/cables first, bench press far below
//   "tricep extension" -> machine AND dumbbell versions both survive, both scored,
//                         and the name distinguishes them in the list
//
// Every query token must match something, or the exercise drops out entirely.
// That's what keeps "tricep extension" from dragging in every tricep exercise.

const MUSCLE_PRIMARY = 100;   // index 0; index 1 -> 50, index 2 -> 33...
const NAME_EXACT     = 60;
const NAME_PREFIX    = 45;
const ALIAS          = 40;
const NAME_SUBSTRING = 22;

// Interchangeable spellings. Every member finds every other, so neither the
// query nor the exercise name has to use a "canonical" form.
//
// This used to be a one-way map that REPLACED the typed word: "calf" became
// "calves", so searching "calf" could not find an exercise named "Calf raises"
// unless its muscles happened to be tagged. 621 queries against the live pool
// turned up four such dead words (calf, bicep, dumbell, pulldown). Now the typed
// word is always searched as typed, and a group only ADDS alternatives.
const SYNONYM_GROUPS = [
  ['dumbbell', 'dumbell', 'db'],
  ['barbell', 'bb'],
  ['cable', 'cabel'],
  ['triceps', 'tricep', 'tri'],
  ['biceps', 'bicep', 'bi'],
  ['delts', 'delt'],
  ['shoulders', 'shoulder', 'delts'],
  ['lats', 'lat'],
  ['pulldown', 'pull down'],
  ['overhead press', 'ohp'],
  ['quads', 'quad'],
  ['hamstrings', 'ham'],
  ['calves', 'calf'],
  ['abs', 'ab'],
];

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const GROUPS_BY_WORD = new Map();
for (const g of SYNONYM_GROUPS) for (const w of g) {
  if (!GROUPS_BY_WORD.has(w)) GROUPS_BY_WORD.set(w, new Set());
  for (const o of g) if (o !== w) GROUPS_BY_WORD.get(w).add(o);
}

/** The words as typed, lower-cased. Case never affects matching. */
export function tokenize(q) {
  return norm(q).split(' ').filter(Boolean);
}

/** Alternatives a group adds for a typed word — never including the word itself. */
export function alternativesFor(token) {
  return [...(GROUPS_BY_WORD.get(token) || [])];
}

// "tricep" should hit muscle "triceps", and "triceps" should hit "tricep".
// Word-PREFIX either direction, per word of the muscle name ("side delts").
// This was plain substring until synonym groups made short words like "tri"
// searchable in their own right — "tri" then matched the middle of
// "hams-tri-ngs" and ranked Leg curl first for "tricep". Under 3 characters it
// must be an exact word, so "ab" cannot match "abductors".
function loose(haystack, needle) {
  const words = haystack.split(' ');
  if (needle.length < 3) return words.includes(needle);
  return words.some((w) => w.startsWith(needle) || needle.startsWith(w));
}

function muscleScore(ex, needle) {
  const muscles = ex.muscles || [];
  for (let i = 0; i < muscles.length; i++) {
    if (loose(norm(muscles[i]), needle)) return MUSCLE_PRIMARY / (i + 1); // earliest hit is strongest
  }
  return 0;
}

/**
 * Best score for one typed token, or 0 if it matches nothing.
 *
 * The typed word gets full search-as-you-type matching: exact, prefix, and
 * substring. Alternatives from a synonym group match whole words or phrases
 * ONLY — otherwise "hamstrings" would expand to "ham", prefix-match "hammer",
 * and surface Hammer curl.
 */
// How well a query word matched, for ordering. A proper name match comes first,
// whatever the muscles say: typing "chest" should put "Chest supported row"
// above "Flat bench press". Muscle priority still decides between equals.
export const MATCH = { EXACT: 4, PREFIX: 3, PARTIAL: 2, MUSCLE: 1, NONE: 0 };

/**
 * Best score for one typed token, and how well it matched (MATCH), or score 0
 * if it matches nothing.
 *
 * The typed word gets full search-as-you-type matching: exact, prefix, and
 * substring. Alternatives from a synonym group match whole words or phrases
 * ONLY — otherwise "hamstrings" would expand to "ham", prefix-match "hammer",
 * and surface Hammer curl.
 */
function scoreToken(ex, token) {
  const nameWords = norm(ex.name).split(' ');
  const nameText  = ' ' + norm(ex.name) + ' ';
  const aliasNorm = (ex.aliases || []).map(norm);

  let best = 0, cls = MATCH.NONE;
  const hit = (score, c) => { best = Math.max(best, score); cls = Math.max(cls, c); };

  const m = muscleScore(ex, token);
  if (m) hit(m, MATCH.MUSCLE);

  for (const w of nameWords) {
    if (w === token)              hit(NAME_EXACT, MATCH.EXACT);
    else if (w.startsWith(token)) hit(NAME_PREFIX, MATCH.PREFIX);
    else if (token.length >= 4 && w.includes(token)) hit(NAME_SUBSTRING, MATCH.PARTIAL);
  }
  for (const a of aliasNorm) {
    if (a.split(' ').some((w) => w === token || w.startsWith(token))) hit(ALIAS, MATCH.PARTIAL);
  }

  for (const alt of alternativesFor(token)) {
    const am = muscleScore(ex, alt);
    if (am) hit(am, MATCH.MUSCLE);
    // a synonym found as a whole word in the name is as good as typing it
    if (nameText.includes(' ' + alt + ' ')) hit(NAME_EXACT, MATCH.EXACT);
    if (aliasNorm.some((a) => (' ' + a + ' ').includes(' ' + alt + ' '))) hit(ALIAS, MATCH.PARTIAL);
  }

  return { score: best, cls };
}

/**
 * Days each exercise was trained in the last `days` days (today included),
 * across everyone. Days, not sets: five sets in one session is one session.
 *
 * @param sets   any held sets, each with exerciseId and date (YYYY-MM-DD)
 * @param today  YYYY-MM-DD
 * @returns Map exerciseId -> distinct days
 */
export function recentFrequency(sets, { today, days = 14 } = {}) {
  const cutoff = new Date(today + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const since = cutoff.toISOString().slice(0, 10);

  const seen = new Map();
  for (const s of sets) {
    if (!s.exerciseId || !s.date || s.date < since || s.date > today) continue;
    if (!seen.has(s.exerciseId)) seen.set(s.exerciseId, new Set());
    seen.get(s.exerciseId).add(s.date);
  }
  const out = new Map();
  for (const [id, d] of seen) out.set(id, d.size);
  return out;
}

/**
 * Exercises that matched every query word, ordered by:
 *   1. how well the NAME matched — the weakest word decides, so "tricep
 *      extension" only counts as a name match if both words are in the name
 *   2. how often it was trained recently (`frequency`, from recentFrequency)
 *   3. the old score, where muscle priority still separates equals
 *   4. name, A-Z
 * An empty query lists everything, most-trained first.
 */
export function searchExercises(exercises, query, { frequency = null } = {}) {
  const freq = (ex) => (frequency && frequency.get(ex.id)) || 0;
  const tokens = tokenize(query);
  if (!tokens.length) {
    return [...exercises].sort((a, b) => freq(b) - freq(a) || a.name.localeCompare(b.name));
  }

  const hits = [];
  for (const ex of exercises) {
    let total = 0;
    let cls = MATCH.EXACT;
    let matchedAll = true;
    for (const t of tokens) {
      const r = scoreToken(ex, t);
      if (r.score === 0) { matchedAll = false; break; }
      total += r.score;
      cls = Math.min(cls, r.cls);
    }
    if (matchedAll) hits.push({ ex, score: total, cls });
  }

  return hits
    .sort((a, b) => b.cls - a.cls
                 || freq(b.ex) - freq(a.ex)
                 || b.score - a.score
                 || a.ex.name.localeCompare(b.ex.name))
    .map((h) => h.ex);
}

export const MUSCLES = [
  'upper chest','mid chest','lower chest',
  'lats','traps','rhomboids','lower back',
  'front delts','side delts','rear delts',
  'biceps','triceps','forearms',
  'quads','hamstrings','glutes','calves',
  'abs','obliques',
];
