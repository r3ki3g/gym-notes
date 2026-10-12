# Progress graphs — spec

Draft for review. Nothing built yet. Based on the live data as of 10/12/26.

---

## 1. What the data says

309 real sets (Test excluded), 09/21/26 → 10/10/26, 9 training days (Mon, Wed, Fri, Sat).

| Finding | So the design… |
|---|---|
| 26 of 52 exercise/person pairs have **1 session**; only 13 have 3+ | must handle sparse data — see §8 |
| **56.3%** of sets are blocks (`#5`) | blocks are first-class, not an edge case |
| 9 exercises mix kg and lb — every one is a dumbbell exercise | the unit rule matters — see §5 |
| `per side` and `each side` are **never** mixed within one exercise | numbers can be plotted as logged |
| Volume swings with set count: 1,524 kg on 10/09 (4 sets) vs 794 on 10/10 (2 sets) | volume can't be the default |
| **3 sets** logged in the wrong unit — see §11 | the chart will expose bad data instantly |

## 2. Where it lives

A **📈 Progress** button on the exercise screen, next to Edit. It opens
`#/progress/<exercise>` and shows the same two people as the columns: left is
you, right is whoever is selected.

## 3. What to plot

A toggle above the chart: **[ Top weight ] [ Reps ] [ Volume ]**

| Metric | One point per day = | Answers | Watch out |
|---|---|---|---|
| **Top weight** *(default)* | heaviest working set | "am I getting stronger?" | — |
| **Reps** | reps **at that top set** | "more reps at the same weight?" | drops when the weight goes up |
| **Volume** | Σ weight × reps, drops included | "how much work did I do?" | doubles if you do twice the sets |
| *Est. 1RM (optional)* | weight × (1 + reps ÷ 30) | strength as one number | kg/lb only — meaningless for blocks |

**Why Reps is reps at the top set, not total reps:** total reps tracks set count
just like volume does — 52 on 10/09 vs 25 on 10/10. Top-set reps shows real
progress: incline press went 34 kg × 12 → × 14 → × 14 at the same weight.

**Why a toggle instead of weight and reps on one chart:** different scales need
two y-axes, which is the most common way charts mislead.

## 4. What counts

| Situation | Rule |
|---|---|
| Warm-up (9.7% of sets) | **excluded** from every metric; still listed, greyed, in the day's detail |
| Drop set | Top weight / Reps: main set only. Volume: drops included |
| Half rep | counts as 0.5 |
| Failure (23.3% of sets) | counts normally, no special mark — excluding it would delete a quarter of the data |
| Supported / Light | counts, drawn as a **hollow dot** — someone helped with those reps |
| Per side | plotted as logged, axis reads `kg / side`. Volume uses the total (×2), as History already does |
| Each side | reps as logged — consistent within each exercise, so trends are unaffected |
| Timed exercise | metrics become **Longest hold** and **Total time** |
| Bodyweight | **Reps** only |

## 5. Units

Your rule, which the data supports:

- one unit logged → chart in that unit
- **kg and lb mixed → everything in kg**
- blocks → `#`, **never converted**. A stack position only means something on that one machine

One awkward case for you to decide on: incline dumbbell press is almost all lb
(45, 65, 75 lb dumbbells), but because a few sets are in kg, your rule puts the
whole chart in kg, so **45 lb shows as 20.4 kg**. The alternative is to use
whichever unit most of the sets were logged in.

Converted values are shown to 1 decimal.

## 6. Axes

- **x: real calendar dates**, not one evenly spaced tick per session. Gaps are
  then visibly rest days, and two people training on different days still line up.
  Labels are two lines: `Wed` over `10/05/26`.
- **y: fitted to the data with padding**, not forced to zero. A line chart can
  start above zero (a bar chart can't), and 20 → 25 kg would look flat on a 0–25
  axis. The unit goes in the axis title.

## 7. Comparing the two of you

**Same plot, two lines.** Colours checked with the palette validator against the
chart surface `#13101c`:

| You | Them | Colour-blind separation | Result |
|---|---|---|---|
| `#a855f7` purple | `#c08812` gold | ΔE 32.8 (8 is the target) | passes all 5 checks |

The app's own `#f0b429` gold **failed** the dark-mode lightness check (too
bright), so the chart uses a deeper gold. The bright one stays for tags and
text.

Colour is never the only cue: **● for you, ◆ for them**, a name label at the end of each
line, and a legend.

Within one exercise, both of you are always logged in the same unit system, so the
comparison is like for like. Blocks compare fine because it's the same machine.

## 8. When there's hardly any data

| Sessions | Show |
|---|---|
| 0 | "No sets logged yet" |
| 1 | a **stat tile**: `Last: #7 × 12 · Sat 10/10/26` — a single dot isn't a chart |
| 2+ | a line with a dot on every session — at this size, the dots *are* the data |
| < 6 | no trend line — two points always make a straight line, which proves nothing |

## 9. Reading exact values

- **Tap a point** to see that day's sets exactly as logged, warm-ups and notes
  included. Hit area is at least 24px — phones have no hover.
- **A table under the chart**: date, you, them. Every value is readable
  without tapping.
- **Suspect points** (see §11) get a dashed ring and a "looks like lb logged as kg" note.

## 10. How it gets built

- `js/progress.js`, **pure functions**: choose the unit, build each series, flag
  suspects. Tested in Node like `sides.js`.
- **Hand-drawn SVG, no chart library.** Two series of up to ~30 points each don't need
  one, it matches the palette exactly, and there's nothing extra to download.
- **No new database reads.** `state.recent` already holds 90 days of everyone's
  sets, so the chart shows up to 90 days unless that's raised.

Order: `progress.js` + tests → Top weight chart → metric toggle → table and
tap detail → suspect flags.

## 11. Fix before building: 09/21/26

| Exercise | Person | Logged | Clearly meant |
|---|---|---|---|
| Incline dumbbell press | Prabhashwara | 65 kg × 14, 75 kg × 14, 75 kg × 14 | lb — every other session is 65–75 **lb** |

A 75 kg dumbbell for 14 reps is about 165 lb per hand. Left as is, the first
chart you open shows a **60% strength collapse in two days**. It's 3 of 122
kg/lb working sets (2.5%) — the only case in the data.

~~The app can't edit a set today.~~ Since v1.12.0 it can: tap the dashed point,
then ✎ on each set, and switch kg → lb. The numbers are kept as they are.

## 12. Decisions — as built in v1.11.0

1. ~~Units~~ → **"mixed → kg"**, as originally specified.
2. ~~Reps~~ → **reps at the top set**.
3. **Est. 1RM** — not in v1. Open.
4. **The three 09/21 sets** — **not corrected.** Needs an explicit yes; the chart
   flags them with a dashed ring in the meantime.
