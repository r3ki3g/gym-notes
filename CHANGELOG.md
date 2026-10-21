# Changelog

Semantic versioning. `MAJOR` breaks stored data, `MINOR` adds a feature,
`PATCH` fixes something.

Bump `VERSION` in `js/version.js`, add a section here, then tag the commit:

```bash
git tag v1.0.1 && git push --tags
```

---

## [1.20.0] — 10/21/26

### Added
- **Live rest timer.** On the exercise screen, under each person's last set, a
  big `Resting 2:41` counts up every second. It starts when the set is logged,
  which is when the set ended, so it is real rest.
  - It goes grey to gold to red from half the limit to the limit, with a soft
    heartbeat pulse that beats harder once the limit has passed.
  - It shows only while that set is the person's latest of the day on any
    exercise, and for at most 30 minutes.
  - It survives a reload or a locked phone, because it counts from the set's
    logged time.
- **One buzz when the limit passes**, for you or your partner, on whatever screen
  is open. It fires only once per set, and only in the minute after the limit, so
  opening the app late shows red without buzzing. Browsers only vibrate while the
  app is open and the screen is on.
- **Settings → Rest timer:** Live rest timer (on), Rest limit (5:00, from 1 to 10
  minutes in 30-second steps), and Vibrate at limit (on). Spec:
  `docs/rest-timer-spec.md`.

### Changed
- **Loading screen** scaled back again, to a small step up from the original:
  the wordmark is about 24px against the original 20px. 1.19.0 still read as too
  big on a laptop.

---

## [1.19.0] — 10/21/26

### Added
- **Settings → Display → "Most-done exercises first in search"**, on by default.
  Off: results go A–Z within each match level, and an empty box lists A–Z.
  Name matches come first either way.

### Changed
- **Loading screen scaled back:** the wordmark is now about 42% of a phone's width.
  The 60% from 1.18.0 was too big. The PRO plate, bar and text shrank to match.

---

## [1.18.0] — 10/21/26

### Changed
- **Search ranks by how well the name matches, then by what you actually do.**
  An exercise whose name has the word you typed comes first (exact word, then
  start of a word, then partial or alias), and muscle-only matches come after.
  Typing "chest" now lists "Chest supported row" above "Flat bench press". This
  reverses the old rule, where a primary-muscle match beat a name match.
- Within each of those groups, the exercises trained on more days in the last 2
  weeks come first, counting both of you. Days, not sets: five sets in one
  session count once. Applies to the log picker and the Exercises tab.
- **Empty search box: most-used exercises first**, then A–Z, instead of plain A–Z.
- **The Top weight / Reps / Volume picker sits under the chart on the exercise
  screen**, so the chart starts higher when that day's sets take up the space
  above it. The Progress page keeps the picker on top.
- **Bigger loading screen**, so it works as the app's advert: the BroSplit
  wordmark is now about 60% of a phone's width (it was about a third), and the PRO
  plate, the loading bar and the status text are bigger to match. It scales with
  the screen and is capped on a laptop.

---

## [1.17.4] — 10/21/26

### Changed
- **Chart animation reverted to the 1.16.0 entrance**: one wide purple-to-gold
  glide sweeping slowly behind the chart over 2.6s, the line drawing in, and the
  dots falling into place on their original timing. None of the 1.17.1–1.17.3
  experiments (a double pass, two bands at once, staged bands, two fast narrow
  bands) looked as good. Verified live against the 1.16.0 values: one 2.6s glide
  and no second one, dots dropping from 113 to 848ms, labels at 0.7s, and nothing
  left on screen afterwards.
- Everything else from 1.17.x stays: the chart on the exercise screen, the
  side-by-side buttons, and no replay after logging or editing a set.

---

## [1.17.3] — 10/21/26

### Changed
- **Two quick glides, one per stage**: the first sweeps across with the line,
  the second as the dots fall. Same purple-to-gold band. About half a second
  each: 61–524ms and 676–1,187ms, measured in the real app.
- Dots now fall in their own stage, starting at 550ms once the line is under
  way, so the second glide has a moment of its own.

### Fixed
- **A glide parked at the right edge.** An intermediate version sized each strip
  to the plotted points only, so its end position was still inside the card,
  over the name labels, and the glide sat there. Strips now span the card and
  stop exactly at its edges. Measured: no band visible anywhere after the
  entrance.
- **Glides were too slow**, from being locked to the line's 900ms pace. Then,
  briefly, too fast: a -100% → +100% run with easing showed each band for only
  ~150–200ms, a flicker. They now travel edge to edge at a steady pace and are
  on screen the whole time they run.

---

