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
 * Listens once: stops by itself after a short pause, or when stop() is called.
 * @param onText  (text, final) as words come in
 * @param onDone  ({ text, local, lang, alternatives } | { error })
 * @returns stop()
 */
export function listenOnce({ onText, onDone }) {
  const R = Recognition();
  if (!R) { onDone({ error: 'unsupported' }); return () => {}; }
  const lang = speechLang();
  let rec = null, stopped = false, finished = false, error = null, heard = '', local = false;
  const alternatives = [];
  const finish = (res) => { if (!finished) { finished = true; onDone(res); } };

  onDevice(R, lang).then((ok) => {
    if (stopped) return finish({ text: '' });
    local = ok;
    rec = new R();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;   // the other guesses go to the voice log
    if (ok) rec.processLocally = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          heard += e.results[i][0].transcript + ' ';
          for (let a = 1; a < e.results[i].length; a++) alternatives.push(e.results[i][a].transcript);
        }
        else interim += e.results[i][0].transcript;
      }
      onText?.((heard + interim).trim(), !interim);
    };
    rec.onerror = (e) => { error = e.error; };
    rec.onend = () => finish(error && error !== 'aborted' ? { error } : { text: heard.trim(), local, lang, alternatives });
    try { rec.start(); } catch (err) { finish({ error: 'start' }); }
  });
  return () => { stopped = true; try { rec?.stop(); } catch {} };
}
