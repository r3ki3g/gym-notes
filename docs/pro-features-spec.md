# Pro features: PR celebration and streak calendar

Built in 1.28.0. The weekly target is 4 days and rep PRs count, as the users chose 10/21/26. Both are on by default, and each can be turned off in
Settings → Pro features. No emojis anywhere.

## 1. PR celebration

**A PR is** a working set, warm-ups excluded, that beats every earlier set by
the same person on the same exercise:
- **Weight PR:** heavier than ever before (lb converted to kg, blocks compared
  with blocks).
- **Rep PR:** at a weight you've lifted before, more reps than ever at that weight or heavier. A first visit to a lighter weight, like a back-off set, doesn't count.
- **Time PR:** the longest hold, for timed exercises.

A tie isn't a PR. The very first session of an exercise isn't one either, since
there's nothing to beat. Sets flagged as a likely wrong unit are skipped.

**When it happens:**
- the row flashes gold for about 1.5 seconds
- a toast: "New PR: 62.5 kg × 8 on Incline dumbbell press"

That covers your own sets and your partner's as they arrive live.

**Afterwards:** a small gold **PR** tag stays on the set everywhere it shows:
the exercise screen, History and the Progress day view. It's worked out from
the data, not stored, so edits and deletes keep it right.

## 2. Streak calendar

**Where:** a card at the top of History.

**The grid:** one per person, GitHub-style. Columns are weeks, rows Mon–Sun,
13 weeks back. A cell is filled when that person logged on that day, deeper
the more sets. Each person has their chart colour.

**Under each grid:** "This week: 2 of 4 days · Streak: 6 weeks · Best: 9 weeks"
- **Streak** means consecutive weeks that hit the weekly target.
- **Weekly target:** 4 days by default, adjustable from 1 to 7.
- The current week never breaks a streak; it only adds to it once the target
  is hit.

Tap a day to jump to it in History.

## Settings → Pro features

| setting | default |
|---|---|
| PR celebration | on |
| Streak calendar | on |
| Weekly target | 4 days |

## Limits

Both work from what the phone holds: your full history, and the last 90 days
for your partner. The app is younger than 90 days, so today that's everything.
