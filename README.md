# Spotter

A single-page gym log for Prabhashwara and Chamuth, replacing the WhatsApp group.
No build step, no backend — static files on GitHub Pages, data in Firestore.

The name is a double meaning: you spot each other on the bar, and you spot each
other's numbers. Change it in `index.html` (`<title>` and `.brand`) if something
better turns up.

## Two lists, two jobs

The **Log** tab's exercise picker and the **Exercises** library used to render
with identical cards, so tapping one in the library felt like it should start
logging. They now look deliberately different:

| | Log picker | Exercises library |
|---|---|---|
| Shape | raised cards, gaps between | flat rows, hairline dividers |
| Muscles | coloured pills | plain grey text |
| Affordance | purple `›` chevron | bordered `EDIT` tag |
| Header | — | a notice saying where to log instead |

If you add a third list later, give it its own shape too.

## Deploy

```bash
cd "Gym notes"
git init -b main
git add .
git commit -m "Gym notes SPA"
gh repo create gym-notes --public --source=. --push
```

Then: repo **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**.

Live at `https://r3ki3g.github.io/gym-notes/` in a minute or two.

> The Firebase **Authorized domains** entry must read exactly `r3ki3g.github.io`
> (no trailing space) or anonymous sign-in fails on the live site while still
> working on `localhost`.

## Access key

The Firebase `apiKey` is **not in this repo**. Everything else in the config is —
`projectId`, `appId` and the rest are identifiers that grant nothing alone.

On first run each browser shows an unlock screen. Paste the key once; it goes to
`localStorage` and stays on that device. Nobody reading this public source can
reach the database without it.

### Key format carries device identity

Append `---YourName` so the app knows whose phone it is:

```
AIzaSy...---Prabhashwara
```

Parsed on unlock and stored separately. Without the suffix the app asks once with
a picker instead. Change it any time under **Profiles → This phone belongs to**.

### ⚠️ Never run `firebase deploy`

Deploying Firebase Hosting makes the project serve its **entire config, apiKey
included**, at `https://gym-notes-cb163.firebaseapp.com/__/firebase/init.json` —
publicly, with no auth. That single command undoes the whole scheme. Verified
404 today (09/20/26), and it must stay that way. GitHub Pages hosts this app;
Firebase Hosting must stay unused.

### Also worth doing

In Google Cloud Console → **APIs & Services → Credentials**, restrict the key to
the HTTP referrer `r3ki3g.github.io/*`. Then even a leaked key only works from
your own domain.

### If the key leaks

Regenerate it in the same console screen, then re-paste the new one on both
phones. There is no per-person revocation — it is one shared secret, so losing it
means rotating it for everyone.

### Storage caveat

`localStorage` is not permanent. iOS Safari can evict it after about 7 days
without a visit, and clearing browsing data wipes it. Expect to re-paste the key
occasionally. Keep it somewhere you can reach from your phone.

**Profiles → Forget key on this device** clears it deliberately — use that before
handing your phone to anyone.

Local dev: `python3 -m http.server 8777` then open `http://localhost:8777`.

## Layout

| File | What it does |
|---|---|
| `index.html` | Shell: top bar, view container, bottom tabs |
| `styles.css` | Mobile-first dark theme |
| `js/firebase.js` | Init, anonymous auth, Firestore with offline cache, key storage |
| `js/store.js` | Collections, CRUD, live subscriptions |
| `js/search.js` | Exercise ranking (muscle priority → name → alias) |
| `js/units.js` | Blocks / kg / lb, conversion, formatting |
| `js/seed.js` | 34 exercises lifted from the chat log |
| `js/ui.js` | DOM helpers, toast, modals |
| `js/notify.js` | Activity chime, sound preference, synth fallback |
| `js/app.js` | State, router, views |

## Logging on someone else's behalf

You two log each other's sets, so the app tracks two different people per entry:
the **profile** (whose workout) and **`enteredBy`** (who typed it).

When they differ:

- the profile chip in the top bar turns **gold**
- a banner reads `⚠️ You are logging for Chamuth — despite actually being Prabhashwara`
- **every save shows a full-screen confirm with one big OK button**
- the set renders a gold `entered by Prabhashwara` tag, in today's log and in history

The confirm fires on *every* cross-profile set, by explicit request — post-workout
nobody reads carefully, and a set written to the wrong person costs more than one
extra tap. Cancel stays deliberately small but exists, or the confirmation would
be theatre.

## Activity nudge

When the other person logs a set, a small toast appears and a short tone plays.
Your own entries never notify you.

**No polling.** `onSnapshot` is a live socket push, so the nudge arrives the
instant the write lands and costs nothing beyond reading the document itself. A
5-second poll would be both slower and far more expensive.

It needs its own subscription because the main one only follows the *active*
profile — Chamuth logging his own workout never reaches a phone showing
Prabhashwara. `watchActivity()` in `js/store.js` watches today's sets across all
profiles and reports only genuinely new IDs, which keeps the offline cache's
double delivery (once from disk, once from the server) from firing twice.

Rate limited to one tone per 15 seconds and coalesced, so a burst of entries is
one toast, not six. The toast shows for 3 seconds.

