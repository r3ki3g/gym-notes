// The browser's own speech-to-text (the Web Speech API), for voice logging.
// What the words mean is js/voice.js; this only listens.
//
// Chrome sends the audio to Google's speech service by default (free, no key,
// needs internet). Newer Chrome can recognise on the phone instead, which works
// offline: used when the browser says it is available for the language.
// Spec: docs/voice-logging-spec.md.

const Recognition = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);

/**
 * Whether the mic button should show. Brave exposes the API but never returns
 * results (its speech service is switched off), so it counts as unsupported.
 */
export function speechSupported() {
  return !!Recognition() && !(typeof navigator !== 'undefined' && navigator.brave);
}

/** English in the phone's accent if it is English, else US English. */
export const speechLang = () => (/^en\b/i.test(navigator.language || '') ? navigator.language : 'en-US');

/** True when this browser can recognise the language on the device itself. */
async function onDevice(R, lang) {
  try {
    if (typeof R.available !== 'function') return false;
    return (await R.available({ langs: [lang], processLocally: true })) === 'available';
  } catch { return false; }
}

const MESSAGES = {
  'not-allowed': 'Microphone blocked: allow it for this site in your browser settings',
  'service-not-allowed': 'Microphone blocked: allow it for this site in your browser settings',
  'audio-capture': 'No microphone found',
  'no-speech': "Didn't hear anything: tap and try again",
  'language-not-supported': "Voice isn't available for this language here",
};

/** A readable reason for a recognition error. */
export function speechError(code) {
  if (code === 'network') return navigator.onLine ? 'The voice service did not answer: try again' : 'Voice needs internet on this phone';
  return MESSAGES[code] || "Voice didn't work: try again";
}

/**
 * Listens until you stop talking: continuous recognition, ended by our own
 * timer `silenceMs` after the last word (Settings → Pro features), by stop(),
 * or after `maxMs`. Before the first word it waits longer (`firstWordMs`):
 * recalling the set you just did takes a moment. Chrome ends sessions on its
 * own after a pause; those are restarted, keeping what was heard.
 *
 * @param onText  (text so far) on every update: final words plus the guess in progress
 * @param onDone  ({ text, local, lang, alternatives, sessions } | { error })
 * @returns stop()
 */
export function listen({ silenceMs = 3000, firstWordMs = 6000, maxMs = 60000, onText, onDone }) {
  const R = Recognition();
  if (!R) { onDone({ error: 'unsupported' }); return () => {}; }
  const lang = speechLang();
  let rec = null, stopped = false, finished = false, error = null, local = false, sessions = 0;
  // text from sessions Chrome already ended, and the current session's own
  let committed = '', sessionFinal = '', sessionInterim = '';
  let alternatives = [];
  let silence = null, cap = null;

  const join = (...parts) => parts.map((x) => x.trim()).filter(Boolean).join(' ');
  const text = () => join(committed, sessionFinal, sessionInterim);
  const result = () => ({ text: text(), local, lang, alternatives, sessions });
  const finish = (res) => {
    if (finished) return;
    finished = true; clearTimeout(silence); clearTimeout(cap);
    const r = rec; rec = null;
    try { r?.abort(); } catch {}
    onDone(res);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true; clearTimeout(silence);
    if (!rec) return finish(result());
    try { rec.stop(); } catch { finish(result()); }   // onend finishes, with the last words
  };
  const wait = (ms) => { clearTimeout(silence); silence = setTimeout(stop, ms); };

  /**
   * One session's words, rebuilt from Chrome's whole list each time rather than
   * appended: on Android a later result repeats the earlier ones ("20", then
   * "20 kgs"), and appending made "20 20 kgs".
   */
  const collapse = (list) => {
    let out = '';
    for (const t of list.map((x) => x.trim()).filter(Boolean)) {
      if (!out || t.toLowerCase().startsWith(out.toLowerCase())) out = t;   // repeats what came before: replace
      else if (!out.toLowerCase().endsWith(t.toLowerCase())) out = `${out} ${t}`;
    }
    return out;
  };

  const begin = () => {
    // only ever one recogniser: a stopped one's late results or restart are
    // ignored (that was the second "process", and the second chime)
    const me = new R();
    rec = me; sessions++;
    sessionFinal = ''; sessionInterim = '';
    me.lang = lang;
    me.continuous = true;
    me.interimResults = true;
    me.maxAlternatives = 3;   // the other guesses go to the voice log
    if (local) me.processLocally = true;
    me.onresult = (e) => {
      if (rec !== me) return;
      const finals = [], interims = [];
      let alts = [];
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finals.push(res[0].transcript);
          // the other guesses for this phrase, as whole sentences with what came before
          alts = [];
          for (let a = 1; a < res.length; a++) alts.push(res[a].transcript);
          alts = alts.map((alt) => collapse([...finals.slice(0, -1), alt]));
        } else interims.push(res[0].transcript);
      }
      sessionFinal = collapse(finals);
      let interim = collapse(interims);
      // an interim that repeats the finished words: keep only what is new
      if (sessionFinal && interim.toLowerCase().startsWith(sessionFinal.toLowerCase())) interim = interim.slice(sessionFinal.length);
      sessionInterim = interim;
      if (alts.length) alternatives = alts.map((a) => join(committed, a));   // committed + this session's guess
      onText?.(text());
      wait(silenceMs);
    };
    // "no-speech" is just a pause; this listener decides when the pause is over
    me.onerror = (e) => { if (rec === me && e.error !== 'no-speech' && e.error !== 'aborted') error = e.error; };
    me.onend = () => {
      if (rec !== me) return;   // an old session ending late: not ours any more
      if (error) return finish({ error });
      committed = text(); sessionFinal = ''; sessionInterim = '';
      if (stopped || finished) return finish(result());
      // Chrome ended on its own (Android does after each phrase): carry on.
      // On Android each restart plays the start chime; it cannot be silenced.
      try { begin(); } catch { finish(result()); }
    };
    try { me.start(); } catch { finish({ error: 'start' }); }
  };

  onDevice(R, lang).then((ok) => {
    local = ok;
    if (stopped) return finish(result());
    begin();
    wait(Math.max(firstWordMs, silenceMs));
    cap = setTimeout(stop, maxMs);
  });
  return stop;
}