## [1.17.2] — 10/21/26

### Changed
- **The glide is two bands crossing together, not one band twice.** 1.17.1 ran a
  single band twice with easing. Each pass slowed to a stop at the edge before
  the next crept in, so the user saw a glide, a silent gap, then another glide.
  It's now one steady 2.6s sweep carrying two bands, the same purple-to-gold,
  one following the other. Measured in the real app: **no silent moment** during
  the sweep, and both bands on screen for 57.9% of it, the whole middle stretch.

---

## [1.17.1] — 10/21/26

### Changed
- **The chart glide now sweeps twice**, 1.3s each, inside the same 2.6s. Each
  pass feels quicker while the entrance lasts as long as before. Colours are
  unchanged. Verified by sampling the glide's live position every 150ms in the
  real app: two complete left-to-right crossings, ending off the plot.

---

## [1.17.0] — 10/21/26

### Added
- **The progress chart on the exercise screen**, under the sets, with the
  entrance animation. Pick an exercise and its progress is right there. Settings
  → Display → *Show progress chart on exercise screen*, **on by default**.
  - **Tap a point** to open the full Progress page on that day, with its sets and
    the table. *Details ›* opens it too, and the 📈 button stays at the top.
  - With one session it shows a one-line hint instead of tiles, since the columns
    just above already show that session. A brand-new exercise shows nothing.
  - **Plays its animation when you open an exercise, not when you come back to it
    after logging or editing a set.** That return happens after every set, so a
    2.6s replay would run twenty times a workout. The first version still
    replayed: it cleared the key on the way *into* the set form. Caught in
    testing, and fixed.
  - The chart code is shared with the Progress page (`appendProgressChart`), so
    the two can't drift apart.

### Changed
- **"Another exercise" and "Done" sit side by side** instead of stacked.

### Verified
- Real app, read-only. Picked from search: the chart appears below the
  side-by-side buttons and animates. Back from the set form: no replay. Tapping a
  point opened Progress on that day. One-session exercise: the hint. Setting off:
  no chart. No console errors; 446 sets before and after.

---

## [1.16.0] — 10/12/26

### Added
- **Chart entrance animation.** Settings → Display → *Animate charts*, **on by
  default**, and always off when the phone is set to reduce motion.
  - A **purple-to-gold glide** sweeps slowly left to right behind the chart
    (2.6s). It sits behind the lines and dots, in the plot's own stacking
    context, so it can be bright without washing them out. The first version ran
    on top at 15% for 1.1s and was barely noticed.
  - Each **line draws itself** left to right at an even pace (900ms).
  - **Dots drop in** with a slight bounce, starting white and settling into
    their colour, a steady beat after the line passes them. The first cut used
    an ease-out line that outran the dots: the gap grew from nothing on the
    left to ~0.8s on the right.
  - **Plays once per chart**: when it first appears and when the metric changes.
    Tapping a point re-renders the chart, and replaying on every tap would get
    old fast.
  - **A rebuild mid-entrance resumes instead of snapping or restarting.** Every
    delay subtracts the elapsed time (`--t`), the same trick the freshness glow
    uses.
  - The line-length and dot-timing maths is in `progress.js` and tested. The
    computed line length matched the browser's own `getTotalLength()` exactly
    (239.7 vs 239.7).

### Verified
- Real app, read-only. Frames captured mid-entrance: the line half-drawn with the
  left dots landed, and the glide visible behind the chart. A tap after the
  entrance didn't replay it; a tap at 1.5s resumed from 1,509ms; the toggle
  turned it off. No console errors.

---

## [1.15.0] — 10/12/26

### Added
- **Quick-add notes** under the comment box: *Ultra slow reps · Slow eccentric ·
  Good form · Help on the way up · Last 2 supped · Struggled last reps · Wrist
  pain · Chad 💪*. Tap to add, tap again to remove. One sideways-scrolling row,
  28px tall however many there are.
  - Chosen from the data: only 9.6% of sets logged in the app carry a comment,
    against 65.5% annotated in the WhatsApp log, so typing between sets was the
    barrier.
  - Nothing that already has a field. A "Failure" chip would record it in the
    comment while Support still said none, and the charts read only the field.
  - Hand-typed text is kept as typed: decimals aren't split, there's no double
    period after a sentence, and a phrase inside your own sentence isn't treated
    as the chip. `js/notes.js`, 20 assertions.
- **📈 on every row of the Exercises library**, beside Edit. Back from the chart
  returns to the library. Each row is now two sibling buttons, since a 📈 inside
  the old row-button would have been invalid HTML and fired Edit.

