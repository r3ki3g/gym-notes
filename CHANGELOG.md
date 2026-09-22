# Changelog

Semantic versioning. `MAJOR` breaks stored data, `MINOR` adds a feature,
`PATCH` fixes something.

Bump `VERSION` in `js/version.js`, add a section here, then tag the commit:

```bash
git tag v1.0.1 && git push --tags
```

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
