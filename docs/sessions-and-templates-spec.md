# Sessions & "repeat last time" templates — spec

Draft for review. Nothing built yet. Supersedes the session question in
`timer-spec.md`.

---

## 1. First, a correction

> "for the template feature we should have this session concept, because we need
> to know when the last session ended"

**The template feature does not need sessions.** That lookup already exists and
already works — `lastTime()` in `js/app.js`:

```js
/** Most recent previous day this profile trained this exercise. */
function lastTime(exerciseId, excludeDate) { … }
```

It groups by `date`, finds the most recent prior day, returns every set from it.
That is precisely the template payload. It is what already draws the "Last time"
box on the log screen.

So if templates were the only goal, we would build them today and skip sessions.

## 2. But sessions still earn their place — for different reasons

Date-grouping breaks or falls short in four real cases:

| case | what goes wrong |
|---|---|
| Workout crosses midnight | Splits into two "sessions". Your log has 9:30pm finishes. |
| Two workouts in one day | Merged into one. |
| Rest clock | Nothing tells it you went home. Explicit end stops it cleanly. |
| Session-level data | Bodyweight, how you felt, "Push day" — nowhere to put it. |

And one thing you cannot do at all without them:

**"Repeat my entire last push day."** Not one exercise — the whole session, in
order, as a template. That is a bigger win than the per-exercise version, and it
is the natural end state of the WhatsApp habit you are replacing.

So: yes to sessions. Not for the reason you gave, but the answer is the same.

## 3. The rule that keeps them safe

My earlier objection was two sources of truth. Avoided by one rule:

> **A session document stores only metadata. It never stores which sets are in
> it, or anything derived from them.**

Set membership lives on the set (`sessionId`). Duration, volume and set count are
always computed. The session doc answers "when, who, what did it feel like" and
nothing else. Then the two can never disagree.

## 4. Data model

```diff
+ sessions/{id}
+   profileId
+   date          // YYYY-MM-DD of start — grouping key
+   startedAt     // client ms
+   endedAt       // client ms, null while open
+   endedBy       // 'user' | 'auto' | 'midnight'
+   title         // optional, e.g. "Push"
+   note          // optional

  sets/{id}
+   sessionId
+   loggedAt      // from timer-spec.md — prerequisite, see §8
```

One session per profile. You two train together but your sets are separate, so
two sessions run in parallel. No shared "gym visit" record — it would buy nothing.

**Migration:** existing sets have no `sessionId`. Backfill by grouping on
`(profileId, date)` — a one-time pass, same result as today's behaviour.

## 5. Start and end

- **Start: implicit.** First set of the day opens a session. No button. You will
  not remember to press one, and the app exists because you are zoned out.
- **End: explicit button,** plus two fallbacks — auto-close after 3h of no sets,
  and force-close at midnight so a session never spans days.
- `endedBy` records which, so an auto-closed session can be reopened if you
  stepped out for twenty minutes.

## 6. The template flow

### What gets copied

This matters more than it looks:

| carried over | left blank |
|---|---|
| weight, unit, perSide | **comment** |
| reps, halfReps, unilateral | **support level** |
| drops[] | |
| warmup flag | |

A template is the **prescription**, not the outcome. Copying "last 2 supped"
into a fresh set would be actively wrong — it is a claim about a set you have not
done yet.

### The screen it needs

Your WhatsApp habit is: see all sets at once, edit the numbers, send. The current
one-set-at-a-time form cannot express that.

So the template opens a **multi-set editor** — every set on one screen, each row
editable, add/remove rows, one "Save all" at the end.

```
  Overhead tricep extension (rope)          from 09/14/26
  ─────────────────────────────────────────────────────
  1   [ #4 ]  ×  [ 16 ]  reps              good ▾    ✕
  2   [ #6 ]  ×  [ 14 ]  reps              good ▾    ✕
  3   [ #7 ]  ×  [ 12 ]  reps              good ▾    ✕
                                          + add set
  ─────────────────────────────────────────────────────
              [    Save 3 sets    ]
```

This is arguably more valuable than the drag gesture. It is the thing that
actually replicates copy-paste-edit.

## 7. The drag gesture

Drag a picker row right → opens the template. Three problems to solve:

**⚠️ iOS edge-swipe collision.** A rightward drag starting near the left edge is
the system back gesture in Safari and Chrome. Mitigation: ignore drags beginning
within 40px of the left edge, and set `touch-action: pan-y` on rows. Test on a
real iPhone before committing to this.

**Discoverability.** Nobody drags an unfamiliar list. Needs a visible affordance —
a `↺` that peeks from the right edge of rows that have history.

**No drag-only paths.** The `↺` is also tappable. Drag is the shortcut; the
button is the contract.

Suggested row:

```
┌──────────────────────────────────────────┐
│ Overhead tricep extension (rope)     ↺ › │
│ triceps            last: #4×16 #6×14 …   │
└──────────────────────────────────────────┘
   tap → empty form      ↺ or drag → template
```

Showing last time's numbers on the row itself may remove the need to open
anything at all for a straight repeat.

## 8. Build order

Each phase is independently useful. Stop whenever it stops being worth it.

| phase | what | size |
|---|---|---|
| **0** | `loggedAt` fix from `timer-spec.md` — **prerequisite, do first** | XS |
| **1** | Session docs, implicit start, explicit end, backfill | S |
| **2** | Multi-set editor screen | M |
| **3** | Template load via `↺` button + last-time numbers on rows | S |
| **4** | Drag gesture over phase 3 | S |
| **5** | Whole-session template ("repeat last Push day") | M |

Phase 0 is genuinely urgent and unrelated: every offline session you log before
it lands has unusable timing data.

Phases 2 and 3 together are the feature you actually described. Phase 4 is
polish on top — if the `↺` button turns out to be enough, skip it.

## 9. Decisions I need

1. **Session end** — is a 3h auto-close right, or do you want it to stay open
   until you press the button?
2. **Session titles** — worth having ("Push", "Pull", "Legs"), or noise?
3. **Phase 5** — is whole-session repeat interesting, or is per-exercise enough?
4. **Drag** — build phase 4 at all, or try living with the `↺` button first?