### Changed
- **Time between sets is on by default.** Turning it off is the opt-out.
- **Gaps read `⏱ Rest: 4:07`**, not `⏱ 4:07`. Bare `4:07` looked like a time of
  day. The toggle is renamed *Show rest between sets* to match.

### Verified
- Real app, clock faked to 10/05/26, read-only. Rest appeared with no setting
  stored. The chip sequence produced exactly the expected comment text. 50 of 50
  library rows have 📈, none nested. 📈 → chart → Back returned to the library.
  No console errors, and the set count was the same before and after.

---

## [1.14.0] — 10/12/26

### Added
- **Time between sets.** Settings → Display → *Show time between sets*, **off by
  default**. When on, every list of a day's sets shows the gap between
  consecutive sets as a quiet timeline line: `⏱ 5:33`. That covers the Log tab,
  "Today so far", History, both exercise columns (today and last time) and a
  chart's tapped day.
  - Not pure rest: only a set's *end* is recorded, so the gap includes the time
    the next set took. The Settings hint and the hover text both say so.
  - A negative gap, from two phones' clocks disagreeing by a few seconds, is
    left blank rather than shown as nonsense.
  - `js/rest.js`, 20 assertions.

### Changed
- **"Entered by" is quiet now.** The gold `entered by Chamuth` pill is replaced
  by a small outline phone and the name in faint grey, because who typed a set is
  the least important thing on the row. A phone because that's what the field
  records: whose phone the set came from. A person glyph would read as *whose
  set*, and a pen would collide with ✎. It's drawn as SVG because Android renders
  📱 in full colour.
- Every set list now goes through one helper (`appendSets`), so warm-up
  numbering and rest gaps behave the same everywhere. That replaces six
  hand-written loops.

### Fixed
- **The Log and History tabs ordered sets by server time.** After an offline
  session `createdAt` is the moment the phone reconnected, which could display a
  basement workout out of order. Every list now sorts by when the set was logged.
- "Last time" and a chart's tapped day sorted older sets, which only have
  `createdAt`, as time 0, which scrambled their order.
- "Last time" could pick a session dated *after* the day asked about. It's
  documented as strictly earlier, and now is.

### Verified
- Real app, clock faked to 10/05/26, read-only. 13 rest gaps on the Log tab and 8
  in the columns, none overflowing. 17 phone-icon attributions, which matches the
  17 sets the device analysis traced from Chamuth's Galaxy into Prabhashwara's
  profile that day. No gold pills remain, and no console errors.

---

## [1.13.0] — 10/12/26

### Added
- **✎ on today's sets in the exercise columns**, right where you've just logged
  them. That's where a missed Failure tag or a wrong unit gets caught, seconds
  later. Cancel and Save both return to the same exercise screen.
  - Compact 26px button for the half-width columns. The standard 34px one would
    have roughly doubled each row; 26px still clears the 24px minimum tap target.
  - Checked on the real app with the clock set to 10/10/26 so real rows existed:
    every row 35px, no overflow, every button inside its column, including the
    widest row `25 kg/side ×28`. No console errors, and Save was never pressed.

---

## [1.12.0] — 10/12/26

### Added
- **Edit any logged set.** A ✎ button on sets in the Log tab, the set form's
  "Today so far", History, and the tapped day on a progress chart. It opens the
  same form, prefilled, with the **whole page turned gold** — tokens overridden
  so every card and line follows — a banner naming whose set and when it was
  logged, a gold **Save changes** and a red **Cancel without saving**.
  - **An edit changes the numbers only.** `js/edits.js` limits it to weight,
    unit, reps, half reps, time, side flags, support, warm-up, comment and drops.
    It never writes when the set was logged, who typed it, which phone, the
    person, the day, the exercise, or how it is counted. Rewriting `loggedAt`
    would make a month-old set glow as fresh and move it in time.
    Records `editedAt`, `editedBy` and `editedDeviceId` alongside instead.
  - **Changing the unit keeps the number.** An edit usually fixes a wrong unit
    tap, so 75 kg → lb stays 75. When adding, the value still snaps to the new
    unit's grid. Without this, a 12.5 kg mistake corrected to lb would have
    become 15 lb.
  - Save with no changes writes nothing and stamps no `editedAt`.
  - Edited sets say so: `edited by Prabhashwara · 2m ago` in lists, an `edited`
    tag on tiles.
  - The progress chart's wrong-unit note now ends "Tap ✎ on a set to correct it."
  - Edit mode was contrast-checked: weakest text pair 4.69:1. The accent turns
    gold too, since purple text fell to 4.06:1 on the gold panels.

