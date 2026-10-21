# BroSplit next-set suggestion: what the gym log shows

Source: `data.json`, exported 10/21/26. It has 411 sets. The 2 timed plank holds are dropped, which leaves 409 sets: 363 working sets and 46 flagged warm-ups. They span 12 gym days, 09/21/26 to 10/19/26.

| Person | Sets | Working sets | Sessions | Exercises | Exercises with 3+ sessions | Days |
|---|---|---|---|---|---|---|
| Prabhashwara | 230 | 200 | 74 | 33 | 11 | 12 |
| Chamuth | 179 | 163 | 55 | 29 | 10 | 10 |
| Both | 409 | 363 | 129 | 37 | 21 | 12 |

Terms used throughout:
- A **session** is one person doing one exercise on one day.
- A **step** is the smallest weight change: 1 for a machine block, 2.5 for kg, 5 for lb.
- kg and lb are compared in kg (lb x 0.4536). Blocks are never compared with kg.
- **Hard set** means any of: tagged failure or supported, half reps, a drop-set, or a comment about partner help or struggling ("Last 2 supped", "Help on the way up", "Struggled", "Form was compromised", "Had to sacrifice").

All numbers come from `analysis.mjs` in this folder. Run `node analysis.mjs` to reprint every table.

---

## Headline numbers

1. **The current prefill is usually wrong for the first working set.** It gets the weight right 19.4% of the time (13 of 67) and the weight and reps together 6.0%. Right after a logged warm-up it is right 3.7% of the time (1 of 27), because it copies the warm-up.
2. **They don't start where they ended last time. They repeat their ramp.**
   - The first working set is lighter than last session's top set 56.7% of the time (median -1 step, -9.1%). It is heavier only 6.0% of the time.
   - Compared with last session's *first* working set, it is the same 46.3% of the time, heavier 40.3%, and lighter only 13.4%.
3. **A session is a short ramp.**
   - 3 working sets is the norm (61.2% of sessions).
   - Between consecutive working sets the weight goes up 52.6% of the time, stays 41.0%, and drops 6.4%.
   - The top set is the last set in 87.4% of sessions.
4. **Reps are anchored to 12 and move in 2s.** 53.7% of working sets are exactly 12 reps, 77.7% are 10-14, and 95.3% are even numbers.
5. **"Failure" means "hard set at the target", not "missed reps".**
   - 24.8% of working sets are tagged failure, and their median is still 12 reps.
   - After a failure tag they hold the weight 52.4% of the time (37.6% after an untagged set) and go up 33.3% (58.4% after an untagged set).
6. **Most climbs return to last session's weights.**
   - After a clean set that is still below last session's top, they go up 80.6% of the time.
   - 75.8% of those jumps land on a weight they used last session, and 63.6% land exactly on last session's top.
7. **Progress comes from adding weight, not from adding reps at the same weight.**
   - The top set goes up in 50.7% of consecutive session pairs (median +1 step), and reps usually fall when it does (58.8%).
   - Reps rising at a fixed top weight is rare: 33.3% of same-weight pairs.
8. **No sign of tired days, and no fatigue effect from exercise order or rest time.**
   - 0 of 16 person-days had most exercises below the previous session.
   - An exercise's position in the day doesn't lower its top set.
   - Rest time (median 4.5 min) doesn't predict whether reps hold.
9. **The proposed engine (E1) beats the current app.** On 191 working sets that have history:

   | | E1 | Current app |
   |---|---|---|
   | Weight exact | 43.5% | 28.8% |
   | Weight within 1 step | 66.5% | 51.3% |
   | Reps exact | 55.5% | 43.5% |
   | Reps mean absolute error | 1.68 | 2.12 |

   - Set by set, E1 alone is right on 41 sets and the app alone on 13.
   - The lead holds on the later half of the data, which was not used to shape the rules: 45.3% vs 28.2% weight exact.
10. **The sample is small.** Only 21 person-exercise pairs have 3+ sessions, and 31 of 62 pairs have just one. Any difference under about 10 points on n=67 should be treated as noise.

---

## Proposed engine E1 (the best simple rule set found)

