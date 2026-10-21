I'm building voice logging for a small gym-logging web app, and I need your help designing the text-understanding layer. Think it through deeply and be concrete.

## The setup
- A web app (plain JavaScript, no server, no build step). Two friends log each other's gym sets on their phones (Chrome on Android: Pixel 9 Pro and Galaxy S24 Ultra) and laptops (Chrome on macOS).
- Speech-to-text is the browser's Web Speech API (Chrome), lang en-US. We get interim results while the person is talking, a final transcript, and up to 2 alternative transcripts (maxAlternatives = 3). Recognition runs on Google's cloud service, or on-device when Chrome offers it.
- The speakers are Sri Lankan men speaking English in a noisy gym, often out of breath.
- Our own parser turns the transcript into set fields: weight, unit (kg / lb / machine "pin" or "block" number), reps, half reps, support (failure / spotted / light help), a warm-up flag, "each side" / "per side" flags, quick notes (ultra slow reps, slow eccentric, good form, help on the way up, last 2 supped, struggled last reps, wrist pain), drop sets (split on "then", "drop set", "drop to", "dropped (to)"), and a comment (only after the command words "add comment", "comment" or "note").
- Typical utterance: "60 lbs for 10 reps then 30 lbs for 12 reps add comment slow and heavy". It should give 60 lb × 10 reps, a drop of 30 lb × 12 reps, and the comment "Slow and heavy".

## What actually comes back (real transcripts from our log)
Final transcripts, each followed by what the person meant:
1. "20 kgs for 10 rips then 15 kgs for 20 raps then 30 lb is for 10 grapes": 20 kg × 10 reps, then 15 kg × 20 reps, then 30 lbs × 10 reps
2. "20 kgs for 10 raps then 13 kgs for 20 raps then 5 kgs for 40 rips": 20 kg × 10, 13 kg × 20, 5 kg × 40
3. "20 tips for": "20 reps for…"
4. "20 kgs for 10 ribs then 5 kg is 420 g": 20 kg × 10, then 5 kgs for 20 reps ("for 20" heard as "420", and "reps" as "g")
5. "20 kg warm UPS": 20 kg warm-ups
6. "20 kgs for 10 raps then 5 kg is for to enter apps": "…then 5 kgs for twenty reps" ("twenty reps" heard as "to enter apps")
7. "20 kgs for 10 ribs then 10 kg is five raps then 5 kg is 4 2 rapes": "…then 10 kgs five reps, then 5 kgs for 2 reps" ("for" heard as "4")
8. "20 kgs for 10 grapes then 5 kgs for two reps then 2 kg is 20 raps"
9. "10 kgs for 20 wraps then 5 kg is 25 raps then 30 kg is for two reps"

Interim updates from one session show the recogniser changing its mind:
- "20 kgs for 10 ra" → "…10 rap" → "…10 grapes"
- "5 kg" → "5 kgs" → "5 kg is" → "5 kgs for"
- "2 kg is for 20" → "2 kg is for 20th" → "2 kg is 20 raps" (the "for" vanished in the final)

Alternatives returned with the finals include: "…20 rapes", "…for 20th", "…5 kgs for 2 rapes", "…25 rips".

## Recurring problems
- "reps" is heard as raps, rips, ribs, wraps, rapes, grapes, tips, apps, "g", or as a partial "ra" or "rap".
- "kgs" is heard as "kg is", and "lbs" as "lb is".
- "for" is heard as "4" (so "5 kg 4 12" and "420" for "for 20").
- "twenty" is heard as "to enter", and "20" comes back as "20th".
- "to" / "two" and "for" / "four" are ambiguous in general.

## What I want from you
1. A design for the understanding layer, ranked by impact versus effort, for a tiny vocabulary in client-side JavaScript. Cover at least:
   - slot-based correction: a word right after a number is probably a unit or "reps"; a number after a unit is probably reps
   - phonetic matching (Soundex, Double Metaphone, a phonetic edit distance) against our small vocabulary, with thresholds that avoid false positives on short words
   - choosing between the final transcript and its alternatives (n-best re-ranking) by how well each parses
   - using the stream of interim results, for example a word that was right in an interim and wrong in the final
   - handling for/4, to/2, "420", "20th" and "to enter" without breaking real numbers (weights really can be 4, 20 or 420 lb on a leg press)
2. Exact rules or pseudocode I can implement, including how to tokenise, and where each rule sits relative to splitting the comment and the drop sets.
3. A short list of test cases (input → expected fields), including the 9 real transcripts above and tricky false-positive cases that must NOT be "corrected" (a comment saying "grapes", a real 4 kg dumbbell, a 420 lb leg press).
4. Whether Chrome's Web Speech API supports biasing towards our vocabulary today, either through SpeechGrammarList or the newer contextual "phrases" proposal (SpeechRecognitionPhrase with a boost), and whether that works in cloud mode or only on-device. Give sources.
5. How to use our voice log to keep improving. Each entry stores the final text, the interim updates, the alternatives, how we parsed it, and, if saved, what the user kept and corrected by hand. How would you turn that into new rules safely?

Keep the answer structured with headings, prefer concrete rules over general advice, and flag anything you are unsure about.
