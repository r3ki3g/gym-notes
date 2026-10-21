# Voice logging: spec

Built in 1.31.0 (Settings → Pro features → Voice logging, on by default). Spec dated 10/21/26. Say "sixty kilos, twelve reps, failure" and the
set form fills itself in. You check it and tap Save.

## How voice works in a browser (the short version)

1. **The microphone.** A web page can only use the mic after the browser asks
   "Allow microphone?" and you say yes. That happens once per site, and only on
   https (GitHub Pages is https). The choice is remembered; it can be revoked
   in the browser's site settings.
2. **Speech to text.** Chrome has a speech recogniser built in (the Web Speech
   API). JavaScript says "start listening", Chrome handles the audio, and hands
   back text such as "60 kg 12 reps". We never touch raw audio: no recording,
   no files, no processing code of our own.
3. **Where it runs:**
   - **Default, cloud:** Chrome streams the audio to Google's speech service.
     It's free, with no account or API key, but it needs internet.
   - **On-device:** newer Chrome can run recognition on the phone after a
     one-time language download, so it works offline. Chrome shipped this on
     desktop. Whether your Android Chrome offers it is checked when the app
     runs.
4. **Understanding the words.** Turning "sixty kilos twelve reps failure" into
   weight 60, kg, reps 12, support failure is **our code**: a small parser,
   like the search code, fully testable.

**Cost:** none. No server, no third-party account, no Firebase reads.

## Options considered

| Option | Offline | Cost | Verdict |
|---|---|---|---|
| **Chrome's built-in recogniser** | on-device mode only | free | **Use this** |
| Speech model inside the page (Whisper or Vosk, WebAssembly) | yes, always | free, but a 40–75 MB download, slower, heavy on battery | Fallback idea only |
| Paid cloud speech API (OpenAI, Google Cloud, Deepgram) | no | pay per minute, and needs a server to hide the key | No: this app has no server |

## Design

**Where:** a mic button on the add-set form, next to the Reps field.

**Flow:**
1. Tap the mic. The button pulses while listening and keeps listening
   through pauses. It stops a set time after your last word (Settings, 3s by
   default), or on a second tap, and waits at least 6s for the first word.
2. What was heard shows live, word by word: "60 kg 12 reps failure".
3. The form fills live as you speak, and a field sweeps gold each time its
   value changes (see The fill animation). Nothing unparsed is guessed.
4. **You tap Save.** It never saves by voice, because a misheard number must
   always be visible first.

## The parser (revised 10/21/26)

It works on what was heard, after number words become digits ("sixty two
point five" becomes 62.5). One sentence can hold a whole set, including drops
and a comment.

**1. Split off the comment.** "add comment", "comment" or "note" is a
*command*. Everything after it is the comment, in your words, and the command
word itself is dropped. Nothing else becomes a comment.

**2. Split the set from its drops.** "then", "drop set", "drop to",
"dropped" and "dropped to" start a new drop. The first part is the set; each
later part is one drop, up to 3.

**3. Read each part:**

| Words | Meaning |
|---|---|
| a number with a unit: "60 lbs", "sixty kilos", "pin 7", "7 blocks" | weight and unit (kg, kilo; lb, lbs, pound; pin, block, plate) |
| a number with "reps", "times", or after "for", "x", "by" | reps |
| a bare number | the weight first, then the reps (only reps on bodyweight exercises) |
| "plus 2 halves", "2 partials", "and a half" | half reps |
| "45 seconds", "a minute 30" | hold time, on timed exercises |

**4. Flags, anywhere in the set part:**

| Say | Sets |
|---|---|
| "failure", "to failure" | support: failure |
| "spotted", "help", "supped" / "light help" | support: supported / light |
| "warm up" | warm-up toggle |
| "each side", "per side" | the side flags (with the usual confirmation) |
| "ultra slow", "slow eccentric", "good form", "struggled" | the matching quick note |

**5. Carry units forward.** A drop with no unit uses the set's unit. A set
with no unit uses the unit already in the form.

**6. Never guess.** Words that match nothing show under the form as "Didn't
catch: …" and are not saved. A drop heavier than the set is filled, but
marked in red to check.

**Examples:**

| You say | Form |
|---|---|
| "60 lbs for 10 reps then 30 lbs for 12 reps" | 60 lb × 10; drop 30 lb × 12 |
| "pin 7 for 14, drop to 5 for 10" | pin 7 × 14; drop pin 5 × 10 |
| "62.5 kg 8 reps dropped 50 for 6 then 40 for 6" | 62.5 kg × 8; drops 50 kg × 6 and 40 kg × 6 |
| "sixty kilos twelve reps failure" | 60 kg × 12, Failure |
| "40 for 12 plus 2 halves add comment wrist felt weird" | 40 × 12 + 2 half reps; comment "Wrist felt weird" |
| "warm up 20 kg 15 reps" | warm-up, 20 kg × 15 |

## The fill animation

Each field that voice fills in gets a **gold border that sweeps round it
once**: a rotating gold gradient, about 0.9s. The sweeps start one after
another, 80ms apart, in the order you spoke, so you can follow what landed
where. Drop rows slide in. Afterwards a soft gold outline stays until you edit
that field, or for 4s. With "reduce motion" on, it's a plain gold outline only.

**Language:** English, using the phone's accent setting (en-US by default,
switchable to en-GB or en-IN in Settings if recognition struggles).

**Settings → Pro features → Voice logging:** on by default. The mic button
only appears where the browser supports it.

## What can go wrong, and what we do

| Case | Behaviour |
|---|---|
| Browser without speech (Firefox, Brave) | No mic button. Brave pretends to support it and then fails, so if the first use errors we hide the button and say why. |
| Mic permission refused | "Microphone blocked: allow it in your browser's site settings". The button stays visible. |
| Offline and no on-device mode | "Voice needs internet on this phone"; typing still works. |
| Gym noise or mishearing | You see what was heard, and the form stays editable. Push-to-talk and short phrases help a lot. |
| Privacy | In cloud mode, Google processes the audio. On-device mode stays on the phone. Settings says which one is in use. |

## Testing

- **The parser:** unit tests, as with every module here. That's most of the
  real logic.
- **The recogniser:** headless Chrome has no microphone, so a fake recogniser
  feeds text in to test the form wiring.
- **One real check on each of your phones**, since only a real phone can show
  the permission prompt, the accuracy and the offline behaviour.

## Size

Medium:
- one parser module with tests (the examples above become test cases)
- the mic button and listening state
- the permission and support handling
- one setting

## Sources

- [MDN: SpeechRecognition](https://developer.mozilla.org/docs/Web/API/SpeechRecognition)
- [MDN: processLocally (on-device)](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally)
- [Chrome: Intent to Ship, on-device Web Speech API](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM/m/TQpe9shjCgAJ)
- Brave's speech gaps: [issue #2802](https://github.com/brave/brave-browser/issues/2802), [issue #55414](https://github.com/brave/brave-browser/issues/55414)
