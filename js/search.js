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

// Gym shorthand as it appears in the chat log.
const SYNONYMS = {
  db:'dumbbell', dumbell:'dumbbell', bb:'barbell', cabel:'cable',
  tri:'triceps', tricep:'triceps', bi:'biceps', bicep:'biceps',
  delt:'delts', delts:'shoulders', shoulder:'shoulders',
  lat:'lats', pulldown:'pull down', ohp:'overhead press',
  quad:'quads', ham:'hamstrings', calf:'calves', ab:'abs',
};

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function tokenize(q) {
  return norm(q).split(' ').filter(Boolean).map((t) => SYNONYMS[t] || t);
}

// "tricep" should hit muscle "triceps", and "triceps" should hit "tricep".
// Substring either direction, with a floor so "ab" doesn't match "barbell".
function loose(haystack, needle) {
  if (needle.length < 3) return haystack === needle;
  return haystack.includes(needle) || needle.includes(haystack);
}

/** Best score for a single token against one exercise, or 0 if it matches nothing. */
function scoreToken(ex, token) {
  let best = 0;

  const muscles = ex.muscles || [];
  for (let i = 0; i < muscles.length; i++) {
    if (loose(norm(muscles[i]), token)) {
      best = Math.max(best, MUSCLE_PRIMARY / (i + 1));
      break; // ordered list — the earliest hit is the strongest
    }
  }

  for (const w of norm(ex.name).split(' ')) {
    if (w === token)            best = Math.max(best, NAME_EXACT);
    else if (w.startsWith(token)) best = Math.max(best, NAME_PREFIX);
    else if (token.length >= 4 && w.includes(token)) best = Math.max(best, NAME_SUBSTRING);
  }

  for (const a of ex.aliases || []) {
    if (norm(a).split(' ').some((w) => w === token || w.startsWith(token))) {
      best = Math.max(best, ALIAS);
    }
  }

  return best;
}

/**
 * @returns exercises that matched every token, best first.
 * Empty query returns everything alphabetically.
 */
export function searchExercises(exercises, query) {
  const tokens = tokenize(query);
  if (!tokens.length) {
    return [...exercises].sort((a, b) => a.name.localeCompare(b.name));
  }

  const hits = [];
  for (const ex of exercises) {
    let total = 0;
    let matchedAll = true;
    for (const t of tokens) {
      const s = scoreToken(ex, t);
      if (s === 0) { matchedAll = false; break; }
      total += s;
    }
    if (matchedAll) hits.push({ ex, score: total });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name))
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
