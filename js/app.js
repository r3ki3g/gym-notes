import { ready, initFirebase, getStoredKey, saveKey, clearKey, isKeyError } from './firebase.js';
import * as S from './store.js';
import { SEED_EXERCISES, SEED_PROFILES } from './seed.js';
import { searchExercises, MUSCLES } from './search.js';
import { UNITS, formatLoad, formatReps, setVolumeKg, SUPPORT } from './units.js';
import { el, clear, toast, confirmSheet, promptSheet, segmented, field, dayLabel } from './ui.js';

/* ============================ state ============================ */

const state = {
  profiles: [],
  exercises: [],
  sets: [],                 // every set for the active profile
  profileId: localStorage.getItem('gn.profile') || null,
  loaded: { profiles: false, exercises: false, sets: false },
};

let unsubSets = () => {};

// True once the user has touched the set form. A snapshot arriving from the
// other person's phone must not rebuild the DOM and wipe half-typed input —
// both of us log at the same time, so this happens constantly in practice.
let formDirty = false;
const viewEl = () => document.getElementById('view');
const activeProfile = () => state.profiles.find((p) => p.id === state.profileId) || null;
const exerciseById = (id) => state.exercises.find((e) => e.id === id);

function setProfile(id) {
  state.profileId = id;
  if (id) localStorage.setItem('gn.profile', id); else localStorage.removeItem('gn.profile');
  unsubSets();
  state.sets = [];
  state.loaded.sets = false;
  if (id) {
    unsubSets = S.watchSetsForProfile(id, (rows) => {
      state.sets = rows;
      state.loaded.sets = true;
      renderFromData();
    });
  }
  render();
}

/* ============================ routing ============================ */

const route = () => (location.hash || '#/log').slice(2).split('/');
const go = (path) => { location.hash = '#/' + path; };

window.addEventListener('hashchange', () => { formDirty = false; render(); });

/**
 * Re-render triggered by a Firestore snapshot rather than by navigation.
 * Skipped while the set form holds unsaved input; the next explicit render
 * (save, or leaving the screen) picks the new data up.
 */
function renderFromData() {
  if (route()[0] === 'set' && formDirty) return;
  render();
}

/* ============================ chrome ============================ */

function paintTopbar() {
  const btn = document.getElementById('profile-switch');
  const p = activeProfile();
  btn.textContent = p ? p.name : 'Choose person';
  btn.onclick = () => go('profiles');

  const tab = route()[0];
  for (const b of document.querySelectorAll('#tabs button')) {
    b.classList.toggle('active', b.dataset.route === tab);
    b.onclick = () => go(b.dataset.route);
  }
}

function paintSync(online) {
  const s = document.getElementById('sync');
  s.className = 'sync ' + (online ? 'on' : 'off');
  s.querySelector('.sync-label').textContent = online ? 'Synced' : 'Offline';
}
window.addEventListener('online',  () => paintSync(true));
window.addEventListener('offline', () => paintSync(false));

/* ============================ render ============================ */

function render() {
  paintTopbar();
  formDirty = false;
  const v = clear(viewEl());
  const [tab, arg] = route();

  if (!state.loaded.profiles || !state.loaded.exercises) {
    return v.append(el('div', { class: 'empty' }, 'Loading…'));
  }

  switch (tab) {
    case 'profiles':  return viewProfiles(v);
    case 'search':    return viewSearch(v);
    case 'set':       return viewLogSet(v, arg);
    case 'history':   return viewHistory(v);
    case 'exercises': return arg ? viewExerciseEditor(v, arg) : viewExercisePool(v);
    default:          return viewLog(v);
  }
}

/* ============================ people ============================ */