### Fixed
- **A set arriving from the other phone could wipe a form mid-entry.** The guard
  that stops live updates from rebuilding the screen only noticed *typing*.
  Stepper taps, unit buttons and toggles don't fire `input`, so tapping `+`
  while the other person logged a set reset your form. It now counts any
  interaction, and covers the edit screen as well as the add screen.

### Verified
- 25 edit-safety assertions, including that no protected field ever reaches the
  patch.
- Real app, headless, on the actual 09/21/26 set: prefill, gold theme, the
  unit-keeps-number behaviour, Cancel, and the add form unchanged, with no
  console errors. **Save was deliberately never pressed.** The set's server
  `updateTime` was identical before and after, so nothing was written.

---

## [1.11.0] — 10/12/26

### Added
- **Progress graphs.** A **📈 Progress** button on the exercise screen opens a
  chart of both people on one plot — the same two as the columns. Built to
  `docs/graphs-spec.md`.
  - Metrics: **Top weight** (default), **Reps** — reps at the heaviest set, not
    total reps, which only tracks how many sets you did — and **Volume**.
    Timed exercises get Longest hold / Total time; bodyweight gets Reps.
  - One unit per chart: kg and lb mixed → kg; blocks stay `#` and are never
    converted. Per-side weights are plotted as logged, with the axis saying so.
  - Warm-ups excluded. Drop sets count toward Volume only. Assisted reps get a
    hollow dot; failure gets no mark (23% of sets are failure).
  - Real calendar x-axis, so rest days show as gaps and two people on different
    days line up. Labels read `Wed` over `10/05/26` and thin out rather than
    collide.
  - One session shows a stat tile instead of a one-dot chart.
  - Tap a point to see that day's sets exactly as logged. A table underneath
    gives every value without tapping.
  - **Sets that look logged in the wrong unit get a dashed ring.** Written for
    09/21/26, where 65/75/75 lb dumbbells went in as kg and would otherwise draw
    a 60% collapse in two days.
  - Colours run through the palette validator against the chart surface: purple
    `#a855f7` and a deeper gold `#c08812`, ΔE 32.8 for colour-blind separation.
    The UI gold `#f0b429` failed the dark-mode lightness check. ● and ◆ markers,
    so identity is never colour alone.
- **Settings → Count this device in usage stats.** Turn it off on a laptop you
  test on — desktop sessions were mixed into the data used to tell the two phones
  apart.
- `js/progress.js` (pure, 76 assertions) and `js/chart.js` (inline SVG, no
  library, no extra download).

### Verified
- Rendered headless in Chrome against the live data and inspected. Six chart
  shapes, then the real app driven through its toggle and a tapped point, with
  zero console errors. The visual pass caught five layout bugs the unit tests
  could not: clipped end labels, half-step ticks on a blocks axis, a misplaced
  empty-cell dash in the table, chart-only notes under tiles, and a suspect ring
  overlapping the y labels.
- The usage opt-out was confirmed by counting usage records before and after a
  full app load: 29 → 29.

---

## [1.10.1] — 10/12/26

### Fixed
- **Some words could not find exercises that contained them.** Reported as
  "search should be case insensitive" — but search was already case-insensitive
  in every casing tested. The real cause was the synonym map, which *replaced*
  the typed word instead of adding alternatives. Searching every live exercise
  by each word of its own name (621 queries) found four dead words:

  | typed      | was searched as | so it missed                        |
  |------------|-----------------|-------------------------------------|
  | `calf`     | `calves`        | Calf raises seated machine (pwg37)  |
  | `bicep`    | `biceps`        | Incline dumbbell bicep curls        |
  | `dumbell`  | `dumbbell`      | 30 deg bent over dumbell shrugs     |
  | `pulldown` | `pull down`     | Single arm lat pulldown             |

  Each failed identically in every casing; a phone keyboard capitalising the
  first letter made it look like a case problem.
- Replaced with **synonym groups**: the typed word is always searched as typed,
  and each group only adds alternatives, in both directions. Alternatives match
  whole words only — otherwise `hamstrings` expands to `ham`, prefix-matches
  `hammer`, and surfaces Hammer curl.
- Muscle matching changed from substring to word-prefix. Once short words like
  `tri` became searchable in their own right, `tri` matched the middle of
  `hams-tri-ngs` and ranked Leg curl first for `tricep`.

### Tests
- 20 new search assertions: every casing identical, the four dead words, both
  directions of each spelling pair, and the two stray-match cases above.

---

## [1.10.0] — 10/12/26

