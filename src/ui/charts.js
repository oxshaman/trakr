// Charts drawn as plain SVG at the real pixel width of their container.

import { html, useState } from '../deps.js';
import { useWidth } from './hooks.js';

const GUTTER = 44; // room on the right for value labels
const TOP = 10;
const BOTTOM = 22; // room for date labels

// dots: raw values. line: a smoothed series drawn as a path. Both are arrays of
// { x, y, label } where x is a day number, so gaps in time show as gaps.
// With no line, the dots are connected instead.
export function LineChart({ dots = [], line, goal, height = 150, fmtY = (v) => v.toFixed(1), onPastel = false, label }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const path = line && line.length ? line : dots;
  const all = [...dots, ...(line || [])];
  let svg = null;

  if (width > 0 && all.length) {
    const W = width - GUTTER;
    const H = height - TOP - BOTTOM;
    let minX = Math.min(...all.map((p) => p.x));
    let maxX = Math.max(...all.map((p) => p.x));
    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    let minY = Math.min(...all.map((p) => p.y));
    let maxY = Math.max(...all.map((p) => p.y));
    // The goal line is drawn only when it is close enough not to squash the data.
    const span = Math.max(maxY - minY, 2);
    const showGoal = goal !== undefined && goal >= minY - span && goal <= maxY + span;
    if (showGoal) {
      minY = Math.min(minY, goal);
      maxY = Math.max(maxY, goal);
    }
    const pad = Math.max((maxY - minY) * 0.12, 0.25);
    minY -= pad;
    maxY += pad;

    const sx = (x) => 6 + ((x - minX) / (maxX - minX)) * (W - 14);
    const sy = (y) => TOP + (1 - (y - minY) / (maxY - minY)) * H;
    const d = path.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join('');
    const end = path[path.length - 1];
    const first = all.reduce((a, b) => (b.x < a.x ? b : a));
    const last = all.reduce((a, b) => (b.x > a.x ? b : a));
    const hi = Math.max(...all.map((p) => p.y));
    const lo = Math.min(...all.map((p) => p.y));
    const goalY = showGoal ? sy(goal) : null;
    // Skip a value label that would collide with the goal label.
    const clear = (y) => goalY === null || Math.abs(y - goalY) > 13;

    const pick = dots.length ? dots : path;
    const onMove = (e) => {
      const box = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - box.left;
      let best = 0;
      for (let i = 1; i < pick.length; i++) {
        if (Math.abs(sx(pick[i].x) - px) < Math.abs(sx(pick[best].x) - px)) best = i;
      }
      setHover(best);
    };
    const hp = hover !== null && pick[hover] ? pick[hover] : null;
    const tipX = hp ? Math.min(Math.max(sx(hp.x), 46), W - 46) : 0;

    svg = html`
      <svg
        role="img"
        aria-label=${label}
        width=${width}
        height=${height}
        viewBox=${`0 0 ${width} ${height}`}
        fill="none"
        onPointerMove=${onMove}
        onPointerDown=${onMove}
        onPointerLeave=${() => setHover(null)}
      >
        ${showGoal &&
        html`<path class="chart-goal" d=${`M0 ${goalY.toFixed(1)}H${W}`} />
          <text class="chart-label strong" x=${W + 8} y=${goalY + 4}>${fmtY(goal)}</text>`}
        <g class="chart-dots">${dots.map((p, i) => html`<circle key=${i} cx=${sx(p.x).toFixed(1)} cy=${sy(p.y).toFixed(1)} r="3" />`)}</g>
        ${path.length > 1 && html`<path class="chart-line draw" pathLength="1" d=${d} />`}
        <circle class="chart-end" cx=${sx(end.x).toFixed(1)} cy=${sy(end.y).toFixed(1)} r="5.5" />
        ${clear(sy(hi)) && html`<text class="chart-label" x=${W + 8} y=${sy(hi) + 4}>${fmtY(hi)}</text>`}
        ${hi !== lo && clear(sy(lo)) && Math.abs(sy(lo) - sy(hi)) > 13 && html`<text class="chart-label" x=${W + 8} y=${sy(lo) + 4}>${fmtY(lo)}</text>`}
        <text class="chart-label" x="0" y=${height - 4}>${first.label}</text>
        ${last.x !== first.x && html`<text class="chart-label" x=${W} y=${height - 4} text-anchor="end">${last.label}</text>`}
        ${hp &&
        html`<g class="chart-hover">
          <path d=${`M${sx(hp.x).toFixed(1)} ${TOP}V${TOP + H}`} />
          <circle cx=${sx(hp.x).toFixed(1)} cy=${sy(hp.y).toFixed(1)} r="5" />
          <rect x=${tipX - 46} y="0" width="92" height="20" rx="10" />
          <text x=${tipX} y="14" text-anchor="middle">${hp.label} · ${fmtY(hp.y)}</text>
        </g>`}
      </svg>
    `;
  }

  return html`<div class=${'chart' + (onPastel ? ' on-pastel' : '')} ref=${ref} style=${`height:${height}px`}>${svg}</div>`;
}

// A tiny line with no axes, for list rows and the weight card.
export function Sparkline({ values, w = 56, h = 24, draw = false, dot = false }) {
  if (!values || values.length < 2) return html`<svg class="spark" aria-hidden="true" width=${w} height=${h}></svg>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const m = dot ? 6 : 3;
  const sx = (i) => m + (i / (values.length - 1)) * (w - 2 * m);
  const sy = (v) => (max === min ? h / 2 : m + (1 - (v - min) / (max - min)) * (h - 2 * m));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
  const lastI = values.length - 1;
  return html`
    <svg class="spark" aria-hidden="true" width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`} fill="none">
      <path class=${'spark-line' + (draw ? ' draw' : '')} pathLength="1" d=${d} />
      ${dot && html`<circle class=${'spark-dot' + (draw ? ' pop late' : '')} cx=${sx(lastI).toFixed(1)} cy=${sy(values[lastI]).toFixed(1)} r="4.5" />`}
    </svg>
  `;
}
