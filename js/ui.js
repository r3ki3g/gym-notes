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
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/** Promise-based modal so destructive actions always get a look first. */
export function confirmSheet(title, body, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    const dlg = el('dialog', {},
      el('div', { class: 'sheet' },
        el('h2', {}, title),
        body ? el('p', { class: 'muted' }, body) : null,
        el('div', { class: 'row', style: 'margin-top:16px' },
          el('button', { class: 'btn grow', onClick: () => { dlg.close(); resolve(false); } }, 'Cancel'),
          el('button', { class: 'btn danger grow', onClick: () => { dlg.close(); resolve(true); } }, confirmLabel)
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