function viewProfiles(v) {
  v.append(el('h2', {}, 'Who are we logging for?'));

  for (const p of state.profiles) {
    v.append(el('div', { class: 'card row spread' },
      el('button', {
        class: 'grow', style: 'background:none;border:0;text-align:left;font-weight:600;font-size:1.05rem',
        onClick: () => { setProfile(p.id); go('log'); },
      }, p.name + (p.id === state.profileId ? '  ✓' : '')),
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', onClick: async () => {
          const name = await promptSheet('Rename', p.name);
          if (name) { await S.renameProfile(p.id, name); toast('Renamed'); }
        } }, 'Edit'),
        el('button', { class: 'btn sm danger', onClick: async () => {
          const setCount = state.sets.filter((s) => s.profileId === p.id).length;
          const ok = await confirmSheet(`Delete ${p.name}?`,
            setCount ? `Their ${setCount} logged sets stay in the database but become orphaned.` : 'No sets logged yet.');
          if (!ok) return;
          await S.deleteProfile(p.id);
          if (state.profileId === p.id) setProfile(null);
          toast('Deleted');
        } }, '✕')
      )
    ));
  }

  v.append(el('button', { class: 'btn primary block', style: 'margin-top:12px', onClick: async () => {
    const name = await promptSheet('Add person', '', 'Name');
    if (!name) return;
    const id = await S.addProfile(name);
    setProfile(id);
    toast(`${name} added`);
    go('log');
  } }, '+ Add person'));

  v.append(el('button', { class: 'btn block danger', style: 'margin-top:26px', onClick: async () => {
    const ok = await confirmSheet('Forget key on this device?',
      'You will need to paste it again next time. Use this before handing the phone to anyone.',
      'Forget');
    if (ok) { clearKey(); location.reload(); }
  } }, 'Forget key on this device'));

}

/* ============================ today's log ============================ */

function groupIntoExercises(sets) {
  // Sets are flat; group by exercise preserving first-logged order.
  const order = [];
  const byEx = new Map();
  const sorted = [...sets].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  for (const s of sorted) {
    if (!byEx.has(s.exerciseId)) { byEx.set(s.exerciseId, []); order.push(s.exerciseId); }
    byEx.get(s.exerciseId).push(s);
  }
  return order.map((id) => ({ exerciseId: id, sets: byEx.get(id) }));
}

function setLine(s, index, opts = {}) {
  const sup = SUPPORT[s.support] || SUPPORT.none;
  const load = el('span', { class: 'load' }, formatLoad(s.weight, s.unit, s.perSide));

  const main = el('div', { class: 'set-main' },
    el('div', { class: 'row wrap', style: 'gap:6px;align-items:baseline' },
      load,
      el('span', { class: 'muted' }, 'for ' + formatReps(s)),
      s.support !== 'none' ? el('span', { class: 'tiny ' + sup.cls }, sup.label) : null,
      s.warmup ? el('span', { class: 'pill warmup' }, 'warm-up') : null
    )
  );

  for (const d of s.drops || []) {
    main.append(el('div', { class: 'tiny drop' },
      '↳ then ' + formatLoad(d.weight, d.unit, s.perSide) + ' for ' + d.reps + (d.halfReps ? ` + ${d.halfReps} half` : '') + ' reps'));
  }
  if (s.comment) main.append(el('div', { class: 'cmt' }, s.comment));

  return el('div', { class: 'set-line' },
    el('span', { class: 'set-no' }, s.warmup ? 'W' : `${index}.`),
    main,
    opts.onDelete ? el('button', { class: 'btn sm danger', onClick: opts.onDelete }, '✕') : null
  );
}

function viewLog(v) {
  const p = activeProfile();
  if (!p) {
    return v.append(el('div', { class: 'empty' },
      'No one selected.', el('br'),
      el('button', { class: 'btn primary', style: 'margin-top:14px', onClick: () => go('profiles') }, 'Choose a person')));
  }

  const today = S.todayKey();
  const todaySets = state.sets.filter((s) => s.date === today);

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:12px' },
    el('h2', { style: 'margin:0' }, `${p.name} · Today`),
    el('span', { class: 'tiny faint' }, `${todaySets.length} set${todaySets.length === 1 ? '' : 's'}`)
  ));

  v.append(el('button', { class: 'btn primary block', style: 'margin-bottom:14px', onClick: () => go('search') },
    '+ Log a set'));

  if (!todaySets.length) {
    v.append(el('div', { class: 'empty' }, 'Nothing logged today.', el('br'), 'Hit the button above to start.'));
    return;
  }

  for (const grp of groupIntoExercises(todaySets)) {
    const ex = exerciseById(grp.exerciseId);
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'row spread', style: 'margin-bottom:6px' },
      el('strong', { class: 'grow' }, ex ? ex.name : '(deleted exercise)'),
      el('button', { class: 'btn sm', onClick: () => go('set/' + grp.exerciseId) }, '+ set')
    ));

    let n = 0;
    for (const s of grp.sets) {
      if (!s.warmup) n++;
      card.append(setLine(s, n, {
        onDelete: async () => {
          if (await confirmSheet('Delete this set?', formatLoad(s.weight, s.unit, s.perSide) + ' for ' + formatReps(s))) {
            await S.deleteSet(s.id); toast('Set deleted');
          }
        }
      }));
    }
    v.append(card);
  }
}