The **Alerts** tab keeps the same events as a feed with relative timestamps
(`5s ago`, `12m ago`), derived from today's sets rather than stored separately —
an activity collection would mean a second write per set for information the set
already carries. A gold badge on the tab counts unread ones and clears on open.

Two independent switches in **Settings → Alerts**:

| | Toast | Tone | Alerts tab |
|---|---|---|---|
| Both on | yes | yes | fills |
| Sound off | yes | no | fills |
| Notifications off | no | no | fills |

**Vibrate** is a third switch, shown only where the browser supports it. iOS
Safari has never implemented the Vibration API, so iPhones get a greyed-out
"N/A" row instead of a toggle that would silently do nothing.

Tone and buzz share one rate limit, so a burst of sets cannot become a stutter
of pulses.

### Why vibration is foreground-only

The spec has user agents drop vibration requests while `document.hidden` is
true, and `buzz()` checks that before calling. This holds **even in browsers
that keep audio alive in the background**, such as Brave on Android: background
media playback keeps the audio pipeline running, it does not make the page
visible. Audio has a real chance of still sounding; vibration does not.

For a buzz with the phone locked you need Web Push and a service worker, not
this API.

The feed is history, not an interruption, so it fills regardless.

Tone: drop `sounds/notify.mp3` in to replace the built-in chime — see
`sounds/README.md`. Without a file it synthesises a rising fifth through Web
Audio, so it works with nothing installed. The element is preloaded and reused,
so the first chime of a session doesn't wait on the download.

## Boot splash

The wordmark under a travelling gold shine, a glinting `PRO` plate, a hairline
indeterminate progress sweep, and a status line (`connecting…` →
`loading exercises…` → `almost there…`).

Shine and glint run at 2.8s — exactly two 1.4s progress sweeps — so they stay in
phase instead of drifting against each other.

It lives in `index.html`, not in JavaScript, so it paints on the first frame —
before the module graph loads and well before anonymous auth returns. Removing
it from JS would leave the ~500ms auth round trip showing an empty page.

A 12-second failsafe swaps the text for `still trying — check your connection`,
because a first-ever load on gym wifi can hang on auth with nothing to explain
itself. Honours `prefers-reduced-motion`.

## Layout note

`body` carries ~160px of bottom padding: 68px for the tab bar plus a clear lane
for the toast. Without it a toast can sit on top of the last button on a page
with no way to scroll past it.

## Data model

Four collections, flat. `sets` has no parent `session` document — a session is
just every set sharing a `profileId` + `date`. That means logging a set is one
write with no create-or-find step, which keeps it working offline and removes
any race when both phones write at once.

```
profiles/{id}   name
exercises/{id}  name, muscles[] (ORDERED), allowedUnits[], defaultUnit,
                perSideDefault, unilateralDefault, aliases[]
sets/{id}       profileId, exerciseId, date, weight, unit, perSide, reps,
                halfReps, unilateral, support, warmup, comment, drops[],
                enteredBy   <- who physically typed it
```

### The two meanings of "each side"

The chat log uses the phrase for two unrelated things, so they are separate fields:

- **`perSide`** — *weight* per side. `15kg each side` on a Z-bar is 30 kg loaded.
- **`unilateral`** — *reps* per side. `#3 for 12 reps each side` is one arm at a time.

Collapsing them would make volume totals wrong in both directions.

### Units

`block` (`#5`) is **not convertible**. The printed weights on those machines are
worn off, so the stack position means nothing outside that one machine. Graphs
exclude block-based sets from volume rather than pretending they're kilograms.
`kg` and `lb` convert freely, and the unit is stored **per set**, so dumbbell
work can mix both and old entries stay truthful if the default changes later.

### Drop sets

`#8 for 7 reps THEN #5 for 8` is **one** set with a `drops[]` entry, not two sets.
Logging it as two would inflate the set count and break any per-set progression.

Each drop stores its **own unit**, because on a dumbbell exercise you really can
drop from 20 lb to 7.5 kg — that's just what's on the rack. `setVolumeKg()` in
`js/units.js` converts each component separately and returns `null` if any part
of the set is block-based, so a drop set is never counted as a partial figure.

## Search

Typing `tricep` ranks tricep-*dominant* exercises above ones where triceps is
merely involved, because `muscles[]` is ordered and index 0 scores 100 against
index 2's 33. Every query token must match something, so `tricep extension`
narrows from 11 hits to 6 — keeping both the machine and the dumbbell version,
told apart by name. `db` → `dumbbell`, `cabel` → `cable` and friends are in the
synonym table in `js/search.js`.

## Known limits

- **Read volume grows unbounded.** The app subscribes to every set for the active
  profile. At roughly 60 sets/session, twice a week, that's about 6,240 sets/year
  — a cold load of 6,240 reads, or 12.5% of the free tier's 50,000/day. The
  offline cache makes every load after the first nearly free, so this is fine for
  now, but if it ever bites, bound the query to the last 120 days.
- **The key is a shared bearer token.** Anyone holding it has full read/write.
  That is the accepted trade for not wanting a sign-in screen; Google Sign-In with
  the two UIDs pinned in the rules is the stronger option if that ever changes.
- **No import of the old WhatsApp history.** `chat.txt` is still just a file.
- **No graphs yet.** `normalizedKg()` and `totalReps()` in `js/units.js` are the
  hooks for it; History already computes per-day volume with them.