### Changed
- **"Last time" in each column is now a tile per set, not a bare number list.**
  Found in real use: last time's warm-up carried no marker, so a light first set
  read as a heavy working set — "did I really push that much on set one?"
  - Warm-ups show a gold `W` in the index, a dashed `warm-up` tag, and a receding
    load. Working sets are numbered from 1, skipping warm-ups, matching today's.
  - Tags for support level (`Light`, `Supped`) and **`Failure`** in red, plus
    `drop`. `No sup` is omitted — it is the default, and printing it on every row
    would bury the tags that matter.
  - Drop sets show their detail: `↳ #5 ×8`.
  - **The free-text note is shown**, indented under the load.
- Today's rows in the column stay compact — you entered them minutes ago and are
  scanning fast — but share the same renderer, so both line up identically.
- Both now show `ea` for each-side sets. The old compact form dropped it, so
  `12 each side` displayed as `×12`, indistinguishable from twelve total.

### Added
- `formatEffortCompact()` for half-width columns: `×12+1h ea`, `×1:30`.
- **The pre-push gate now lives in the repo** (`scripts/`, `npm run check`). It
  had been kept in a scratch directory and was wiped between sessions twice.
  Also now waits for the server to be ready instead of sleeping a fixed second,
  and kills it by PID rather than by pattern.

---

## [1.9.1] — 09/26/26

### Added
- **`deviceId` on every set.** 1.9.0 added it to usage documents only, so 104
  logged sets carried no device information at all.

  This matters because `enteredBy` is only as honest as the device-owner
  setting. 22 sets recorded `enteredBy: "Chamuth"` when they had in fact been
  typed by Prabhashwara on his own phone with the owner temporarily switched —
  and that was briefly read as evidence Chamuth had been using the app. He had
  not. With `deviceId` stored alongside, the two can be compared and a
  mislabelled batch is obvious.

  Read from `localStorage` directly rather than via the usage tracker, so a set
  logged before tracking starts is still attributable.

---

## [1.9.0] — 09/24/26

### Added
- **Device model on usage documents.** `Pixel 9 Pro`, `Galaxy S23 (SM-S911B)`.
  Read via Client Hints (`getHighEntropyValues`), because the user-agent no
  longer carries it — Chrome's UA Reduction replaced the Android model with a
  literal `K`, so every Android Chrome reports `Android 10; K` whatever the
  phone. Chromium only; Firefox and Safari have no `userAgentData`, and iOS
  reports every iPhone as "iPhone".
- Samsung model codes are mapped to readable names (S21–S25, Fold, Flip, A5x),
  keeping the raw code alongside — the mapping is hand-written and will miss
  models, and a code beats a confident mislabel.
- **`deviceId`, persistent in `localStorage`.** The browser string cannot
  separate two people on the same setup: three of the first seven recorded
  sessions were all `Chrome 153 / Android` and could have been one phone or two.
  This makes each physical device unambiguous regardless of what it reports.

### Notes
- Both lookups are async, so the first flush of a session goes out without them
  and a second follows once they resolve.

---

## [1.8.0] — 09/22/26

### Added
- **Times in the History tab.**
  - Day header reads `Yesterday at 5:12 PM`, with the session span and length
    beneath it: `5:12 PM → 8:04 PM · 2h 52m`.
  - Every set in the expanded list carries its own timestamp **to the second**.
  - Times come from `loggedAt` (client clock) and fall back to `createdAt` for
    sets logged before 1.1.0.
  - The span sorts timestamps first, because two phones syncing after being
    offline can deliver sets out of order.
- Timestamps are opt-in per call site (`showTime`), so the Log tab stays compact.

### Notes
- Time formatting is pinned to `en-US` rather than the device locale. A phone set
  to a 24-hour locale would otherwise show `17:12` beside `09/20/26` dates.

---

## [1.7.0] — 09/22/26

### Added
- **Usage tracking** (`js/usage.js`, `usage` collection): who is on the phone,
  which browser, how long, which screens, how many sets logged.
  - **One mutable document per app-open**, merged into every 30 seconds — not an
    append per tick. At one write every 5s a single forgotten open tab costs
    17,280 writes/day, 86% of the free tier, and once writes are exhausted they
    fail for *everything* including logging sets. This costs about 2.4% of quota
    for a two-phone workout, and ~2,900 documents a year instead of 6.3M.
  - **Only counts visible time.** Gated on `visibilityState`, so a backgrounded
    tab writes nothing — which removes the runaway case entirely.
  - Flushes on `visibilitychange` and `pagehide` so the tail of a session is not
    lost; `pagehide` is the one that fires reliably on mobile.
  - Failures are swallowed with a console warning. Analytics is the least
    important write in the app and must never break logging.
  - Session id is held in `sessionStorage`, so a reload continues one session
    instead of forking it.