/* ============================ exercise search ============================ */

function viewSearch(v) {
  const input = el('input', { placeholder: 'Search — try "tricep" or "incline db"', autocomplete: 'off' });
  const results = el('div');

  const paint = () => {
    clear(results);
    const hits = searchExercises(state.exercises, input.value);
    if (!hits.length) {
      results.append(el('div', { class: 'empty' }, 'No match.'));
    }
    for (const ex of hits.slice(0, 40)) {
      results.append(el('button', { class: 'result', onClick: () => go('set/' + ex.id) },
        el('div', { class: 'grow' },
          el('div', { class: 'name' }, ex.name),
          el('div', { class: 'row wrap', style: 'gap:4px;margin-top:4px' },
            ...(ex.muscles || []).slice(0, 3).map((m, i) =>
              el('span', { class: 'pill' + (i === 0 ? ' primary-muscle' : '') }, m))
          )
        ),
        el('span', { class: 'tiny faint' }, (ex.allowedUnits || []).map((u) => UNITS[u]?.label).join('/'))
      ));
    }
  };

  input.addEventListener('input', paint);

  // "+" sits beside the search box rather than under the results: with 34
  // exercises the bottom of the list is a long scroll away on a phone.
  v.append(
    el('h2', {}, 'Pick an exercise'),
    el('div', { class: 'row' },
      el('div', { class: 'grow' }, input),
      el('button', {
        class: 'btn', style: 'min-width:var(--tap);padding:0;font-size:1.3rem;line-height:1',
        title: 'New exercise', 'aria-label': 'New exercise',
        onClick: () => go('exercises/new'),
      }, '+')
    ),
    el('div', { style: 'height:12px' }),
    results
  );

  paint();
  setTimeout(() => input.focus(), 30);
}

/* ============================ log a set ============================ */

/** Most recent previous day this profile trained this exercise. */
function lastTime(exerciseId, excludeDate) {
  const prior = state.sets
    .filter((s) => s.exerciseId === exerciseId && s.date !== excludeDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!prior.length) return null;
  const d = prior[0].date;
  return { date: d, sets: prior.filter((s) => s.date === d) };
}