| Situation | Suggest | Evidence |
|---|---|---|
| Opening an exercise; last session opened with a flagged warm-up | Last session's warm-up (weight and reps) | 69.6% repeat the warm-up habit (16 of 23). Only 25.0% start warming up if they didn't last time. |
| First working set of the session | Weight of **last session's first working set**, 12 reps. Ignore any warm-up logged today. | 46.3% weight exact vs 19.4% for the app. Reps exact 67.2% vs 38.8%. |
| Previous set was clean and below last session's top | Next heavier weight used last session; reps = min(previous reps, 12) | Goes up 80.6% of the time. On this subset: 47.2% exact vs 19.4% for holding. |
| Previous set was hard (failure / supported / half reps / drop / supped comment) | Same weight, same reps | Holds weight 52.4% of the time after a failure. Reps 0 and -2 score the same; -1 almost never matches. |
| At or above last session's top, clean | Same weight, same reps. Offer "+1 step" as the second chip. | It's a coin flip: up 50.8%, same 37.3%. |
| No previous session; set 1 was clean with 12+ reps | +1 step, 12 reps | Within 1 step 87.3% vs 75.5% for holding; exact 45.5% vs 49.1%. |
| Reps, anywhere | Even numbers, adjusted in steps of 2 | 95.3% of working sets have even reps. |

