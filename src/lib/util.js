// Small helpers for ids, dates and number formatting. Dates are local 'yyyy-MM-dd' strings.

export const uid = () =>
  globalThis.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);

const pad = (n) => String(n).padStart(2, '0');

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toDateStr(new Date());

// Noon avoids off-by-one results around daylight saving changes.
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

// Weeks start on Monday.
export function weekStart(s) {
  const d = parseDate(s);
  return addDays(s, -((d.getDay() + 6) % 7));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const weekdayName = (s) => WEEKDAYS[parseDate(s).getDay()];

// "Thursday 12 November"
export function fmtLong(s) {
  const d = parseDate(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// "Tuesday 10 Nov", with the year added when it is not the current one.
export function fmtMedium(s) {
  const d = parseDate(s);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${year}`;
}

// "10 Nov"
export function fmtShort(s) {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function ago(s, ref = today()) {
  const n = daysBetween(s, ref);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

export function relTime(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

// "12:40" or "1:02:40"
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export const fmtMinutes = (ms) => `${Math.max(1, Math.round(ms / 60000))} min`;

// 62.5 -> "62.5", 60 -> "60"
export const trimNum = (n, dp = 2) => String(Math.round(n * 10 ** dp) / 10 ** dp);

// 84 -> "84.0"
export const fix1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

// -0.6 -> "−0.6", 0.5 -> "+0.5"
export function signed(n, dp = 1) {
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(dp);
}

export const parseNum = (text) => {
  const t = String(text).trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
