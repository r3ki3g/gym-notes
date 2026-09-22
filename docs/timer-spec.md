# Workout timer & rest tracking — spec

Draft for review. Nothing built yet.

---

## 1. The useful realisation

**Most of what you asked for is already in the database.** Every set carries
`createdAt`. Workout duration is `last set − first set`. Rest between sets is the
gap between consecutive sets. Neither needs a timer to exist.

So the timer is not a data feature. It is a **display** of data you already have,
plus one live clock that ticks between sets.

That means: no session documents, no start/stop buttons, no extra writes. It also
means rest data appears **retroactively** for every set you have already logged.

## 2. The one thing that must change first

🔴 **`serverTimestamp()` breaks rest timing offline, and every set currently uses
only that.**

`serverTimestamp()` is a sentinel. Offline it stays null locally and is assigned
when the write reaches Google. Log 40 sets in a basement with no signal and they
all sync at once on the walk out — **every set gets near-identical timestamps and
all rest data for that session is destroyed.**

This is not hypothetical. Offline persistence is the reason we chose Firestore.

**Fix:** add a client-side `loggedAt: Date.now()` to every set.

| field | source | used for |
|---|---|---|
| `loggedAt` | client clock | all timing maths |
| `createdAt` | server | ordering, audit, tie-breaks |

The client clock is correct offline. Phones sync time over the network and drift
is seconds at worst — irrelevant for rest measured in minutes.

**Sets logged before this change have no usable rest data.** Nothing to recover;
just don't present garbage for them. Treat missing `loggedAt` as "unknown".

## 3. What the number actually means

Logging happens *after* a set. So the gap between two log events is:

```
rest  +  the time the second set took to perform
```

That is **turnaround**, not pure rest. Three options:

- **(a) Call it what it is.** Label it "since last set". No fake precision. ← recommended
- (b) Add a "start set" button. Truthful, but friction mid-workout, and you will
      forget to press it when tired. The whole app exists because you are zoned out.
- (c) Subtract an estimate from rep count. Invented numbers that look real.

Go with (a). Honest labels beat false accuracy.

## 4. What goes in the top bar

Your proposal was total elapsed. I think that is the wrong number.

**Total elapsed is a vanity metric** — you look at it once, at the end.
**Time since your last set is actionable right now:** have I rested enough for
the next heavy set, or am I stalling?

So:

```
SPOTTER PRO        ⏱ 2:14   [Prabhashwara ▾]  ●
                    ▲ since your last set
```

- Counts up from the last set **for the selected profile** — you two alternate, so
  the clock is per person, not global.
- Colour by rest band: grey under 60s, white 1–3 min, gold over 3 min, dim red
  over 10 min (you have stopped training).
- Appears on the first set of the day, disappears after 2 hours of no sets.
- Total workout time lives in the History card, computed. Not in the top bar.

## 5. Tapping the timer

A sheet with:

- Started HH:MM · elapsed · working sets · median rest
- A list of gaps over 5 minutes, each with one-tap labels:
  `waiting for machine` · `machine broken` · `talking` · `phone` · `warm-up`
- The label is written to `gapNote` on the **following** set. No new collection.

That covers "annotate how the time was spent" without a second data model.

## 6. Rest shown inline

In the set list, between rows:

```
  1.  #7 for 12 reps        good form
        ⏱ 2:40 rest
  2.  #8 for 10 reps        last 2 supped
```

This is the highest-value part of the whole feature and it is nearly free.

## 7. Derived metrics worth having

| metric | why it earns its place |
|---|---|
| Rest before each set | direct feedback, the main payoff |
| Median rest per exercise | catches you rushing heavy compounds |
| Longest gap | usually the phone. Confronting. |
| Working sets ÷ total time | density; one honest number for the session |

Skip time-under-tension and calorie estimates. Both would be invented.

## 8. Data model delta

```diff
  sets/{id}
+   loggedAt: number        // Date.now() at save — all timing uses this
+   gapNote:  string|null   // optional label for the gap BEFORE this set
    createdAt: Timestamp    // unchanged, still server-assigned
```

Two fields. No new collections, no session documents, no scheduled writes.

## 9. Decisions I need from you

1. **Rest clock per profile, or one shared workout clock?** I recommend per
   profile — you alternate, so your rests are independent.
2. **Gap threshold for labelling** — 5 minutes, or higher?
3. **Auto-hide after 2 hours of no sets** — right, or should it persist all day?
4. **Do you want total elapsed visible anywhere live,** or only in History?

## 10. What I would cut from the original idea

- **Start/stop buttons.** First set starts it, inactivity ends it. Zero friction,
  nothing to forget when you are wrecked after a set.
- **A session document.** A session is already "every set sharing profile + date".
  Adding a record would create two sources of truth that can disagree.

## 11. Rough size

`loggedAt` plus inline rest display: small — half the value, an hour of work.
Top bar clock, tap sheet, gap labels, metrics: moderate.

Worth doing §2 and §6 first and living with them for a week before building the
rest. The top bar clock may turn out to be noise once rest is visible inline.