- Brave is detected via `navigator.brave` — it reports a Chrome user-agent with
  no token of its own, so nothing in the UA string can identify it.

### Fixed
- `parseBrowser` reported iOS Safari with no version. iOS inserts
  `Mobile/15E148` between `Version/` and `Safari/`, and the regex required them
  to be adjacent. Caught by a test, not by hand.

---

## [1.6.0] — 09/22/26

### Added
- **Time-based exercises.** An exercise can be counted in seconds instead of
  reps — planks, dead hangs, any held position. Set with a `Reps / Time` toggle
  in the exercise editor.
  - The set form shows a duration stepper in **5-second steps** (1s would make a
    90s plank eighteen taps) with a live `1:30` readout.
  - Half reps and drop sets are hidden for timed exercises; neither means
    anything on a held position.
  - Displays as `BW × 1:30` rather than `× 90 reps`.
- **Bodyweight exercises.** A `Bodyweight / Uses weight` toggle removes the
  weight field entirely, and the units section with it. Without this a plank
  forced you to record `0 kg × 60s`.
- Three timed exercises seeded: Plank, Side plank, Dead hang.

### Changed
- `setVolumeKg()` returns `null` for timed and bodyweight sets. `weight ×
  seconds` is not the same quantity as `weight × reps`, and a bodyweight set has
  no external load — counting either as zero would quietly drag a session's
  totals down. Same treatment block-based sets already get.
- `metric` and `bodyweight` are copied onto each set, like `unit` already was,
  so changing an exercise later cannot rewrite how past sets were counted.

---

## [1.5.0] — 09/22/26

### Removed
- **The "More options" toggle on the set form.** It was built on the assumption
  that most sets are weight and reps only, with half reps, side toggles, support
  level, comment and drop sets as occasional extras. Counting the WhatsApp log
  settles it: **129 of 197 recorded sets (65.5%) carry an annotation** — form
  notes, support, struggle. The toggle added a tap to the majority case, not the
  minority. Everything on the set form is visible again.

---

## [1.4.1] — 09/22/26

### Changed
- Name is one word: **BroSplit**.
- Tightened brand tracking to suit it — `.14em → .07em` in the header and
  `.24em → .14em` on the splash. At the old values a single word read as eight
  loose letters instead of a name.

---

## [1.4.0] — 09/22/26

### Changed
- **Renamed to Bro Split.** *Spotter* is singular and one-directional — one
  person spots, the other lifts — which described half of what this does. A bro
  split is a training split *and* two bros splitting the logging.

### Fixed
- 🔴 **Every `<select>` in the app had a permanent purple outline.** The rule read
  `input:focus,select,textarea:focus` — `select` lost its `:focus`, so the accent
  outline applied unconditionally. Present since the first version of the
  stylesheet. Three attempts to remove this "glow" failed because they all edited
  `border` on `.side-pick`, and the purple was an `outline` from an unrelated
  rule.
- The person selector kept its focus ring after being tapped. `:focus` fires on
  mouse and touch; it now uses `:focus-visible`, so only keyboard navigation
  shows a ring.

### Added
- The gate lints **mixed pseudo-class selector lists** — a comma list where some
  parts carry `:focus`/`:hover` and others do not, which is almost always a
  dropped pseudo-class applying a rule unconditionally. Verified by
  reintroducing the exact typo and confirming the gate fails.

---

## [1.3.0] — 09/22/26

### Changed
- **The profile selection is now described as what it actually is: a view
  filter.** It stopped being a logging target in 1.1.0, when the two-sided view
  moved the target into the URL — but the labels still said "logging for".
  - Settings heading: *"Who are we logging for?"* → **People**, with a note
    saying a tap shows that person's log and history, and that the logging
    target is chosen on the exercise screen.
  - The selected row shows a `viewing` pill instead of a bare `✓`.
  - Log tab banner: *"⚠️ You are logging for X — despite actually being Y"* →
    *"Viewing X's log · you are Y"*, and no longer styled as a warning, because
    reading someone's log is not one.
  - **The top-bar chip is no longer gold.** Gold means cross-person *logging*
    everywhere else in the app, so a gold chip naming someone else implied sets
    would be written to them — the exact confusion this fixes.
- `isOnBehalf()` renamed to `viewingSomeoneElse()`; the old name described
  behaviour that no longer existed.

---

## [1.2.5] — 09/22/26

### Fixed
- **The selector's accent border was still showing.** The 1.2.4 edit added a new
  `.side-pick` rule but left the old one in place *after* it, so the stale rule
  won by cascade order and the change appeared not to apply. The duplicate came
  from an edit whose start and end anchors were in the wrong order, which
  silently copied a block instead of replacing it.
