// Search that learns each phone's picks.
//
// People search differently: one types "lateral" for Dumbbell lateral raise,
// the other types "raise". Each phone remembers what its owner typed and which
// result they tapped; next time those words put that exercise first.
//
// Kept in this browser only (localStorage), so it is per phone owner with no
// sync. Pure, tested in test/learn.test.mjs. Spec: docs/search-learning-spec.md.

import { normalizeQuery } from './search.js';

export const MAX_PHRASES = 200;
export const EXPIRE_MS = 60 * 24 * 3600 * 1000;   // a pick older than 60 days is forgotten
export const MIN_CHARS = 2;

/** An empty store, or a stored one that may be missing or corrupt. */
export function parseStore(raw) {
  try {
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (s && typeof s.phrases === 'object' && s.phrases) return { phrases: s.phrases };
  } catch { /* fall through */ }
  return { phrases: {} };
}

/**
 * Remembers that `query` led to `exerciseId`. Returns a new store, pruned:
 * expired picks dropped, and only the MAX_PHRASES most recently used phrases kept.
 *
 * phrases: { "lateral": { "<exerciseId>": { n: 3, at: ms } } }
 */
export function recordPick(store, query, exerciseId, now) {
  const phrase = normalizeQuery(query);
  if (phrase.length < MIN_CHARS || !exerciseId) return store;

  const phrases = {};
  for (const [p, picks] of Object.entries(store.phrases)) {
    const kept = {};
    for (const [id, v] of Object.entries(picks)) if (now - v.at <= EXPIRE_MS) kept[id] = { ...v };
    if (Object.keys(kept).length) phrases[p] = kept;
  }
  const picks = phrases[phrase] || (phrases[phrase] = {});
  picks[exerciseId] = { n: (picks[exerciseId]?.n || 0) + 1, at: now };

  const lastUsed = (p) => Math.max(...Object.values(phrases[p]).map((v) => v.at));
  const order = Object.keys(phrases).sort((a, b) => lastUsed(b) - lastUsed(a));
  for (const p of order.slice(MAX_PHRASES)) delete phrases[p];
  return { phrases };
}

/**
 * The exercise to put first for what is typed so far, or null.
 *
 * The exact phrase decides when it has picks: typing "lat" and choosing Lat
 * pull down outranks picks made after typing "lateral". Otherwise every saved
 * phrase that starts with the input counts, so "lat" finds what "lateral" was
 * used for. Most picks wins; a tie goes to the most recent, so one wrong tap
 * is replaced by the next right one.
 */
export function learnedPick(store, query, now) {
  const typed = normalizeQuery(query);
  if (typed.length < MIN_CHARS) return null;

  const tally = (phrases) => {
    const t = new Map();
    for (const p of phrases) {
      for (const [id, v] of Object.entries(store.phrases[p] || {})) {
        if (now - v.at > EXPIRE_MS) continue;
        const cur = t.get(id) || { n: 0, at: 0 };
        t.set(id, { n: cur.n + v.n, at: Math.max(cur.at, v.at) });
      }
    }
    let best = null;
    for (const [id, v] of t) if (!best || v.n > best.n || (v.n === best.n && v.at > best.at)) best = { id, ...v };
    return best?.id || null;
  };

  return tally([typed]) || tally(Object.keys(store.phrases).filter((p) => p.startsWith(typed)));
}

/**
 * Everything remembered, for Settings → Search → Show my picks: phrases newest
 * first, and within each, the one search puts first at the top. Expired picks
 * are left out, as search ignores them.
 *
 * @returns [{ phrase, at, picks: [{ id, n, at }] }]
 */
export function listPicks(store, now) {
  const out = [];
  for (const [phrase, picks] of Object.entries(store.phrases)) {
    const live = Object.entries(picks)
      .filter(([, v]) => now - v.at <= EXPIRE_MS)
      .map(([id, v]) => ({ id, n: v.n, at: v.at }))
      .sort((a, b) => b.n - a.n || b.at - a.at);
    if (live.length) out.push({ phrase, at: Math.max(...live.map((x) => x.at)), picks: live });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** One phrase's picks gone; the rest untouched. */
export function forgetPhrase(store, phrase) {
  const phrases = { ...store.phrases };
  delete phrases[phrase];
  return { phrases };
}

/** How many phrases search would still use, for Settings. */
export const phraseCount = (store, now) => listPicks(store, now).length;