function viewLogSet(v, exerciseId) {
  const ex = exerciseById(exerciseId);
  const p = activeProfile();
  if (!ex || !p) return go('log');

  const today = S.todayKey();
  const draft = S.blankSet(ex);

  // Carry the last set's load forward — you almost always repeat or nudge it.
  const todays = state.sets
    .filter((s) => s.exerciseId === exerciseId && s.date === today)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const prev = todays[todays.length - 1] || lastTime(exerciseId, today)?.sets?.slice(-1)[0];
  if (prev) {
    draft.weight = prev.weight; draft.unit = prev.unit;
    draft.perSide = prev.perSide; draft.unilateral = prev.unilateral;
    draft.reps = prev.reps;
  }

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:4px' },
    el('h2', { style: 'margin:0' }, ex.name),
    el('button', { class: 'btn sm', onClick: () => go('exercises/' + ex.id) }, 'Edit')
  ));
  v.append(el('div', { class: 'tiny faint', style: 'margin-bottom:12px' }, (ex.muscles || []).join(' → ')));

  // --- what you did last time ---
  const lt = lastTime(exerciseId, today);
  if (lt) {
    const box = el('div', { class: 'lasttime' },
      el('div', { class: 'tiny faint', style: 'margin-bottom:4px' }, 'Last time · ' + dayLabel(lt.date)));
    lt.sets.forEach((s, i) => box.append(el('div', {},
      el('span', { class: 'load' }, formatLoad(s.weight, s.unit, s.perSide)),
      el('span', { class: 'muted' }, ' × ' + formatReps(s)))));
    v.append(box);
  }

  // --- today's sets so far ---
  if (todays.length) {
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'tiny faint', style: 'margin-bottom:4px' }, 'Today so far'));
    let n = 0;
    todays.forEach((s) => { if (!s.warmup) n++; card.append(setLine(s, n, {
      onDelete: async () => { if (await confirmSheet('Delete this set?')) { await S.deleteSet(s.id); toast('Deleted'); } }
    })); });
    v.append(card);
  }

  // --- the form ---
  const form = el('div', { class: 'card' });
  const rerender = () => { render(); };

  const weightInput = el('input', { type: 'number', step: '0.5', inputmode: 'decimal', value: draft.weight || '' });
  const repsInput   = el('input', { type: 'number', inputmode: 'numeric', value: draft.reps || '' });
  const halfInput   = el('input', { type: 'number', inputmode: 'numeric', value: draft.halfReps || '' });
  const commentBox  = el('textarea', { placeholder: 'Form, struggle, spotter, banter…' });

  const unitOpts = (ex.allowedUnits || ['block']).map((u) => ({ key: u, label: UNITS[u].label }));
  const unitRow = el('div');
  const paintUnits = () => {
    clear(unitRow).append(segmented(unitOpts, draft.unit, (k) => { draft.unit = k; paintUnits(); }));
  };
  paintUnits();

  const supportRow = el('div');
  const paintSupport = () => {
    clear(supportRow).append(segmented(
      Object.values(SUPPORT).map((s) => ({ key: s.key, label: s.label })),
      draft.support, (k) => { draft.support = k; paintSupport(); }));
  };
  paintSupport();

  const toggle = (labelText, key, hint) => {
    const btn = el('button', { type: 'button', class: 'btn sm', onClick: () => {
      draft[key] = !draft[key];
      btn.classList.toggle('primary', draft[key]);
    } }, labelText);
    btn.classList.toggle('primary', draft[key]);
    return el('div', { class: 'grow' }, btn, hint ? el('div', { class: 'tiny faint', style: 'margin-top:3px' }, hint) : null);
  };

  form.append(
    el('div', { class: 'row' },
      el('div', { class: 'grow' }, field('Weight', weightInput)),
      el('div', { class: 'grow' }, field('Unit', unitRow))
    ),
    el('div', { class: 'row' },
      el('div', { class: 'grow' }, field('Reps', repsInput)),
      el('div', { class: 'grow' }, field('Half reps', halfInput))
    ),
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      toggle('kg/side', 'perSide', 'weight per side'),
      toggle('Each side', 'unilateral', 'reps per side'),
      toggle('Warm-up', 'warmup', 'excluded from PRs')
    ),
    field('Support', supportRow),
    field('Comment', commentBox)
  );

  // --- drop sets: "#8 for 7 THEN #5 for 8" is one set, not two ---
  // Each drop carries its own unit. On a dumbbell exercise you can genuinely
  // drop from 20 lb to 7.5 kg, because that's what's on the rack.
  const dropsWrap = el('div');
  const paintDrops = () => {
    clear(dropsWrap);

    draft.drops.forEach((d, i) => {
      const unitPicker = segmented(unitOpts, d.unit, (k) => { d.unit = k; paintDrops(); });

      dropsWrap.append(el('div', {
        class: 'card', style: 'background:var(--panel-2);margin-bottom:10px'
      },
        el('div', { class: 'row spread', style: 'margin-bottom:8px' },
          el('span', { class: 'tiny faint' }, `Drop ${i + 1}`),
          el('button', { class: 'btn sm danger', onClick: () => { draft.drops.splice(i, 1); paintDrops(); } }, '✕')
        ),
        el('div', { class: 'row' },
          el('div', { class: 'grow' }, field('Weight', el('input', {
            type: 'number', step: '0.5', inputmode: 'decimal', value: d.weight || '',
            onInput: (e) => { d.weight = parseFloat(e.target.value) || 0; } }))),
          el('div', { class: 'grow' }, field('Unit', unitPicker))
        ),
        el('div', { class: 'row' },
          el('div', { class: 'grow' }, field('Reps', el('input', {
            type: 'number', inputmode: 'numeric', value: d.reps || '',
            onInput: (e) => { d.reps = parseInt(e.target.value) || 0; } }))),
          el('div', { class: 'grow' }, field('Half reps', el('input', {
            type: 'number', inputmode: 'numeric', value: d.halfReps || '',
            onInput: (e) => { d.halfReps = parseInt(e.target.value) || 0; } })))
        )
      ));
    });

    dropsWrap.append(el('button', { class: 'btn sm', onClick: () => {
      // Inherit the unit from the last drop, or the parent set if this is the first.
      const last = draft.drops[draft.drops.length - 1];
      draft.drops.push({ weight: 0, unit: last ? last.unit : draft.unit, reps: 0, halfReps: 0 });
      paintDrops();
    } }, '+ Drop'));
  };
  paintDrops();
  form.append(el('h3', {}, 'Drop set'), dropsWrap);

  form.addEventListener('input',  () => { formDirty = true; });
  form.addEventListener('change', () => { formDirty = true; });
  v.append(form);

  v.append(el('button', { class: 'btn primary block', onClick: async () => {
    const weight = parseFloat(weightInput.value);
    const reps = parseInt(repsInput.value);
    if (isNaN(weight) || isNaN(reps) || reps <= 0) return toast('Need a weight and reps');

    const payload = {
      ...draft,
      profileId: p.id,
      exerciseId: ex.id,
      date: today,
      weight,
      reps,
      halfReps: parseInt(halfInput.value) || 0,
      comment: commentBox.value.trim(),
      drops: draft.drops.filter((d) => d.reps > 0),
    };
    await S.addSet(payload);
    toast('Set logged');
    rerender();
  } }, 'Save set'));

  v.append(el('button', { class: 'btn block', style: 'margin-top:8px', onClick: () => go('log') }, 'Done'));
}

