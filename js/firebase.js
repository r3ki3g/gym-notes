// Firebase bootstrap.
//
// The apiKey is deliberately NOT in this file. Everything else is: projectId,
// appId and friends are just identifiers and leak nothing on their own.
//
// The key is pasted once per browser and kept in localStorage. This works only
// because `<project>.firebaseapp.com/__/firebase/init.json` returns 404 for this
// project — that endpoint publishes the whole config, apiKey included, the moment
// Firebase Hosting is deployed. See the warning in README.md before running
// `firebase deploy`.
//
// ESM live bindings: `db` and `auth` are null until initFirebase() runs, and
// every importer sees the assignment because store.js only touches them inside
// functions, never at module load.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const STORAGE_KEY = 'gn.apikey';
const OWNER_KEY   = 'gn.owner';

/** The access key doubles as device identity: "AIza...---Prabhashwara". */
export const KEY_DELIMITER = '---';

export function parseAccessKey(raw) {
  const i = (raw || '').indexOf(KEY_DELIMITER);
  if (i === -1) return { apiKey: (raw || '').trim(), owner: null };
  return {
    apiKey: raw.slice(0, i).trim(),
    owner:  raw.slice(i + KEY_DELIMITER.length).trim() || null,
  };
}

// Safe to publish — none of this grants access without the key.
const BASE_CONFIG = {
  authDomain: "gym-notes-cb163.firebaseapp.com",
  projectId: "gym-notes-cb163",
  storageBucket: "gym-notes-cb163.firebasestorage.app",
  messagingSenderId: "94598939237",
  appId: "1:94598939237:web:95ec9804bbb1ebad393c8c"
};

export function getStoredKey() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
export function saveKey(k) {
  try { localStorage.setItem(STORAGE_KEY, k.trim()); } catch { /* private mode */ }
}
export function clearKey() {
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(OWNER_KEY); } catch { /* ignore */ }
}

/** Who is holding this phone — distinct from whose workout is being logged. */
export function getDeviceOwner() {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
export function saveDeviceOwner(name) {
  const v = (name || '').trim();
  try {
    if (v) localStorage.setItem(OWNER_KEY, v);
    else localStorage.removeItem(OWNER_KEY);
  } catch { /* ignore */ }
}

export let db = null;
export let auth = null;

export function initFirebase(apiKey) {
  const app = initializeApp({ ...BASE_CONFIG, apiKey: apiKey.trim() });
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  auth = getAuth(app);
}

/** Resolves once anonymous sign-in completes. Rejects on a bad key. */
export function ready() {
  return new Promise((resolve, reject) => {
    if (!auth) return reject(new Error('Firebase not initialised'));
    onAuthStateChanged(auth, (user) => {
      if (user) return resolve(user);
      signInAnonymously(auth).catch(reject);
    }, reject);
  });
}

/** True when the failure is the key itself, not the network. */
export function isKeyError(err) {
  const c = err?.code || '';
  return c.includes('api-key-not-valid') || c.includes('invalid-api-key') || c === 'auth/invalid-api-key';
}
