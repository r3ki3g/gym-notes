// Firestore data layer. Everything is a live subscription — a set logged on one
// phone appears on the other without a refresh, which is the WhatsApp behaviour
// we're replacing.

import { db, ready } from './firebase.js';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, writeBatch, getDocs,
  getDocsFromServer, Timestamp, disableNetwork, enableNetwork
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export const COL = {
  profiles:  'profiles',
  exercises: 'exercises',
  sets:      'sets',
  usage:     'usage',
  voice:     'voiceLogs',
};

const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

function live(col, cb, ...constraints) {
  let stop = () => {};
  ready().then(() => {
    stop = onSnapshot(
      query(collection(db, col), ...constraints),
      (snap) => cb(rows(snap)),
      (err) => console.error(`[${col}] subscription failed`, err)
    );
  });
  return () => stop();
}

/* ---------- profiles ---------- */
export const watchProfiles = (cb) => live(COL.profiles, cb, orderBy('name'));
export const addProfile    = async (name) =>
  (await addDoc(collection(db, COL.profiles), { name: name.trim(), createdAt: serverTimestamp() })).id;
export const renameProfile = (id, name) => updateDoc(doc(db, COL.profiles, id), { name: name.trim() });
export const deleteProfile = (id) => deleteDoc(doc(db, COL.profiles, id));

/* ---------- exercises ---------- */
export const watchExercises = (cb) => live(COL.exercises, cb, orderBy('name'));

export function blankExercise() {
  return {
    name: '',
    muscles: [],              // ORDERED: index 0 is the dominant one
    allowedUnits: ['block'],
    defaultUnit: 'block',
    perSideDefault: false,    // weight is per side (Z-bar, bench, leg press)
    unilateralDefault: false, // reps are per side (single-arm work)
    metric: 'reps',           // 'reps' | 'time' — planks are counted in seconds
    bodyweight: false,        // no external load, so hide the weight field
    aliases: [],
    notes: '',
  };
}

export const addExercise  = async (ex) =>
  (await addDoc(collection(db, COL.exercises), { ...ex, createdAt: serverTimestamp() })).id;
export const saveExercise = (id, ex) => updateDoc(doc(db, COL.exercises, id), ex);
export const deleteExercise = (id) => deleteDoc(doc(db, COL.exercises, id));

/* ---------- sets ---------- */
// Flat collection, no session documents. A "session" is just every set sharing a
// profileId + date, which means logging a set never has to create-or-find a
// parent first — one write, works offline, no race between two phones.

export function blankSet(exercise) {
  return {
    weight: 0,
    unit: exercise?.defaultUnit || 'block',
    perSide: !!exercise?.perSideDefault,
    unilateral: !!exercise?.unilateralDefault,
    // Copied onto the set, like `unit`, so changing the exercise later cannot
    // rewrite how an existing set was counted.
    metric: exercise?.metric === 'time' ? 'time' : 'reps',
    bodyweight: !!exercise?.bodyweight,
    reps: 0,
    halfReps: 0,
    seconds: 0,
    support: 'none',
    warmup: false,
    comment: '',
    deviceId: null,  // filled at save time — which phone actually typed this
    drops: [],   // [{weight, unit, reps}] — "#8 for 7 THEN #5 for 8" is ONE set
  };
}

export const todayKey = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const watchSetsForDay = (profileId, date, cb) =>
  live(COL.sets, cb, where('profileId', '==', profileId), where('date', '==', date));

export const watchSetsForProfile = (profileId, cb) =>
  live(COL.sets, cb, where('profileId', '==', profileId));

export const addSet = async (payload) =>
  (await addDoc(collection(db, COL.sets), { ...payload, createdAt: serverTimestamp() })).id;
export const saveSet   = (id, patch) => updateDoc(doc(db, COL.sets, id), patch);
export const deleteSet = (id) => deleteDoc(doc(db, COL.sets, id));

/** YYYY-MM-DD, n days back from today. Cutoff for the shared history window. */
export function daysAgoKey(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return todayKey(d);
}

