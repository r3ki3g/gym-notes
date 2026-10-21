# Live updates: why they feel unreliable, and the fix

Built in 1.27.0. Evidence is from the real data, read-only, 10/21/26.

## What we have

A live Firestore listener, not polling and not a webhook. It is instant and
cheap while it is connected, but nothing checks that it still is.

## Findings

| # | Cause | Evidence | Polling fixes it? |
|---|---|---|---|
| 1 | **Alerts fire while the app is hidden, and are lost.** The toast shows for 3s on a screen nobody is looking at, and vibration is blocked when hidden. | Chamuth on 10/19: app open 1.3h, visible 6.4 min (8.1%). | No |
| 2 | **No reconnect when you come back.** The phone sleeps, the connection dies silently, and nothing forces it back on return. | Code: no resume handling for data. | Yes |
| 3 | **A listener that errors once stays dead** until a reload. | Code: the error is logged, never retried. | Yes |
| 4 | **"Synced" can be false.** The dot only checks whether the phone has internet, not whether the data stream is alive. | Code: `navigator.onLine`. | Partly |
| 5 | **Your phone rarely has anything to alert.** 96.2% of tagged sets were typed on your Pixel; Chamuth's phone typed 4. | 100 vs 4 sets. | No, expected |

Ruled out:
- slow uploads: every set reached the server within 3s
- multiple tabs: no overlapping sessions
- wrong owner names: each phone labels its own sets correctly

## Plan: keep the listener, add a safety net

1. **Poll every 10s while the app is visible:** "any sets newer than the last
   one I have?" An empty answer costs 1 read.
2. **On return** (screen on, app switched back, back online): poll at once and
   restart the listener.
3. **Restart a dead listener automatically**, with backoff.
4. **Catch-up toast on return:** "While you were away: Prabhashwara logged 3
   sets". This fixes #1 as far as a web page can.
5. **An honest sync dot:** green only if the server answered in the last 30s.
6. **Decide "someone else's set" by phone (`deviceId`)**, not by name.

**Cost:** about 360 reads per visible hour per phone, roughly 650 a gym day for
both of you. That's 1.3% of the 50,000 free daily reads. Naive polling, which
re-reads today's sets every 5s, would use up the free tier within an hour.

**Not covered:** alerts with the phone locked in a pocket. The user said this
isn't needed (10/21/26).

**Added while building:** the poll travels over the same connection as the
listener. A poll with no answer in 8s therefore forces a fresh connection too.
