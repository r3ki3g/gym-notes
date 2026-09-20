# Notification tone

Drop a file named exactly `notify.mp3` in this folder and it replaces the
built-in chime. No code change needed — `js/notify.js` tries this file first and
falls back to a synthesised tone if it is missing or the browser refuses it.

Keep it **short (under ~1 second) and quiet**. It fires mid-workout, and anything
longer gets annoying by the third set.

## Where to get one

- **mixkit.co/free-sound-effects/notification/** — no account, no attribution
- **pixabay.com/sound-effects/search/notification/** — no account, no attribution
- **notificationsounds.com** — built for exactly this, free
- **freesound.org** — huge library, free account, filter licence to **CC0**

## Trying several

Rename each candidate to `notify.mp3` in turn and hard-refresh. Or point
`SOUND_FILE` at the top of `js/notify.js` somewhere else while experimenting.

`.wav` and `.ogg` work too — change `SOUND_FILE` to match the extension.
