# Live rest timer — spec

Built in 1.20.0.

Supersedes the top-bar clock (§4) in `timer-spec.md`.

**What:** on the exercise screen, under each person's last set of today, a live
`Resting 2:41` that ticks every second. When they log the next set, it becomes
the usual `Rest: 2:41` row.

**Counts from** that set's `loggedAt`, so it stays right after a reload or a
locked phone. It shows only when:
- that set is the person's latest set today on any exercise (once they move on, this one's timer goes)
- it is under 30 min old (past that, they've stopped)

**Look:**
- bigger and bolder than the `Rest:` rows, in tabular digits
- grey until 50% of the limit, then shades through amber to red at the limit
- a soft heartbeat pulse each second; once past the limit: solid red, stronger beat

**Vibrate:** once, when the limit is crossed (buzz-pause-buzz), and only once per
set. Both columns count, so you also feel your partner's.
Browser limit: this works only while the screen is on and the app is open.

**Settings → Rest timer** (new section):

| setting | default |
|---|---|
| Live rest timer | on |
| Rest limit | 5:00 (1–10 min, 30s steps) |
| Vibrate at limit | on |

It is independent of "Show rest between sets".

**Not in this:** lock-screen alerts, sound.
