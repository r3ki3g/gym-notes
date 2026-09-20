# Gym Notes

A single-page gym log for Prabhashwara and Chamuth, replacing the WhatsApp group.
No build step, no backend — static files on GitHub Pages, data in Firestore.

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
| `js/app.js` | State, router, views |

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
                halfReps, unilateral, support, warmup, comment, drops[]
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