/* ============================ history ============================ */

function viewHistory(v) {
  const p = activeProfile();
  if (!p) return v.append(el('div', { class: 'empty' }, 'Pick a person first.'));

  const byDate = new Map();
  for (const s of state.sets) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  v.append(el('h2', {}, `${p.name} · History`));
  if (!dates.length) return v.append(el('div', { class: 'empty' }, 'Nothing logged yet.'));

  for (const date of dates) {
    const sets = byDate.get(date);
    const working = sets.filter((s) => !s.warmup);

    // Tonnage only counts sets we can actually compare — block machines are excluded
    // rather than silently treated as kilograms.
    let kg = 0, comparable = 0;
    for (const s of working) {
      const v = setVolumeKg(s);
      if (v !== null) { kg += v; comparable++; }
    }

    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'row spread' },
      el('strong', {}, dayLabel(date)),
      el('span', { class: 'tiny faint' }, `${working.length} sets`)
    ));
    if (comparable) {
      card.append(el('div', { class: 'tiny muted', style: 'margin-top:2px' },
        `${Math.round(kg).toLocaleString('en-US')} kg total volume` +
        (comparable < working.length ? ` · ${working.length - comparable} block-based sets excluded` : '')));
    }

    const names = groupIntoExercises(sets).map((g) => exerciseById(g.exerciseId)?.name || '?');
    card.append(el('div', { class: 'tiny faint', style: 'margin-top:6px' }, names.join(' · ')));

    const detail = el('div', { style: 'display:none' });
    for (const grp of groupIntoExercises(sets)) {
      detail.append(el('div', { style: 'margin-top:10px' },
        el('div', { class: 'tiny muted' }, exerciseById(grp.exerciseId)?.name || '(deleted)')));
      let n = 0;
      grp.sets.forEach((s) => { if (!s.warmup) n++; detail.append(setLine(s, n)); });
    }
    card.append(el('button', { class: 'btn sm', style: 'margin-top:8px', onClick: (e) => {
      const open = detail.style.display !== 'none';
      detail.style.display = open ? 'none' : 'block';
      e.target.textContent = open ? 'Show sets' : 'Hide sets';
    } }, 'Show sets'), detail);

    v.append(card);
  }
}

/* ============================ exercise pool ============================ */

function viewExercisePool(v) {
  const input = el('input', { placeholder: 'Filter…', autocomplete: 'off' });
  const list = el('div');

  const paint = () => {
    clear(list);
    for (const ex of searchExercises(state.exercises, input.value)) {
      list.append(el('button', { class: 'result', onClick: () => go('exercises/' + ex.id) },
        el('div', { class: 'grow' },
          el('div', { class: 'name' }, ex.name),
          el('div', { class: 'row wrap', style: 'gap:4px;margin-top:4px' },
            ...(ex.muscles || []).map((m, i) => el('span', { class: 'pill' + (i === 0 ? ' primary-muscle' : '') }, m)))
        ),
        el('span', { class: 'tiny faint' }, (ex.allowedUnits || []).map((u) => UNITS[u]?.label).join('/'))
      ));
    }
  };
  input.addEventListener('input', paint);

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:10px' },
    el('h2', { style: 'margin:0' }, 'Exercise pool'),
    el('span', { class: 'tiny faint' }, `${state.exercises.length}`)
  ));
  v.append(input, el('div', { style: 'height:12px' }), list);
  v.append(el('button', { class: 'btn primary block', style: 'margin-top:8px', onClick: () => go('exercises/new') },
    '+ New exercise'));
  paint();
}

