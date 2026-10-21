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
 * @param onDone  ({ text, local, lang, alternatives } | { error })
 * @returns stop()
 */
export function listen({ silenceMs = 3000, firstWordMs = 6000, maxMs = 60000, onText, onDone }) {
  const R = Recognition();
  if (!R) { onDone({ error: 'unsupported' }); return () => {}; }
  const lang = speechLang();
  let rec = null, stopped = false, finished = false, error = null, local = false;
  let heard = '', interim = '';
  const alternatives = [];
  let silence = null, cap = null;

  const result = () => ({ text: (heard + interim).trim(), local, lang, alternatives });
  const finish = (res) => {
    if (finished) return;
    finished = true; clearTimeout(silence); clearTimeout(cap);
    onDone(res);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true; clearTimeout(silence);
    if (!rec) return finish(result());
    try { rec.stop(); } catch { finish(result()); }   // onend finishes, with the last words
  };
  const wait = (ms) => { clearTimeout(silence); silence = setTimeout(stop, ms); };

  const begin = () => {
    rec = new R();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;   // the other guesses go to the voice log
    if (local) rec.processLocally = true;
    rec.onresult = (e) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          heard += e.results[i][0].transcript + ' ';
          for (let a = 1; a < e.results[i].length; a++) alternatives.push(e.results[i][a].transcript);
        } else interim += e.results[i][0].transcript;
      }

      onText?.((heard + interim).trim());
      wait(silenceMs);
    };
    // "no-speech" is just a pause; this listener decides when the pause is over
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') error = e.error; };
    rec.onend = () => {
      if (error) return finish({ error });
      if (stopped || finished) return finish(result());
      if (interim) { heard += interim + ' '; interim = ''; }
      try { begin(); } catch { finish(result()); }   // Chrome ended on its own: carry on
    };
    try { rec.start(); } catch { finish({ error: 'start' }); }
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
