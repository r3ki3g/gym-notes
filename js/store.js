// Firestore data layer. Everything is a live subscription — a set logged on one
// phone appears on the other without a refresh, which is the WhatsApp behaviour
// we're replacing.

import { db, ready } from './firebase.js';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export const COL = {
  profiles:  'profiles',
  exercises: 'exercises',
  sets:      'sets',
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
    reps: 0,
    halfReps: 0,
    support: 'none',
    warmup: false,
    comment: '',
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
 * Reports `added` as genuinely-new document ids. Tracking ids rather than
 * trusting docChanges() matters because the offline cache delivers a snapshot
 * from disk and again from the server, both marking the same docs "added".
 */
export function watchRecent(since, onChange) {
  let stop = () => {};
  const seen = new Set();
  let primed = false;

  ready().then(() => {
    stop = onSnapshot(
      query(collection(db, COL.sets), where('date', '>=', since)),
      (snap) => {
        const all = rows(snap);
        const fresh = snap.docs.filter((d) => !seen.has(d.id)).map((d) => ({ id: d.id, ...d.data() }));
        snap.docs.forEach((d) => seen.add(d.id));
        onChange({ all, added: primed ? fresh : [] });
        primed = true;
      },
      (err) => console.error('[recent] subscription failed', err)
    );
  });
  return () => stop();
}

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