- `#tabs button` was also declared twice; merged.

### Added
- The gate now detects **duplicate top-level CSS selectors**. Brace balance
  cannot catch a rule pasted twice — a duplicate is perfectly balanced — which
  is exactly why `css: ok` was reported on a broken file. Rules inside `@media`
  are scoped separately so they do not false-positive. Verified by re-adding a
  duplicate and confirming the gate fails.

---

## [1.2.4] — 09/22/26

### Changed
- **Removed the accent border from the right column's person selector.** It read
  as a glow marking that side as active or more important. The selector now
  matches the plain name on the left at the same weight and size, with only a
  small chevron marking it as a control. Focus ring kept for keyboard use.
- **The two columns are now visually identical**, apart from the `YOU` tag. The
  left one had a tinted border and a solid `+ add set` button against the
  right's dashed one — both implied your side was the real one, which is the
  opposite of treating both people the same.

---

## [1.2.3] — 09/22/26

### Fixed
- **The freshness bar covered the set number.** The 3px `inset` box-shadow was
  drawn over the row's content rather than beside it, hiding the set index on
  any freshly-logged set. Both the exercise columns and the main log list are
  affected and both are fixed: rows now reserve a left lane for the bar, present
  whether or not the row is fresh, so nothing shifts sideways when the glow
  expires. A negative margin keeps the text aligned with the card around it.

---

## [1.2.2] — 09/22/26

### Fixed
- The startup error handler printed its hint once per error, so a cascade of
  three errors showed three copies. One report now, however many follow.

### Added
- **Startup failures now offer a fix, not just advice.** A module cached before
  `no-store` existed cannot be evicted by a normal reload, which left
  hard-refreshing as the only recovery. The error screen now has a *Reload with
  fresh files* button: it refetches every module with `cache: 'reload'` —
  bypassing the HTTP cache and rewriting each entry — then reloads. A
  `sessionStorage` flag stops a non-cache error from looping, and clears itself
  after a clean start.
- The gate checks the recovery list in `index.html` against `js/` on disk, so a
  new module cannot silently be left out of recovery.

---

## [1.2.1] — 09/22/26

### Added
- `serve.py` — dev server sending `Cache-Control: no-store`. **Use this instead
  of `python3 -m http.server`.** `http.server` sends no cache directive at all,
  only `Last-Modified`, so browsers apply heuristic freshness and will serve a
  stale module without revalidating. That caused a real failure: a fresh
  `app.js` running against a cached `store.js`, so `daysAgoKey` existed on disk
  and was undefined in the browser.
- **Startup errors are now visible.** A failed import throws before any of our
  own code runs, so `app.js` cannot report it — twice this appeared as a splash
  that never finished. An inline handler in `index.html` now shows the message
  and suggests a hard refresh.
- The pre-push gate checks **namespace imports** (`import * as S` then `S.foo`),
  a runtime property access the named-import check could not see. Verified by
  un-exporting `daysAgoKey` and confirming the gate fails.

---

## [1.2.0] — 09/22/26

### Added
- **"Last time" now shows for both people**, inside each column. Previously only
  the left side had it, because only the active profile's history was loaded —
  the other person's earlier numbers were simply not in memory.
- `lastSessionFor()` in `js/sides.js` — pure and tested, so both sides run the
  same code path.

### Changed
- The cross-profile subscription now covers a **90-day window for every
  profile** instead of today only. One range filter on the ISO `date` string, so
  no composite index. Also bounds what was previously an unbounded read —
  the one scaling worry flagged in the README.

### Fixed
- A test of mine asserted the wrong thing (expecting `null` where earlier sets
  genuinely existed). The assertion was corrected, not the code.

---

## [1.1.1] — 09/22/26

### Fixed
- **App would not load.** Removing the dead on-behalf confirm from `ui.js` took
  `busyButton` with it, so `app.js` imported a symbol that no longer existed and
  the whole module graph failed to evaluate — showing as a splash that never
  finished. `node --check` validates syntax only and passed it happily.
- **The right-hand picker sat above both columns**, so it read as choosing who
  goes on the left. It is now the right column's own header, on the thing it
  controls.

### Removed
- **The "not training today" collapse.** It put a third name on screen and hid
  the `+ add set` it was supposed to surface, making correct behaviour look
  broken. Both columns are now always full columns.

### Added
- `js/sides.js` — the left/right decision as a pure, testable function. The rule
  is now stated in one place: **left is always the device owner and never
  changes; right is chosen from everyone else.**
