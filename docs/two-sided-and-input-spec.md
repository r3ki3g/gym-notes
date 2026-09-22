# Two-sided logging, freshness glow, stepper input — spec

Draft for review. Nothing built. From real use on 09/21/26.

Supersedes phases 2–5 of `sessions-and-templates-spec.md` (drag + templates:
dropped). Phase 0 of `timer-spec.md` still stands, and §2 below now depends on it.

---

## 1. Two-sided logging

### The problem is real and worth fixing

You both do the same exercise, alternating sets. Current cost of switching:
chip → Settings → tap name → back → Log → search the exercise again → log.
**Six interactions, dozens of times a session.** That is the single biggest
friction left in the app.

### But literal left/right entry will not fit

A set form holds weight, unit segmented control, reps, half reps, three toggles,
support segmented control, comment and drops. At 375px, two columns give each
~170px. The unit picker (`# / kg / lb`) and the three toggles break at that
width. Halving the form breaks the form.

### What I recommend instead

**Two-sided for seeing and choosing. Full width for typing.**

```
  Overhead tricep extension (rope)
  triceps
  ┌────────────────────┬────────────────────┐
  │ YOU                │ CHAMUTH            │
  │ Prabhashwara       │                    │
  ├────────────────────┼────────────────────┤
  │ 1  #4 × 16         │ 1  #7 × 14         │
  │ 2  #6 × 14         │ 2  #8 × 12         │
  │ 3  #7 × 12         │                    │
  ├────────────────────┼────────────────────┤
  │     + add set      │     + add set      │
  └────────────────────┴────────────────────┘
```

Two compact read-only columns, both people's sets on this exercise at a glance —
which is the thing you actually wanted. `+ add set` opens the **full-width** form
with that person already selected.

One tap to log for either person. No profile switching, no re-searching, and the
form stays usable.

### Knock-on effects

- **"Active profile" mostly stops mattering.** The device owner is the left
  column; everyone else is the right. The top-bar chip becomes a fallback for
  History and Alerts, not part of the logging path.
- **More than two people:** left is always you, right becomes a small segmented
  picker of the others. Works for 3–5 without redesign.
- 🔴 **The on-behalf confirm becomes redundant here.** It exists because a global
  selector could silently be wrong. In a two-sided view there is no global
  selection — you tap a column with a name on it. Firing a full-screen confirm on
  every right-column set would be pure friction with nothing left to catch.
  **Recommendation: drop it inside the two-sided view, keep it anywhere that
  still relies on the chip.** Your call — you were clear you wanted it always.

## 2. Freshness glow

Straightforward, and a good idea. `entered by Chamuth` tells you *who*; it does
not tell you *just now*.

- **30-second window**, as you said.
- **Other person's set → gold glow**, a slow 2s pulse. That is new information.
- **Your own set → one brief purple flash**, no pulse. That is write
  confirmation, a different job. Same treatment for both would waste the signal.
- Fades out rather than snapping off.
- Reduced motion → static tint, no pulse.

### The dependency

🔴 **This needs `loggedAt`.** Freshness is `Date.now() - loggedAt < 30s`.
`createdAt` is a `serverTimestamp()` sentinel — **null locally until the write
reaches Google**. Offline, every fresh set would read as age `null` and never
glow. Do phase 0 first or this silently does nothing in the gym.

A 30s window also needs a timer to expire the class. One shared 5s tick that
clears expired glows is enough; do not set a timeout per set.

## 3. Stepper buttons on the number

Yes. Sweaty hands and a numeric keyboard are a bad combination.

```
   WEIGHT
  ┌────┬──────────┬────┐
  │ –  │   17.5   │  + │      tap the number to type
  └────┴──────────┴────┘
```

### Step size must follow the unit

This is the part that makes it feel right, and your own log settles it:

| unit | step | checked against every value in `chat.txt` |
|---|---|---|
| block | **1** | `#0 #1 #2 … #12 #17` — all integers |
| kg | **2.5** | 2.5 5 7.5 10 12.5 15 17.5 20 25 30 60 80 — all multiples of 2.5, one exception below |
| lb | **5** | 15 20 25 30 40 45 50 60 70 75 90 — **no exceptions** |

A flat step of 1 would make kg and lb miserable. A flat 2.5 would be nonsense on
blocks.

The single kg exception is `17.4kg`, logged once on 08/28/26 where `17.5` appears
many times elsewhere. That is a typo — and a stepper is exactly what would have
stopped it. The steppers are not only faster, they make a class of bad data
impossible to enter.

### Details

- **Same treatment for reps**, step 1. You did not ask, but it is the identical
  problem and the identical fix.
- Long-press to repeat, accelerating after ~1s.
- Clamp at 0. Never go negative.
- Tapping the number still opens the keyboard — the stepper is an addition, not a
  replacement.

## 4. The compactness problem you flagged

You are right that it gets tight. The answer is not a smaller form, it is a
**shorter** one.

Most sets need only weight and reps. Everything else is occasional:

| always visible | behind "More" |
|---|---|
| weight + stepper | half reps |
| unit | per-side / each-side toggles |
| reps + stepper | support level |
| Save | comment |
|  | drop sets |

The expander remembers its state per exercise, so a machine where you always add
a comment stays open. Common case becomes **two taps and Save**.

This is worth doing regardless of the two-sided view, and it is what makes the
two-sided view feel light rather than cramped.

## 5. Build order

| phase | what | size |
|---|---|---|
| **0** | `loggedAt` on every set — **prerequisite for §2** | XS |
| **1** | Steppers on weight + reps, unit-aware steps | S |
| **2** | Collapse the form behind "More" | S |
| **3** | Freshness glow | S |
| **4** | Two-sided exercise view | M |

Phases 1–3 are small, independent, and each improves the app on its own. Phase 4
is the big one and benefits from phase 2 landing first.

## 6. Decisions — answered 09/22/26

1. ~~On-behalf confirm in the two-sided view~~ → **dropped there.** Instead the
   set form always names its target, in every flow. Shipped in v1.0.1.
2. ~~Glow on your own sets~~ → **yes**, both people. Brief flash for your own,
   gold pulse for theirs.
3. **Form collapse (§4)** — still open.
4. **Right column with 3+ people** — still open.

### On the `loggedAt` dependency

Called as unnecessary given a reliable connection, and that is largely right:
with the network up, another person's set arrives already server-stamped, so the
glow works off `createdAt`. The only gap is **your own** set, which renders from
the local cache with `createdAt: null` for the ~300ms until the server confirms —
so your own flash would start slightly late.

`loggedAt` is one field and closes that gap, so it is worth including when §2 is
built. It is no longer a blocker.
