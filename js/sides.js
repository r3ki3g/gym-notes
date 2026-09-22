// Who appears on which side of the two-sided exercise view.
//
// Pure: no DOM, no Firestore, no globals. This is the logic that was wrong on
// 09/22/26, so it lives somewhere it can be tested — see test/sides.test.mjs.
//
// The rule, stated once:
//   LEFT  is always the person holding the phone. It never changes.
//   RIGHT is chosen from everyone else.

/**
 * @param profiles [{id, name}] every profile
 * @param owner    this device's owner name, or null
 * @param rightId  previously chosen right-hand profile id, or null
 * @returns {{mode:'none'|'single'|'dual', left, right, options}}
 */
export function layoutSides({ profiles = [], owner = null, rightId = null } = {}) {
  if (!profiles.length) return { mode: 'none', left: null, right: null, options: [] };

  // Fall back to the first profile if the owner name matches nobody — better a
  // usable screen than an empty one.
  const left = profiles.find((p) => p.name === owner) || profiles[0];
  const options = profiles.filter((p) => p.id !== left.id);

  if (!options.length) return { mode: 'single', left, right: null, options: [] };

  const right = options.find((p) => p.id === rightId) || options[0];
  return { mode: 'dual', left, right, options };
}

/**
 * The profile a set is being logged for. Always taken from the URL; `fallbackId`
 * only covers a stale or hand-edited link.
 */
export function resolveTarget(profiles = [], profileId = null, fallbackId = null) {
  return profiles.find((p) => p.id === profileId)
      || profiles.find((p) => p.id === fallbackId)
      || null;
}

/**
 * The most recent earlier day this profile trained this exercise, with every set
 * from it. Pure, so both sides of the view can use the same code path and it can
 * be tested — the previous version read a global that only ever held the active
 * profile's history, which is why only one side showed "last time".
 *
 * @param sets      any pool of set records
 * @param opts.exerciseId
 * @param opts.profileId
 * @param opts.excludeDate  usually today, so "last time" means before now
 */
export function lastSessionFor(sets = [], { exerciseId, profileId, excludeDate } = {}) {
  const prior = sets
    .filter((s) => s.exerciseId === exerciseId
                && s.profileId === profileId
                && s.date !== excludeDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!prior.length) return null;

  const date = prior[0].date;
  return {
    date,
    sets: prior
      .filter((s) => s.date === date)
      .sort((a, b) => (a.loggedAt || 0) - (b.loggedAt || 0)),
  };
}
