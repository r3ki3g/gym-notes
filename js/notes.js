// Quick-add phrases for the set comment.
//
// Typing between sets is the friction: in the app only 9.6% of sets carry a
// comment, against 65.5% annotated in the WhatsApp log. These are the notes
// that recurred most there and in the app, chosen by the user on 10/12/26.
//
// Deliberately excluded: anything with its own field. "No sup", "Supped",
// "Failure" and "Warm-up" already exist as Support and Warm-up — a chip for
// them would record the same fact in two places that can disagree, and the
// charts read only the field.
//
// Pure, tested in test/notes.test.mjs.

export const QUICK_NOTES = [
  'Ultra slow reps',
  'Slow eccentric',
  'Good form',
  'Help on the way up',
  'Last 2 supped',
  'Struggled last reps',
  'Wrist pain',
  'Chad 💪',
];

// Notes are kept as sentences: "Ultra slow reps. Good form". A period only
// separates when followed by a space, so "1.5 min" is never split.
const SEP = '. ';

function segments(text) {
  return (text || '')
    .trim()
    .replace(/\.$/, '')            // a lone trailing period is not a segment
    .split(/\.\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const same = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** Is this phrase already in the comment, as its own note? Case-insensitive. */
export function hasNote(comment, phrase) {
  return segments(comment).some((s) => same(s, phrase));
}

/**
 * Add the phrase, or remove it if it is already there. Hand-typed text is kept
 * as typed; only the chip's own phrase is added or taken out.
 */
export function toggleNote(comment, phrase) {
  const segs = segments(comment);
  if (segs.some((s) => same(s, phrase))) {
    return segs.filter((s) => !same(s, phrase)).join(SEP);
  }
  return [...segs, phrase].join(SEP);
}
