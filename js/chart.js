// Inline-SVG line chart for progress. No library: two series of a few dozen
// points do not need one, and this matches the palette exactly.
//
// Mark specs follow the charting guidance used to design it: 2px lines, markers
// of at least 8px with a 2px surface ring so overlapping points stay separable,
// recessive grid, text in text colours (never the series colour), a direct
// label at each line's end, and tap targets of at least 24px — phones have no
// hover. All the arithmetic lives in progress.js, where it is tested.

import { niceAxis, labelledIndexes, dayIndex, polylineLength, revealDelay } from './progress.js';
import { formatDuration } from './units.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

/** Tick and label text for a value on the given metric. */
export function formatValue(v, metric) {
  if (v == null) return '—';
  if (metric === 'longest' || metric === 'total') return formatDuration(v);
  if (metric === 'volume') return Math.round(v).toLocaleString('en-US');
  return String(Math.round(v * 10) / 10);
}

const WEEKDAY = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
const MMDDYY  = (iso) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y.slice(2)}`; };

/**
 * @param container  element to draw into; must already be in the document so
 *                   its width can be measured
 * @param opts.series   [{ key, name, points, marker: 'dot' | 'diamond' }]
 * @param opts.metric
 * @param opts.axisTitle
 * @param opts.integerAxis whole-number ticks only (blocks, reps)
 * @param opts.animate     play the entrance: colour glide, line draw-in, dots dropping in
 * @param opts.elapsed     ms the entrance has already run, for a rebuild partway through
 * @param opts.selected { key, date } or null
 * @param opts.onSelect (key, point) => void
 */
export function drawChart(container, { series, metric, axisTitle, integerAxis = false, animate = false, elapsed = 0, selected, onSelect }) {
  while (container.firstChild) container.removeChild(container.firstChild);
  container.classList.toggle('animate', !!animate);
  // Every entrance delay subtracts --t, so a chart rebuilt partway through picks
  // up where the last one was.
  container.style.setProperty('--t', `${Math.max(0, Math.round(elapsed))}ms`);

  const W = Math.max(260, container.clientWidth || 340);
  const H = 236;
  const M = { top: 24, right: 82, bottom: 42, left: 44 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const all = series.flatMap((s) => s.points);
  const dates = [...new Set(all.map((p) => p.date))].sort();
  const origin = dates[0];
  const span = Math.max(1, dayIndex(dates[dates.length - 1], origin));
  // Inset so the first and last points sit off the axis edges: a point on the
  // left edge put its suspect ring over the y tick labels ("3,000", "80").
  const PAD = 14;
  // One distinct day across everyone: centre it rather than pinning to the edge.
  const x = (iso) => M.left + PAD + (dates.length === 1 ? (iw - 2 * PAD) / 2 : (dayIndex(iso, origin) / span) * (iw - 2 * PAD));

  const ax = niceAxis(all.map((p) => p.value), { integer: integerAxis });
  const y = (v) => M.top + ih - ((v - ax.min) / (ax.max - ax.min || 1)) * ih;

  const root = svg('svg', {
    class: 'chart' + (animate ? ' animate' : ''), width: W, height: H, viewBox: `0 0 ${W} ${H}`,
    role: 'img', 'aria-label': `${axisTitle} over time`,
  });

  // --- grid + y ticks (recessive) ---
  const grid = svg('g', { class: 'grid' });
  for (const t of ax.ticks) {
    const yy = y(t);
    grid.append(svg('line', { x1: M.left, x2: M.left + iw, y1: yy, y2: yy }));
    grid.append(svg('text', { x: M.left - 7, y: yy + 3.5, 'text-anchor': 'end', class: 'tick' }, formatValue(t, metric)));
  }
  root.append(grid);
  root.append(svg('text', { x: M.left - 7, y: 12, 'text-anchor': 'start', class: 'axis-title' }, axisTitle));

  // --- x labels: real dates, weekday over MM/DD/YY, thinned so none collide ---
  const xs = dates.map(x);
  for (const i of labelledIndexes(xs, 50)) {
    const d = dates[i];
    root.append(svg('line', { class: 'xtick', x1: xs[i], x2: xs[i], y1: M.top + ih, y2: M.top + ih + 4 }));
    root.append(svg('text', { x: xs[i], y: M.top + ih + 17, 'text-anchor': 'middle', class: 'tick tick-day' }, WEEKDAY(d)));
    root.append(svg('text', { x: xs[i], y: M.top + ih + 30, 'text-anchor': 'middle', class: 'tick' }, MMDDYY(d)));
  }

  // --- series ---
  const ends = [];
  for (const s of series) {
    if (!s.points.length) continue;
    const g = svg('g', { class: `series s-${s.key}` });

    if (s.points.length > 1) {
      const pts = s.points.map((p) => [x(p.date), y(p.value)]);
      g.append(svg('polyline', {
        class: 'line', fill: 'none',
        points: pts.map(([a, b]) => `${a},${b}`).join(' '),
        // the draw-in runs stroke-dashoffset from this exact length down to 0
        style: animate ? `--len:${polylineLength(pts).toFixed(1)}` : null,
      }));
    }

    for (const p of s.points) {
      const cx = x(p.date), cy = y(p.value);
      const isSel = selected && selected.key === s.key && selected.date === p.date;
      const d = animate ? `--d:${revealDelay(cx, M.left, iw)}ms` : null;
      if (p.suspect) g.append(svg('circle', { class: 'suspect-ring', cx, cy, r: 9.5, style: d }));
      if (isSel)     g.append(svg('circle', { class: 'sel-ring', cx, cy, r: 9 }));
      const m = marker(s.marker, cx, cy, p.hollow);
      if (d) m.setAttribute('style', d);
      g.append(m);
    }
    root.append(g);

    const last = s.points[s.points.length - 1];
    ends.push({ key: s.key, name: s.name, x: x(last.date), y: y(last.value), value: last.value });
  }

  // --- end labels: name + latest value, nudged apart so two never overlap ---
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 26) ends[i].y = ends[i - 1].y + 26;
  for (const e of ends) {
    // Names are not a fixed length: "Prabhashwara" clipped against the edge in
    // the first render. Trim to the room actually left, by an average glyph
    // width for this 10.5px bold face; drop the name if even 4 characters won't
    // fit — the legend and the marker shape still carry identity.
    const room = W - (e.x + 11) - 4;
    const fits = Math.floor(room / 6.4);
    const name = e.name.length <= fits ? e.name : fits >= 4 ? e.name.slice(0, fits - 1) + '…' : '';
    if (name) root.append(svg('text', { x: e.x + 11, y: e.y - 1, class: 'end-name' }, name));
    root.append(svg('text', { x: e.x + 11, y: e.y + 11, class: 'end-value' }, formatValue(e.value, metric)));
  }

  // --- hit targets last, so they sit above everything: 24px minimum ---
  for (const s of series) {
    for (const p of s.points) {
      root.append(svg('circle', {
        class: 'hit', cx: x(p.date), cy: y(p.value), r: 13, tabindex: 0,
        'aria-label': `${s.name}, ${MMDDYY(p.date)}: ${formatValue(p.value, metric)}`,
        onClick: () => onSelect?.(s.key, p),
        onKeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect?.(s.key, p); } },
      }));
    }
  }

  container.append(root);
}

/** ● for you, ◆ for them — identity is never colour alone. */
function marker(kind, cx, cy, hollow) {
  const cls = 'mark' + (hollow ? ' hollow' : '');
  if (kind === 'diamond') {
    const r = 5.6;
    return svg('polygon', { class: cls, points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}` });
  }
  return svg('circle', { class: cls, cx, cy, r: 4.6 });
}