- `test/` with 43 assertions across sides, units and search. `npm test`.
- `package.json` (`"type": "module"`) so Node can load `js/*.js` directly.

---

## [1.1.0] — 09/22/26

### Added
- **Two-sided exercise view.** Picking an exercise now opens both people's sets
  for it side by side, each column with its own `+ add set`. Logging for either
  of you is one tap — no profile switching, no re-searching. Replaces six
  interactions with one.
  - **Adaptive, not a mode switch.** One profile → single column. Other person
    not training today → their column collapses to a one-tap strip. Both
    training → two columns. Nothing to configure.
  - Three or more people → the right column becomes a picker, remembered
    between exercises.
- **Steppers on weight and reps.** `–  17.5  +`, with the step taken from the
  unit: **1** for blocks, **2.5** for kg, **5** for lb — every weight in the
  original WhatsApp log fits those grids. Long-press repeats and accelerates.
  Changing unit snaps the value onto the new grid, so kg → lb cannot leave you
  on 17.5 lb. The number is still typeable.
- **Progressive disclosure on the set form.** Weight, unit and reps stay visible;
  half reps, side toggles, support, comment and drop sets moved behind "More
  options". Remembered per exercise. The common case is now two taps and Save.
- **Freshness glow.** A set logged in the last 30 seconds is highlighted — gold
  pulse for the other person's, one brief purple flash for your own. Driven by
  finite CSS iteration counts with a negative `animation-delay`, so a set that is
  already 20s old glows for its remaining 10s and no JS timer is needed.
- `loggedAt` (client clock) on every set. Correct offline, and populated
  instantly, unlike the `serverTimestamp()` sentinel.

### Changed
- The set form's target now comes from the URL (`#/set/<exercise>/<profile>`)
  rather than a global selector, and is named at the top of the form in every
  flow.
- **The on-behalf confirmation dialog is gone.** It guarded against a global
  selector being silently wrong; there is no longer a global selector in the
  logging path, so it was pure friction with nothing left to catch.
- The active profile now defaults to this device's owner, so your own history is
  what loads.

---

## [1.0.1] — 09/22/26

### Fixed
- **Save buttons could be double-submitted.** Tapping "Save set" twice on a slow
  connection wrote two records. Found in real use on 09/21/26. All write buttons
  now block repeat taps and show a progress label (`Adding…`, `Saving…`).
  Disabling alone was not enough — the handlers are async, so a second tap could
  land before the DOM updated.

### Added
- The set form now always names who the set is for, not only when logging on
  someone else's behalf. A label that appears only sometimes is one nobody reads.
- Version shown in Settings and on the loading screen.

---

## [1.0.0] — 09/21/26

First version in real use. Replaces the WhatsApp group.

### Core
- Profiles, arbitrary number, seeded with Prabhashwara and Chamuth
- 34 exercises seeded from the WhatsApp export (08/27/26–09/15/26)
- Per-set logging: weight, reps, half reps, support level, warm-up flag, comment
- Drop sets inside a single set, each drop carrying its own unit
- Three units — blocks (`#5`), kg, lb — stored per set, so dumbbell work mixes
  kg and lb freely
- `perSide` (weight per side) and `unilateral` (reps per side) kept separate;
  the WhatsApp log used "each side" for both and they are not the same thing
- Volume totals exclude block-based sets rather than treating them as kilograms

### Search
- Ranking by muscle priority — `muscles[]` is ordered, so typing `tricep`
  surfaces tricep-dominant exercises above ones where triceps is secondary
- Every query token must match, so `tricep extension` narrows to the machine and
  dumbbell versions rather than everything tricep
- Synonyms for the log's own shorthand (`db`, `cabel`, …)

### Logging on someone else's behalf
- Device identity from the access key suffix (`…---Prabhashwara`)
- `enteredBy` on every set, with a gold `entered by X` tag
- Full-screen confirm before every cross-profile save
- Gold profile chip and a banner while logging for someone else

### Alerts
- Live toast and tone when the other person logs a set, over the existing
  Firestore socket — no polling
- Alerts tab with relative timestamps, derived from sets rather than stored
- Independent Notifications / Sound / Vibrate switches; vibration shown only
  where the browser supports it

### Security
- `apiKey` kept out of the public repo, pasted once per device into
  `localStorage`
- Anonymous auth, Firestore rules requiring `request.auth != null`

### Offline
- Firestore persistent cache, so writes land with no signal and sync later

### Interface
- Purple-on-near-black palette, all pairs passing WCAG AA
- Boot splash with a gold shine, in markup so it paints on the first frame
