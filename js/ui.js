// Small DOM helpers. No framework — this has to run from a static GitHub Pages
// host with no build step.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/** Promise-based modal so destructive actions always get a look first. */
export function confirmSheet(title, body, confirmLabel = 'Delete', confirmClass = 'danger') {
  return new Promise((resolve) => {
    const dlg = el('dialog', {},
      el('div', { class: 'sheet' },
        el('h2', {}, title),
        body ? el('p', { class: 'muted' }, body) : null,
        el('div', { class: 'row', style: 'margin-top:16px' },
          el('button', { class: 'btn grow', onClick: () => { dlg.close(); resolve(false); } }, 'Cancel'),
          el('button', { class: `btn ${confirmClass} grow`, onClick: () => { dlg.close(); resolve(true); } }, confirmLabel)
        )
      )
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function promptSheet(title, initial = '', placeholder = '') {
  return new Promise((resolve) => {
    const input = el('input', { value: initial, placeholder, autofocus: true });
    const done = (v) => { dlg.close(); resolve(v); };
    const dlg = el('dialog', {},
      el('form', { class: 'sheet', method: 'dialog', onSubmit: (e) => { e.preventDefault(); done(input.value.trim() || null); } },
        el('h2', {}, title),
        input,
        el('div', { class: 'row', style: 'margin-top:16px' },
          el('button', { type: 'button', class: 'btn grow', onClick: () => done(null) }, 'Cancel'),
          el('button', { type: 'submit', class: 'btn primary grow' }, 'Save')
        )
      )
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    input.focus();
  });
}

/**
 * A button that cannot be double-submitted.
 *
 * Found in real use: tapping "Save set" twice on a slow connection wrote two
 * records. Disabling alone is not enough — the handler is async, so the second
 * tap can land before the DOM updates. Hence the `busy` flag as well.
 *
 * Reverts label and state afterwards, but only if the node is still in the
 * document: most of these handlers trigger a re-render that replaces it.
 */
export function busyButton(label, busyLabel, cls, fn) {
  let busy = false;
  const btn = el('button', { class: cls, onClick: async () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    btn.textContent = busyLabel;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast('Could not save — try again');
    } finally {
      busy = false;
      if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    }
  } }, label);
  return btn;
}

/**
 * [–] value [+] with the value still typeable.
 *
 * Long-press repeats, accelerating after the first second — going from 20 kg to
 * 60 kg should not be sixteen taps.
 *
 * Returns { node, get, set, setStep } so the caller can retune the step when the
 * unit changes without rebuilding anything.
 */
export function stepper({ value = 0, step = 1, min = 0, max = Infinity, decimals = 1, onChange } = {}) {
  let step_ = step;

  const input = el('input', {
    type: 'number', inputmode: 'decimal', class: 'step-value',
    value: value || value === 0 ? String(value) : '',
  });

  const read  = () => { const n = parseFloat(input.value); return isNaN(n) ? 0 : n; };
  const clean = (n) => Math.min(max, Math.max(min, parseFloat(n.toFixed(decimals))));

  function write(n) {
    const v = clean(n);
    input.value = String(v);
    onChange?.(v);
    return v;
  }

  // One press = one nudge; hold = repeat. The timers are cleared on every exit
  // path, including pointercancel, or a dragged thumb leaves it ticking.
  function bind(btn, dir) {
    let hold, repeat;
    const stop = () => { clearTimeout(hold); clearInterval(repeat); hold = repeat = null; };

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      write(read() + dir * step_);
      hold = setTimeout(() => {
        let ticks = 0;
        repeat = setInterval(() => {
          ticks++;
          write(read() + dir * step_ * (ticks > 12 ? 4 : ticks > 5 ? 2 : 1));
        }, 110);
      }, 450);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  }

  const minus = el('button', { type: 'button', class: 'step-btn', 'aria-label': 'decrease' }, '−');
  const plus  = el('button', { type: 'button', class: 'step-btn', 'aria-label': 'increase' }, '+');
  bind(minus, -1);
  bind(plus, +1);

  input.addEventListener('change', () => write(read()));

  return {
    node: el('div', { class: 'stepper' }, minus, input, plus),
    get: read,
    set: (n) => { input.value = String(clean(n)); },
    setStep: (n) => { step_ = n; },
  };
}

/** Segmented picker. options: [{key,label}] */
export function segmented(options, selected, onPick) {
  const wrap = el('div', { class: 'seg' });
  for (const o of options) {
    wrap.append(el('button', {
      type: 'button',
      class: o.key === selected ? 'on' : '',
      onClick: () => onPick(o.key),
    }, o.label));
  }
  return wrap;
}

export function field(labelText, control) {
  return el('label', { class: 'field' }, el('span', {}, labelText), control);
}

/**
 * "just now" / "5s ago" / "12m ago" / "3h ago", then falls back to a date.
 * Seconds granularity early on, because a set logged moments ago should read
 * that way rather than rounding to "0 minutes".
 */
export function timeAgo(ms) {
  if (!ms) return 'just now';
  const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (secs < 4)     return 'just now';
  if (secs < 60)    return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)    return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)     return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** Firestore timestamps are null until the server confirms the write. */
export function stampMs(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

/** 09/20/26 — matches the log's own date style. */
export function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y.slice(2)}`;
}

export function dayLabel(iso) {
  const today = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const key = (dt) => `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  if (iso === key(today)) return 'Today';
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (iso === key(y)) return 'Yesterday';
  const dt = new Date(iso + 'T00:00:00');
  return `${dt.toLocaleDateString(undefined, { weekday: 'short' })} ${fmtDate(iso)}`;
}
