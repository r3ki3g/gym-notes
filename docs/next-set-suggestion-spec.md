# Next-set suggestion: spec

Built in 1.29.0 (Settings → Pro features → Smart next set, on by default). Written 10/21/26 from two research passes (both in
`docs/research/next-set/`):
- `data-findings.md`: your 411 real sets, each rule backtested.
  `analysis.mjs` reprints every number from an exported `data.json`.
- `methods-findings.md`: training research and how 11 apps do it, with sources.

## The short version

1. **The first set starts where you started last time, not where you ended.**
   Today's pre-fill copies last time's final set, or even the warm-up. It gets
   the first set's weight right 19.4% of the time; this rule gets 46.3%.
2. **Then climb back up last session's ladder.** After a clean set below last
   time's top, you went up 80.6% of the time, usually to a weight you used last
   session.
3. **After a hard set (failure, help, partials), repeat it.** In your data
   "Failure" means "same again", not fewer reps.
4. **Reps are a target, not a pre-filled fact.** You log what happened, so the
   reps field shows "aim 12" and only becomes a number when you set it.
5. **Always say why**, in one line, and offer a second option as one tap.

Backtested on every working set that had history (191 sets):

| | Today's pre-fill | This spec |
|---|---|---|
| Weight exactly right | 28.8% | 43.5% |
| Weight within 1 step | 51.3% | 66.5% |
| Reps exactly right | 43.5% | 55.5% |
| Right weight in one of the two options | 28.8% | 66.0% |

It still wins on the later half of the data (10/07/26 onward): 45.3% against
28.2%.

## Rules, per person and exercise (first match wins)

Applied to the person whose set it is, not the phone owner. Warm-ups never
count as working sets.

| # | Situation | Suggest | Second option |
|---|---|---|---|
| 1 | Opening the exercise, and last time opened with a warm-up | that warm-up again | skip to working set |
| 2 | First working set of the day | **last session's first working weight**, aim 12 | last session's 2nd working weight |
| 3 | Last set was clean and below last session's top | **the next weight up that you used last session**, reps = min(last, 12) | same weight |
| 4 | Last set was hard: failure, help, half reps, drop, "supped" note | **same weight, same reps** | next weight up |
| 5 | At or above last session's top, clean | **same weight, same reps** | +1 step |
| 6 | No previous session, set 1 clean with 12+ reps | +1 step, aim 12 | same |
| 7 | First time ever on this exercise | nothing smart: empty form with "first time" | none |

Reps always move in 2s (95.3% of your logged reps are even). "−1 rep" matched
reality 2.4% of the time, so it's never suggested.

## Safety rules from the research (always on)

- **Pain note** ("Wrist pain", or "pain", "hurt" or "tweak" in a comment): never
  suggest heavier on that exercise next time. The reason line names the note.
- **Tempo sets** ("Ultra slow reps", "Slow eccentric") are deliberately light.
  They never pull later suggestions down, and they follow their own track.
- **Assisted reps don't count** toward going heavier. With "Last 2 supped",
  12 reps counts as 10.
- **Big jumps at light weights:** a step that's 10% or more of the load (pin 7
  to 8, a 20 lb to 25 lb dumbbell) is only suggested after more reps than
  usual. The exact threshold is in methods-findings c1.

## On screen (set form)

```
Weight  [ 62.5 kg ]  ← pre-filled with the suggestion
Reps    [ aim 12   ]  ← a target hint, empty until you set it

Started at 62.5 last time, so starting there again
[ 62.5 × 12 ]  [ 65 × 10 ]      ← two chips: tap to fill
```

- **Weight is pre-filled** because you pick it before the set.
- **Reps stay empty**, with the target shown as a hint. A pre-filled number
  tends to get saved unchanged, which would make the log lie. The ± buttons
  start from the target.
- **One line of reason**, always: "Climbing back to last time's 65",
  "Repeating: last set hit failure", "Holding: wrist pain noted last time".
- **Confidence:** "based on 1 session" or "based on 4", so a thin history
  doesn't pretend to be smart.

## Settings → Pro features

| setting | default |
|---|---|
| Smart next set (off = today's "copy last set") | on |

## Later (needs about 4 or more sessions per exercise first)

The research recommends these, but your data is too thin to tune or test
them yet:
- **Tired-day detection:** first set 2 or more reps under expected means hold
  the load for that exercise, and two such exercises means "tired day?" with a
  dismiss option.
- **Easy-day toggle per session:** easy sessions stay out of progression.
- **Stall rule:** 3 sessions with no gain means suggest −10% and build back.
  Deload prompts would be a lighter week, never days off.
- **Optional one-tap effort per set:** Easy, Solid or All-out. It makes the
  "how close to failure" guess real data.

## What the data says NOT to do

- Copy last session's final set as the opener: that's today's bug.
- Use a fixed "start X% lighter" rule: 25.4% at best.
- Auto-raise the top set every session, or use classic double progression: both
  lose to "same as last top" for you two.
- Adjust for rest time, days off or exercise order: no effect in your data.
- Copy the partner's numbers for a first time: 12.0% right.

## Build size

Medium:
- one pure module with tests
- the backtest script reused as a regression test
- form changes: weight pre-fill, reps hint, reason line, two chips
- one setting