Showing a second chip (the "other" move: hold vs climb, or last session's 2nd set for the opener) means one of the two chips matches the actual weight 66.0% of the time, vs 28.8% for today's single prefill.

---

## 1. First working set vs the previous session (67 sessions with history)

| Compared with previous session's | Person | n | Lighter | Same | Heavier | Median steps | Median % | Median reps diff |
|---|---|---|---|---|---|---|---|---|
| Last working set | Prabhashwara | 41 | 17 (41.5%) | 17 (41.5%) | 7 (17.1%) | 0.0 | +0.0% | 0 |
| Last working set | Chamuth | 26 | 16 (61.5%) | 7 (26.9%) | 3 (11.5%) | -1.0 | -10.0% | +2 |
| Last working set | Both | 67 | 33 (49.3%) | 24 (35.8%) | 10 (14.9%) | -0.3 | -3.5% | 0 |
| Top (best) set | Prabhashwara | 41 | 21 (51.2%) | 17 (41.5%) | 3 (7.3%) | -1.0 | -5.3% | 0 |
| Top (best) set | Chamuth | 26 | 17 (65.4%) | 8 (30.8%) | 1 (3.8%) | -1.0 | -10.6% | +2 |
| Top (best) set | Both | 67 | 38 (56.7%) | 25 (37.3%) | 4 (6.0%) | -1.0 | -9.1% | 0 |
| First working set | Prabhashwara | 41 | 7 (17.1%) | 18 (43.9%) | 16 (39.0%) | 0.0 | +0.0% | 0 |
| First working set | Chamuth | 26 | 2 (7.7%) | 13 (50.0%) | 11 (42.3%) | 0.0 | +0.0% | 0 |
| First working set | Both | 67 | 9 (13.4%) | 31 (46.3%) | 27 (40.3%) | 0.0 | +0.0% | 0 |

- **First working set minus last session's top, in steps** (n=67): -6 or less: 2; -5: 1; -4: 3; -3: 4; -2: 12; -1: 15; 0: 25; +1 or more: 4.
- **As a ratio of last session's top:** median -9.1% (IQR -25.0% to +0.0%). It's the same for machine blocks (-8.8%, n=36) and dumbbells/plates (-9.1%, n=31).
- **When the opener is lighter than last top**, the median gap is -2 steps.

### Would today's prefill have been right?

| Person | n | Weight exact | Within 1 step | Reps exact | Weight + reps exact | Reps MAE | Prefill copied today's warm-up |
|---|---|---|---|---|---|---|---|
| Prabhashwara | 41 | 24.4% | 41.5% | 46.3% | 7.3% | 2.49 | 16 |
| Chamuth | 26 | 11.5% | 34.6% | 26.9% | 3.8% | 3.12 | 11 |
| Both | 67 | 19.4% | 38.8% | 38.8% | 6.0% | 2.73 | 27 |

The split by whether a warm-up came first:
- **After a logged warm-up**, the prefill was the warm-up and matched the weight 1 of 27 times (3.7%).
- **With no warm-up**, the prefill was last session's last set and matched 12 of 40 times (30.0%).

The users' complaint is accurate. Chamuth starts lighter more often (65.4% below last top, vs 51.2% for Prabhashwara).

---

## 2. Within a session

### Working sets per exercise per session

| Person | Sessions | Mean | 1 set | 2 sets | 3 sets | 4 sets | 5+ sets |
|---|---|---|---|---|---|---|---|
| Prabhashwara | 74 | 2.70 | 8 (10.8%) | 17 (23.0%) | 39 (52.7%) | 9 (12.2%) | 1 (1.4%) |
| Chamuth | 55 | 2.96 | 2 (3.6%) | 6 (10.9%) | 40 (72.7%) | 6 (10.9%) | 1 (1.8%) |
| Both | 129 | 2.81 | 10 (7.8%) | 23 (17.8%) | 79 (61.2%) | 15 (11.6%) | 2 (1.6%) |

### Weight direction between consecutive working sets

| Person | Transitions | Up | Same | Down | Median jump when up | Median drop when down |
|---|---|---|---|---|---|---|
| Prabhashwara | 126 | 63 (50.0%) | 55 (43.7%) | 8 (6.3%) | +2 steps | -2 steps |
| Chamuth | 108 | 60 (55.6%) | 41 (38.0%) | 7 (6.5%) | +1 step | -3 steps |
| Both | 234 | 123 (52.6%) | 96 (41.0%) | 15 (6.4%) | +2 steps | -2 steps |

| Transition | n | Up | Same | Down | Reps change at same weight (mean) | Reps change when weight goes up (mean) |
|---|---|---|---|---|---|---|
| Set 1 to 2 | 119 | 63.0% | 34.5% | 2.5% | +0.88 | -1.01 |
| Set 2 to 3 | 96 | 43.8% | 47.9% | 8.3% | -0.09 | -1.69 |
| Set 3 to 4 | 17 | 35.3% | 41.2% | 23.5% | +0.43 | -2.67 |

- **Reps at the same weight:** of 96 cases, reps stayed the same 54.2% of the time, fell 18.8%, and rose 27.1% (mean +0.31). There is no consistent drop-off.
  - Prabhashwara: +0.87 on average.
  - Chamuth: -0.44 on average.
- **Reps when the weight goes up:** mean -1.33 reps, but 43.9% keep the same reps.
  - Starting from 12 reps, the next set is mostly 12, otherwise 10 or 8.
  - Starting from 14, it is mostly 12.
- **Size of an upward jump on blocks** (n=81): +1 step 43.2%, +2 35.8%, +3 7.4%, +4 or more 13.6%. Jumps are lumpy, which caps exact-match accuracy for any "+1 step" rule.
- **Back-off sets:** the last set is lighter than the one before it in 10 of 119 sessions (8.4%). These are about 2.5 steps below the top, at about 12 reps, and often tagged "Ultra slow reps" or "Just to pump up". 5 of the 14 slow/controlled-comment sets were back-offs like this.

### What the next set does, by state (the core of the engine)

| State after the previous working set | n | Next up | Next same | Next down |
|---|---|---|---|---|
| Below last session's top, clean | 36 | 80.6% | 19.4% | 0.0% |
| Below last session's top, hard | 11 | 36.4% | 63.6% | 0.0% |
| At or above last session's top, clean | 59 | 50.8% | 37.3% | 11.9% |
| At or above last session's top, hard | 18 | 50.0% | 33.3% | 16.7% |
| No previous session, clean | 86 | 53.5% | 46.5% | 0.0% |
| No previous session, hard | 24 | 20.8% | 58.3% | 20.8% |
| Previous set under 12 reps | 28 | 21.4% | 60.7% | 17.9% |
| Previous set 12+ reps | 206 | 56.8% | 38.3% | 4.9% |

When they went up while still below last session's top (33 sets), the new weight was one they had used last session in 25 of them (75.8%), and exactly last session's top in 21 (63.6%).

---

## 3. Warm-ups

| Person | Sessions | Open with flagged warm-up | Warm-up load vs first working set (median) | IQR | Warm-up reps (median) | Unflagged ramp (first working set at or below 70% of session top, no warm-up) |
|---|---|---|---|---|---|---|
| Prabhashwara | 74 | 30 (40.5%) | -42.9% | -50.0% to -36.1% | 12 | 11 of 41 (26.8%) |
| Chamuth | 55 | 16 (29.1%) | -62.9% | -73.6% to -58.9% | 14 | 11 of 38 (28.9%) |
| Both | 129 | 46 (35.7%) | -50.0% | -63.3% to -42.0% | 13 | 22 of 79 (27.8%) |

- **Flagging became a habit over time.** It went from 0 of 14 sessions on 09/21/26 to 6 of 11 on 10/19/26. Some early "first working sets" are really unflagged warm-ups (27.8% of sessions without a flag start at or below 70% of the session top).
- **The habit carries over.** After opening with a warm-up last session, they did so again 69.6% of the time (16 of 23). Without one last time, 25.0% (11 of 44). The warm-up weight repeated exactly 43.8% of the time (7 of 16).
- **A warm-up is about half the first working load.** Use 50% of the opener, rounded to the step, when there is no previous warm-up to copy.

---

## 4. Session-to-session progression

Top set per session, for person-exercise pairs with 3+ sessions (21 series; F = tagged failure):

| Person | Exercise | Top set by session | Steps / session |
|---|---|---|---|
| Prabhashwara | Incline dumbbell press (7) | 75lbx14, 65lbx12, 75lbx12, 75lbx14, 75lbx14, 70lbx13F, 75lbx12 | 0.00 |
| Prabhashwara | Dumbbell lateral raise (6) | 17.5kgx10, 17.5kgx14, 17.5kgx12, 17.5kgx12, 17.5kgx12, 45lbx12F | +0.23 |
| Prabhashwara | Egyptian lateral raise (5) | 2bx12, 3bx8F, 3bx10, 2bx12, 2bx12 | 0.00 |
| Prabhashwara | Seated row close grip (5) | 14bx16F, 17bx12F, 15bx12, 17bx8, 18bx12 | +1.00 |
| Prabhashwara | 30 deg dumbbell shrugs (4) | 70lbx18F, 60lbx15, 17.5kgx30, 45lbx24 | -1.67 |
| Prabhashwara | Chest supported back machine (3) | 14bx12, 19bx10, 24bx8F | +5.00 |
| Prabhashwara | Overhead tricep extension rope (3) | 8bx12, 10bx14, 14bx8F | +3.00 |
| Chamuth | Incline dumbbell press (5) | 55lbx8, 45lbx10, 45lbx12, 55lbx10F, 60lbx10F | +0.25 |
| Chamuth | Dumbbell lateral raise (4) | 10kgx12F, 12.5kgx11F, 12.5kgx12, 12.5kgx12F | +0.33 |
| Chamuth | Chest supported back machine (3) | 11bx10F, 16bx12F, 19bx8F | +4.00 |
| Chamuth | Seated row close grip (3) | 12bx12F, 14bx6F, 7bx12 | -2.50 |
| Chamuth | Seated dumbbell overhead press (3) | 50lbx8F, 50lbx10F, 50lbx10 | 0.00 |

(The script prints all 21 series. The other 9 have 3 sessions each and move 0 to +2.5 steps per session.)

- **Typical pace:** median +0.50 steps per session across the 21 series, and 15 of 21 ended above where they started.
- **Big movers:** the chest-supported back machine and the rope extension climbed 3-5 blocks per session. These look like weight-finding on new machines, not steady progression.
- **Mature lifts plateau.** Prabhashwara's incline press has topped out at 75 lb for 7 sessions.

### Consecutive-session pairs (top set)

| Person | Pairs | Top weight up | ...reps fell | Same top weight | ...reps rose | ...reps same | Top weight down | Median days apart |
|---|---|---|---|---|---|---|---|---|
| Prabhashwara | 41 | 20 (48.8%) | 65.0% | 12 (29.3%) | 33.3% | 41.7% | 9 (22.0%) | 6 |
| Chamuth | 26 | 14 (53.8%) | 50.0% | 9 (34.6%) | 33.3% | 55.6% | 3 (11.5%) | 6 |
| Both | 67 | 34 (50.7%) | 58.8% | 21 (31.3%) | 33.3% | 47.6% | 12 (17.9%) | 6 |

- **Double progression** (reps climb at a fixed weight, then the weight goes up and reps reset) is **not** visible. There were only 7 cases of two sessions in a row at the same top weight with 12+ reps, and the top went up after just 2 of them.
- What they actually do is add weight at roughly 12 reps and accept fewer reps.
- **Rep range:**
  - Median 12 for both people. P10 is 10 and P90 is 16.
  - 86.3% of sets are 10-14 once calf, wrist and shrug work is excluded; those run 16-40.
  - Prabhashwara: 52.0% of sets at exactly 12. Chamuth: 55.8%.

---

## 5. Effort signals

| Signal on a working set | n | Was the last set | Next set: up / same / down | Reps change if same weight | Next-session top vs this set (median) |
|---|---|---|---|---|---|
| Tagged failure | 90 | 53.3% | 33.3% / 52.4% / 14.3% (n=42) | -1.05 | +1.0 step |
| Tagged supported | 3 | 33.3% | 1 up, 1 same | 0.00 | too few |
| Half reps > 0 | 7 | 28.6% | 40.0% / 60.0% / 0.0% (n=5) | -0.33 | too few |
| Has a drop-set | 24 | 62.5% | 11.1% / 44.4% / 44.4% (n=9) | 0.00 | +2.0 steps (n=11) |
| Partner helped last reps (comment) | 5 | 40.0% | 2 up, 1 down | - | too few |
| Struggled / form broke (comment) | 4 | 25.0% | 1 up, 2 same | -1.00 | too few |
| Slow / controlled reps (comment) | 14 | 57.1% | 16.7% / 66.7% / 16.7% (n=6) | -1.00 | +2.5 steps (n=10) |
| Easy / good (comment) | 9 | 55.6% | 3 up, 1 same | 0.00 | +2.0 steps (n=8) |
| No signal at all | 230 | 24.8% | 58.4% / 37.6% / 4.0% (n=173) | +0.85 | +1.2 steps |

### The failure tag
- **Who uses it:** Chamuth tags 36.8% of working sets (70.9% of his sessions contain one); Prabhashwara tags 15.0% (28.4% of sessions).
- **What it marks:** half of failure tags are on the session's top set (51.1%), and 46.7% are *not* the last set. They often keep going after a failure tag, usually at the same weight.
- **Reps after a failure at the same weight** (22 cases): the change is 0 in 6 cases and -2 in 6 cases (mean -1.05). A -1 suggestion almost never matches because reps are even.
- **Next session:** after a session whose top set was tagged failure, the next session's top moves a median 0 steps (47.6% up). Without failure it moves +1 step (52.2% up). The opener is also more cautious: -1 step vs last top, against -0.1 step otherwise.
- **Interpretation:** failure means "repeat, don't add weight yet". It does not mean "drop".

### Other signals
- **Drop-sets** finish the exercise 62.5% of the time. When another set follows, it is lighter or the same.
- **"Ultra slow reps" and other slow-tempo comments** are mostly a different mode (lighter back-offs or tempo work). They are not a fatigue signal, and the engine shouldn't treat them as hard sets.
- **"Light" support** never appears in the data, and "supported" appears only 3 times. Nothing can be said about them.
- **Comment-based signals** have 1-14 cases each. They are anecdotal.

---

## 6. Rest time between sets (same person, exercise, and day; loggedAt only)

| Person | n | P10 | P25 | Median | P75 | P90 | Under 1 min |
|---|---|---|---|---|---|---|---|
| Prabhashwara | 144 | 1.9 min | 3.2 | 4.5 | 6.3 | 7.7 | 4.2% |
| Chamuth | 110 | 2.7 min | 3.4 | 4.3 | 6.0 | 7.4 | 0.9% |
| Both | 254 | 2.2 min | 3.4 | 4.5 | 6.2 | 7.6 | 2.8% |

| Rest before a same-weight working set | n | Reps held or up | Reps down | Mean reps change |
|---|---|---|---|---|
| 1-3 min | 13 | 84.6% | 15.4% | +0.77 |
| 3-5 min | 29 | 82.8% | 17.2% | -0.52 |
| 5-7 min | 23 | 78.3% | 21.7% | +0.57 |
| 7-20 min | 18 | 83.3% | 16.7% | +0.83 |

- **Rest doesn't predict whether reps hold.** Rest before a heavier set (median 5.2 min, n=106) is barely longer than before a same-weight set (4.9 min, n=83). Rest after a failure-tagged set is a bit longer (5.8 min, n=40).
- **Rest is mostly pacing, not recovery.** They alternate sets, so rest ≈ the partner's set plus logging time.
- No gaps were over 20 minutes. 7 gaps under 1 minute are catch-up logging.
- **Don't use rest in the engine.**

---

## 7. Day-level fatigue and spacing

| Exercise position in that person's day | n | Top above previous session | Same | Below | Median steps vs last top |
|---|---|---|---|---|---|
| 1st-2nd | 29 | 44.8% | 41.4% | 13.8% | 0.0 |
| 3rd-4th | 22 | 63.6% | 13.6% | 22.7% | +1.0 |
| 5th-6th | 13 | 53.8% | 38.5% | 7.7% | +1.0 |
| 7th+ | 3 | 0.0% | 33.3% | 66.7% | -2.0 (n=3, ignore) |

- **No fatigue gradient** through the first 6 exercises. Exercise order is confounded with which exercises they do, and 7th+ has only 3 cases.
- **Tired days don't show up.** Of 16 person-days with 2+ comparable exercises:
  - None had most exercises below the previous session.
  - 7 were mostly above ("strong days").
  - The weakest was Prabhashwara's solo high-volume day, 10/09/26: of 8 exercises, 0 up, 4 same, 4 down.
- **A light opener predicts a light day.** In the 9 sessions where the first working set was lighter than last session's first working set, the top ended below last top 5 times (55.6%). Otherwise this happened 7 times in 58 (12.1%).
  - This is the only "tired" signal in the data, and n=9.
  - Shifting the rest of the session's suggestions down to match did not improve the backtest; it touches only 16 sets.
- **Spacing:**
  - Days between sessions of the same exercise: median 6 (P25 3, P75 9, range 1-19). Prabhashwara median 6, range 1-19; Chamuth median 6, range 3-12.
  - Spacing doesn't matter: the top went up in 52.6% (1-3 days), 50.0% (4-7 days), and 50.0% (8+ days) of sessions.

---

## 8. The two people

| | Prabhashwara | Chamuth |
|---|---|---|
| Load on the same exercise, same day | ~1.43x Chamuth (1.40x blocks, 1.50x dumbbells; 50 pairs) | baseline |
| Working sets at exactly 12 reps | 52.0% | 55.8% |
| Working sets tagged failure | 15.0% | 36.8% |
| Working sets with a comment | 5.5% | 17.8% |
| Working sets with a drop-set | 7.5% | 5.5% |
| Sessions opening with a flagged warm-up | 40.5% | 29.1% |
| Warm-up load vs first working set | -42.9% | -62.9% |
| Mean working sets per session | 2.70 | 2.96 |
| Within session: weight up / same | 50.0% / 43.7% | 55.6% / 38.0% |
| Median upward jump | +2 steps | +1 step |
| Opener below last session's top | 51.2% | 65.4% |
| Session to session: top up | 48.8% | 53.8% |
| Sets he typed in himself | 200 of 230 | 13 of 179 |

**Prabhashwara** holds a weight for several sets, jumps in bigger steps, and rarely calls failure. **Chamuth** ramps every set in small steps, starts lighter, and labels most top sets as failure.

The engine works for both. Weight within 1 step is 60.4% for Prabhashwara and 75.0% for Chamuth. Weight exact is 45.0% and 41.3%; for comparison, the app gets 33.3% and 22.5%. Per-person tuning should wait for more data.

Using the partner for a cold start does **not** work. Scaling the partner's opener by 1.4x matched exactly only 12.0% of the time (25 cases). Copying the partner's weight unscaled matched 24.0%.

---

## 9. Data quality and caveats

| Issue | Count | Effect |
|---|---|---|
| Sets without loggedAt (createdAt used) | 42, all on 09/21/26 | Not ~70 as expected. Server time is within seconds of loggedAt elsewhere, so ordering is fine, but those sets are excluded from rest times. |
| Edited sets | 7 | 3 Incline dumbbell press sets on 09/21/26 fixed from kg to lb (edited 10/12/26). Others: 10/12/26 Face pulls warm-up, 10/12/26 Tricep machine 18 blocks, 10/14/26 Overhead dumbbell extension 70 lb, 10/19/26 Low-to-high fly warm-up. Edits are taken as truth. |
| Sessions mixing kg and lb dumbbells | 17 | Compared in kg. 45 lb vs 20 kg counts as the same weight. Exact matches across units use a 0.75 kg tolerance. |
| Drop legs logged in another unit | 5 | Not used for weight targets. |
| Timed plank sets | 2 | Dropped (reps=60 meant seconds; no metric field). |
| Sets typed by Prabhashwara | 366 of 409 | One phone logs both people. Timestamps include typing for the partner, and 7 gaps under 1 minute are batch entry. |
| Warm-up flag used inconsistently early on | 0 of 14 sessions on 09/21/26 | Some early "first working sets" are really warm-ups. This makes the opener look lighter than it is. |
| Person-exercise pairs with only one session | 31 of 62 | No history to suggest from. 110 later sets in first-ever sessions were tested separately. |
| Support "light" | 0 uses | Can't be evaluated. "supported" has only 3 uses. |

**What the sample can and can't support.**
- The opener and within-session findings rest on 67 and 234 cases, which is enough for the large effects (19.4% vs 46.3%; 80.6% up after a clean below-top set).
- Comment and support categories (1-14 cases), double progression (7), tired openers (9), and exercise position 7+ (3) are **too small to trust**.
- Rule shapes were chosen after looking at all the data. The 10/07/26-onward split is a partial out-of-sample check, not a true holdout.

---

## 10. Rules for the suggestion engine, with backtests

**How the backtest works:**
- Every working set is predicted only from sets logged before it.
- **Main pool:** 191 working sets in sessions that have a previous session on the same exercise. That is 67 first working sets and 124 later sets.
- **Exact** means the same unit and number, or kg vs lb within 0.75 kg.
- **Within 1 step** means at most 1 step off.
- **Reps within 2** means at most one even-number step off.

### Rule-by-rule

| # | Rule | Applies to (n) | Rule: weight exact / within 1 step / reps MAE | Current app on the same sets |
|---|---|---|---|---|
| R1 | First working set = **last session's first working set** weight, 12 reps | First working sets (67) | 46.3% / 64.2% / 1.52 | 19.4% / 38.8% / 2.73 |
| R1-alt | First working set = last session's **2nd** working set, 12 reps | First working sets (67) | 50.7% / 73.1% / 1.52 | same as above |
| R1-x | First working set = last top -X%, rounded to step (brief's suggestion) | First working sets (67) | X=0%: 37.3% / 65.7%; X=10%: 25.4% / 76.1%; X=20%: 20.9% / 56.7%; X=25%: 22.4% / 50.7% | same as above |
| R2 | Opening an exercise: if last session opened with a warm-up, suggest that warm-up | First set of 67 sessions | 46.3% / 65.7% / 2.69; warm-up vs working guessed right 73.1% | 20.9% / 37.3% / 3.24; 59.7% |
| R3 | Clean set below last top: jump to the next heavier weight used last session; reps min(prev, 12) | Those sets (36) | 47.2% / 75.0% / 1.42 | 19.4% / 41.7% / 1.50 |
| R4 | After a failure tag: same weight, same reps | Sets after failure (42) | 52.4% / 73.8% / 2.90 | identical (app also copies) |
| R4-b | After a failure tag: same weight, reps -2 / -1 / -3 | Sets after failure (42) | reps exact 26.2% / 2.4% / 2.4% (vs 23.8% for -0) | |
| R4-c | After a failure tag: +1 step | Sets after failure (42) | 16.7% / 85.7% / 4.19 | |
| R5 | At/above last top, or after a hard set: hold weight and reps | Those sets (88) | 39.8% / 64.8% / 1.91 | identical |
| R6 | No history: after a clean set 1 with 12+ reps, +1 step; else hold | Later sets in first-ever sessions (110) | 45.5% / 87.3% / 1.98 | 49.1% / 75.5% / 1.88 |
| R7 | Reps for the opener: always 12 | First working sets (67) | reps exact 67.2%, MAE 1.52 | 38.8%, 2.73 |
| R8 | Top set target = last top +1 step if last top had 12+ reps, else same | Session tops (67) | 26.9% / 70.1% | "same as last top": 31.3% / 56.7% |
| R9 | +1 step only after 2 sessions in a row at the same top with 12+ reps (double progression) | Session tops (67) | 26.9% / 56.7%; triggered 7 times, right 2 | |

Reading the table:
- **R1 is the main win.** R1-alt is 3 sets better on exact out of 67, which is within noise. R1 is simpler and matches the "replay your ramp" behaviour; R1-alt is a good second chip.
- **The brief's "top minus X%" rule is weak on exact match.** Even the best X (10%) gets only 25.4% exact, though it is within 1 step 76.1% of the time. Use it only as a fallback when last session's first working set is missing.
- **R3 is the whole gain on later sets.** On the other 88 later sets, E1 and the app make the same suggestion.
- **R4 confirms the app's copy behaviour is right after a failure.** The value is in *not* suggesting a climb there.
- **R6 trades exact for near.** Climbs on blocks are +1 to +6 steps, so a fixed +1 often misses exactly but lands close.
- **R8/R9:** pushing the top set beyond last time is not supported. Let the in-session climb decide. Hold at last top and offer "+1 step" as the second chip.

### Whole engines (191 working sets with history)

| Engine | Weight exact | Within 1 step | Reps exact | Reps within 2 | Reps MAE | Weight exact + reps within 2 |
|---|---|---|---|---|---|---|
| Current app (last set today incl. warm-up, else last set of last session) | 28.8% | 51.3% | 43.5% | 75.4% | 2.12 | 22.5% |
| Last *working* set today, else last working set of last session | 34.6% | 60.2% | 41.9% | 77.5% | 2.07 | 26.2% |
| **E1** = R1 + R3 + R4/R5 + R6 | **43.5%** | **66.5%** | **55.5%** | **82.7%** | **1.68** | **38.7%** |
| E1 but climb straight to last top | 44.0% | 66.0% | 55.5% | 82.7% | 1.68 | 39.8% |
| E1 but opener = last session's 2nd working set | 45.0% | 69.6% | 55.5% | 82.7% | 1.68 | 40.3% |
| E1 but "+1 step after any clean 12+" instead of R3 | 36.1% | 71.7% | 56.5% | 82.7% | 1.71 | 31.4% |
| E1 + push past last top when clean 14+ and fewer sets than last time | 44.5% | 68.6% | 57.1% | 82.7% | 1.70 | 39.8% |
| E1 with reps -1 after a hard set | 43.5% | 66.5% | 50.3% | 82.7% | 1.69 | 38.2% |
| E1 with reps -2 after a hard set | 43.5% | 66.5% | 54.5% | 83.2% | 1.69 | 37.7% |

The second row is worth noting: simply skipping warm-ups when choosing what to copy lifts weight-exact from 28.8% to 34.6%.

**By segment, E1 vs the app:**
- **First working set:** 46.3% vs 19.4% weight exact; reps MAE 1.52 vs 2.73.
- **Later sets:** 41.9% vs 33.9% weight exact; 67.7% vs 58.1% within 1 step; reps MAE 1.77 vs 1.79.

**Set by set (weight exact):**

| Segment | n | Both right | Only E1 | Only app | Neither |
|---|---|---|---|---|---|
| First working set | 67 | 7 | 24 | 6 | 30 |
| Later sets | 124 | 35 | 17 | 7 | 65 |
| All | 191 | 42 | 41 | 13 | 95 |

**Rules shaped on data up to 10/05/26, checked on 10/07/26 onward:**

| Engine | Up to 10/05/26 (n=74): exact / within 1 / reps MAE | 10/07/26 on (n=117): exact / within 1 / reps MAE |
|---|---|---|
| Current app | 29.7% / 51.4% / 1.95 | 28.2% / 51.3% / 2.23 |
| E1 | 40.5% / 70.3% / 1.62 | 45.3% / 64.1% / 1.72 |

**By person:**

| Engine | Person | n | Weight exact | Within 1 step | Reps exact | Reps MAE |
|---|---|---|---|---|---|---|
| Current app | Prabhashwara | 111 | 33.3% | 47.7% | 49.5% | 1.89 |
| Current app | Chamuth | 80 | 22.5% | 56.3% | 35.0% | 2.44 |
| E1 | Prabhashwara | 111 | 45.0% | 60.4% | 59.5% | 1.45 |
| E1 | Chamuth | 80 | 41.3% | 75.0% | 50.0% | 2.00 |

**Two-chip coverage:**

| Segment | n | E1 primary exact | Primary or alternative exact | App exact |
|---|---|---|---|---|
| First working set | 67 | 46.3% | 68.7% | 19.4% |
| Later sets | 124 | 41.9% | 64.5% | 33.9% |
| All | 191 | 43.5% | 66.0% | 28.8% |

The alternative chip is:
- for the opener, last session's 2nd working set;
- for later sets, "hold" when the primary says climb, and "next weight up" when the primary says hold.

---

## 11. What the data does not support

- **Copying the last set of last session as the opener.** It matches 35.8% of the time when warm-ups are skipped, and 19.4% the way the app does it now.
- **A fixed "start X% lighter than last top" rule as the primary opener.** 25.4% exact at best.
- **Cutting reps by 1 after failure.** It matches 2.4% of the time because reps are even. Use 0 or -2.
- **Auto-increasing the top set between sessions, or classic double progression.** Both lose to "same as last top" on exact match, and double progression triggered only 7 times.
- **Adjusting for rest time, days since last session, or exercise order.** None shows an effect.
- **Treating "Ultra slow reps" or other tempo comments as fatigue.** They mark deliberate lighter or back-off sets.
- **Cold-start from the partner's numbers.** 12.0% exact with scaling.
- **Per-person parameters** such as Prabhashwara's +2-step jumps. These are plausible, but there isn't enough data per person and exercise to tune them without overfitting.