function viewExerciseEditor(v, id) {
  const isNew = id === 'new';
  const src = isNew ? S.blankExercise() : exerciseById(id);
  if (!src) return go('exercises');
  const ex = JSON.parse(JSON.stringify({ ...S.blankExercise(), ...src }));
  delete ex.id;

  v.append(el('h2', {}, isNew ? 'New exercise' : 'Edit exercise'));

  const nameInput = el('input', { value: ex.name, placeholder: 'e.g. Overhead tricep extension (rope)' });
  v.append(field('Name', nameInput));

  // --- ordered muscles: position 1 is the dominant one and drives search rank ---
  const musclesWrap = el('div');
  const paintMuscles = () => {
    clear(musclesWrap);
    ex.muscles.forEach((m, i) => {
      musclesWrap.append(el('div', { class: 'row', style: 'margin-bottom:6px' },
        el('span', { class: 'pill' + (i === 0 ? ' primary-muscle' : ''), style: 'min-width:30px;text-align:center' }, `${i + 1}`),
        el('span', { class: 'grow' }, m),
        el('button', { class: 'btn sm', disabled: i === 0, onClick: () => {
          [ex.muscles[i - 1], ex.muscles[i]] = [ex.muscles[i], ex.muscles[i - 1]]; paintMuscles();
        } }, '↑'),
        el('button', { class: 'btn sm', disabled: i === ex.muscles.length - 1, onClick: () => {
          [ex.muscles[i + 1], ex.muscles[i]] = [ex.muscles[i], ex.muscles[i + 1]]; paintMuscles();
        } }, '↓'),
        el('button', { class: 'btn sm danger', onClick: () => { ex.muscles.splice(i, 1); paintMuscles(); } }, '✕')
      ));
    });

    const picker = el('select', {},
      el('option', { value: '' }, '+ add muscle…'),
      ...MUSCLES.filter((m) => !ex.muscles.includes(m)).map((m) => el('option', { value: m }, m))
    );
    picker.addEventListener('change', () => {
      if (picker.value) { ex.muscles.push(picker.value); paintMuscles(); }
    });
    musclesWrap.append(picker);
  };
  paintMuscles();
  v.append(el('h3', {}, 'Muscles — first is dominant'), musclesWrap);

  // --- units ---
  const unitsWrap = el('div');
  const paintUnits = () => {
    clear(unitsWrap);
    const row = el('div', { class: 'row wrap' });
    for (const u of Object.values(UNITS)) {
      const on = ex.allowedUnits.includes(u.key);
      row.append(el('button', { class: 'btn sm' + (on ? ' primary' : ''), onClick: () => {
        if (on) {
          if (ex.allowedUnits.length === 1) return toast('Need at least one unit');
          ex.allowedUnits = ex.allowedUnits.filter((k) => k !== u.key);
        } else ex.allowedUnits.push(u.key);
        if (!ex.allowedUnits.includes(ex.defaultUnit)) ex.defaultUnit = ex.allowedUnits[0];
        paintUnits();
      } }, u.name));
    }
    unitsWrap.append(row);
    unitsWrap.append(el('div', { class: 'tiny faint', style: 'margin:8px 0 4px' }, 'Default'));
    unitsWrap.append(segmented(
      ex.allowedUnits.map((k) => ({ key: k, label: UNITS[k].label })),
      ex.defaultUnit, (k) => { ex.defaultUnit = k; paintUnits(); }));
  };
  paintUnits();
  v.append(el('h3', {}, 'Units of measure'), unitsWrap);

  const mkToggle = (labelText, key, hint) => {
    const btn = el('button', { class: 'btn' + (ex[key] ? ' primary' : ''), onClick: () => {
      ex[key] = !ex[key]; btn.classList.toggle('primary', ex[key]);
    } }, labelText);
    return el('div', { style: 'margin-bottom:8px' }, btn, el('div', { class: 'tiny faint', style: 'margin-top:3px' }, hint));
  };
  v.append(el('h3', {}, 'Defaults'),
    mkToggle('Weight is per side', 'perSideDefault', 'Z-bar, bench, leg press — "15 kg each side"'),
    mkToggle('Reps are per side', 'unilateralDefault', 'Single-arm work — "12 reps each side"'));

  const aliasInput = el('input', { value: (ex.aliases || []).join(', '), placeholder: 'db press, incline db' });
  v.append(el('h3', {}, 'Search aliases'), aliasInput,
    el('div', { class: 'tiny faint', style: 'margin-top:4px' }, 'Comma separated. Old spellings from the chat log go here.'));

  v.append(el('div', { style: 'height:18px' }));
  v.append(el('button', { class: 'btn primary block', onClick: async () => {
    ex.name = nameInput.value.trim();
    if (!ex.name) return toast('Name required');
    ex.aliases = aliasInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (isNew) { const newId = await S.addExercise(ex); toast('Created'); go('set/' + newId); }
    else { await S.saveExercise(id, ex); toast('Saved'); history.back(); }
  } }, isNew ? 'Create' : 'Save'));

  if (!isNew) {
    v.append(el('button', { class: 'btn danger block', style: 'margin-top:8px', onClick: async () => {
      const used = state.sets.filter((s) => s.exerciseId === id).length;
      const ok = await confirmSheet('Delete exercise?',
        used ? `${used} logged sets reference it and will show as "(deleted exercise)".` : 'Not used in any set yet.');
      if (!ok) return;
      await S.deleteExercise(id); toast('Deleted'); go('exercises');
    } }, 'Delete exercise'));
  }

  v.append(el('button', { class: 'btn block', style: 'margin-top:8px', onClick: () => history.back() }, 'Cancel'));
}

