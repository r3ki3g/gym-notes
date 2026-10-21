# Search that learns your picks — spec

Built in 1.22.0.

**Idea:** each phone remembers what its owner typed and which exercise they
tapped. Next time, that exercise jumps to #1 for the same words.

**Record:** on every tap in the search results, save `typed text → exercise`
(lowercased and trimmed) with a count and when it happened. It is kept in this
phone's browser (localStorage), so it's per phone owner automatically: no
Firestore and no sharing.

**Use:**
- While typing, look for saved phrases that **start with** what's typed (2+
  letters). "lat" uses what you picked after typing "lateral".
- Their most-picked exercise, ties broken by the most recent, moves to **#1**.
  Everything else keeps today's order.
- Only if that exercise is already in the results. It never adds a non-match.

**Mistakes:** one wrong tap puts it on top, and the next right tap takes over
by recency. Counts older than 60 days are dropped. The store is capped at
200 phrases.

**Settings → Search:** "Put my usual pick first" (on), and "Show my picks". That opens a list of phrase → exercise with a Delete on each row and a Delete all.

**Size:** small. About 60 lines and tests, with no new data model.