/**
 * Every set from EVERY profile within the recent window.
 *
 * Replaces an earlier today-only subscription. "Last time" has to work for both
 * sides of the exercise view, and only the active profile's full history was
 * loaded — so the other person's previous numbers were invisible.
 *
 * `where('date', '>=', since)` is a single range filter on an ISO date string,
 * which sorts lexicographically, so no composite index is needed. Bounded on
 * purpose: unbounded growth was already the one scaling worry in the README.
 *
 * Deciding what is news (a set not seen before) is the caller's job, since
 * the poll below feeds the same decision.
 *
 * `fromCache` says whether this view is only the disk cache or confirmed by
 * the server; metadata-only snapshots (a pending write landing, the server
 * catching up) are delivered too, with `changed: 0`, so the caller can tell
 * the connection is alive. `onError` fires when the listener dies — Firestore
 * never restarts a failed listener itself.
 */
export function watchRecent(since, onSnap, onError) {
  let stop = () => {};
  let stopped = false;
  ready().then(() => {
    // stopped before sign-in finished: never start (it used to start anyway,
    // leaving a second listener running)
    if (stopped) return;
    stop = onSnapshot(
      query(collection(db, COL.sets), where('date', '>=', since)),
      { includeMetadataChanges: true },
      (snap) => onSnap({ all: rows(snap), fromCache: snap.metadata.fromCache, changed: snap.docChanges().length }),
      (err) => { console.error('[recent] subscription failed', err); onError?.(err); }
    );
  }).catch((err) => onError?.(err));
  return () => { stopped = true; stop(); };
}

/**
 * The safety net under watchRecent: sets the server stored after `afterMs`
 * (server time, so phone clocks do not matter). Always from the server, never
 * the cache: the point is to catch what a stalled listener missed. An empty
 * answer costs one read.
 */
export async function setsCreatedAfter(afterMs, max = 100) {
  await ready();
  const snap = await getDocsFromServer(query(collection(db, COL.sets),
    where('createdAt', '>', Timestamp.fromMillis(afterMs)), orderBy('createdAt'), limit(max)));
  return rows(snap);
}

/**
 * Drops the connection to the server and opens a fresh one. Every listener
 * resumes from where it was, so only changed documents are re-read (within 30
 * minutes). For when the old connection may be dead without saying so: after
 * the phone slept, or when a poll got no answer.
 */
export async function reconnect() {
  await ready();
  await disableNetwork(db);
  await enableNetwork(db);
}

/* ---------- voice log ---------- */

/**
 * One document per thing voice heard: the transcript, the browser's other
 * guesses, and how it was read. Saving the set adds what was actually saved,
 * so mishearings ("ribs" for "reps") can be found and taught to the parser.
 */
export function addVoiceLog(data) {
  // the id is made here, so saving the set can update the entry even while
  // offline, before the server has seen it
  const ref = doc(collection(db, COL.voice));
  setDoc(ref, { ...data, createdAt: serverTimestamp() }).catch(() => {});
  return ref.id;
}
export const updateVoiceLog = (id, patch) => updateDoc(doc(db, COL.voice, id), patch);

/* ---------- usage ---------- */

/**
 * One document per app-open, merged into repeatedly. `merge` so the first flush
 * creates it and later ones only move the fields that changed — appending a
 * document per tick would exhaust the daily write quota from a single forgotten
 * open tab. See the note at the top of js/usage.js.
 */
export const upsertUsage = (id, data) =>
  setDoc(doc(db, COL.usage, id), data, { merge: true });

/* ---------- seeding ---------- */
export async function seedExercises(list) {
  await ready();
  const existing = await getDocs(collection(db, COL.exercises));
  if (!existing.empty) return 0; // never double-seed

  const batch = writeBatch(db);
  for (const ex of list) {
    batch.set(doc(collection(db, COL.exercises)), { ...blankExercise(), ...ex, createdAt: serverTimestamp() });
  }
  await batch.commit();
  return list.length;
}

export async function ensureSeedProfiles(names) {
  await ready();
  const existing = await getDocs(collection(db, COL.profiles));
  if (!existing.empty) return 0;
  const batch = writeBatch(db);
  for (const name of names) {
    batch.set(doc(collection(db, COL.profiles)), { name, createdAt: serverTimestamp() });
  }
  await batch.commit();
  return names.length;
}