/* ============================ unlock gate ============================ */

/**
 * Shown when no API key is stored on this device. The key lives only in this
 * browser's localStorage — it is not in the repo, so the public source alone
 * gets an attacker nothing.
 */
function showUnlock(message) {
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('tabs').style.display = 'none';

  const input = el('input', {
    type: 'password', placeholder: 'Paste the key', autocomplete: 'off',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
  });

  const err = el('div', { class: 'tiny', style: 'color:var(--bad);min-height:18px;margin-top:8px' }, message || '');

  const unlock = async () => {
    const key = input.value.trim();
    if (!key) return;
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      initFirebase(key);
      await ready();
      saveKey(key);
      location.reload();
    } catch (e) {
      clearKey();
      btn.disabled = false;
      btn.textContent = 'Unlock';
      err.textContent = isKeyError(e)
        ? 'That key was rejected. Check for a missing character.'
        : 'Could not reach Firebase — check your connection.';
    }
  };

  const btn = el('button', { class: 'btn primary block', onClick: unlock }, 'Unlock');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });

  clear(viewEl()).append(el('div', { style: 'max-width:380px;margin:12vh auto 0;text-align:center' },
    el('div', { style: 'font-size:2.6rem' }, '🏋️'),
    el('h2', { style: 'margin:14px 0 6px' }, 'Gym Notes'),
    el('p', { class: 'muted tiny', style: 'margin:0 0 20px' },
      'This device needs the access key once. Paste it and it stays in this browser.'),
    input, err,
    el('div', { style: 'height:12px' }),
    btn
  ));
  setTimeout(() => input.focus(), 50);
}

/* ============================ boot ============================ */

async function boot() {
  paintSync(navigator.onLine);

  const key = getStoredKey();
  if (!key) return showUnlock();

  initFirebase(key);
  try {
    await ready();
  } catch (e) {
    if (isKeyError(e)) { clearKey(); return showUnlock('Stored key is no longer valid.'); }
    throw e;
  }

  await S.ensureSeedProfiles(SEED_PROFILES);
  const n = await S.seedExercises(SEED_EXERCISES);
  if (n) toast(`Seeded ${n} exercises`);

  S.watchProfiles((rows) => {
    state.profiles = rows;
    state.loaded.profiles = true;
    if (!state.profileId && rows.length) setProfile(rows[0].id);
    else renderFromData();
  });

  S.watchExercises((rows) => {
    state.exercises = rows;
    state.loaded.exercises = true;
    renderFromData();
  });

  if (state.profileId) setProfile(state.profileId);
}

boot().catch((err) => {
  console.error(err);
  clear(viewEl()).append(el('div', { class: 'empty' },
    'Could not connect to Firebase.', el('br'),
    el('span', { class: 'tiny' }, err.message)));
});
