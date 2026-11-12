// Pure calculations: weight trend, lifting bests, weekly counts. No storage access here.

import { WEEKDAY_SHORT, addDays, daysBetween, today, weekStart } from './util.js';

export const byKey = (fn) => (a, b) => {
  const x = fn(a);
  const y = fn(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

// ---- Weight ----

// The trend for a day is the average of the weigh-ins from that day and the six
// days before it. A full week in the window evens out water-weight swings and
// the usual weekday/weekend pattern. Days without a weigh-in are skipped.
export const TREND_DAYS = 7;

export function trendSeries(weights) {
  const rows = [...weights].sort(byKey((w) => w.date));
  const out = [];
  let start = 0;
  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    sum += rows[i].kg;
    while (daysBetween(rows[start].date, rows[i].date) >= TREND_DAYS) {
      sum -= rows[start].kg;
      start++;
    }
    out.push({ date: rows[i].date, kg: rows[i].kg, trend: sum / (i - start + 1) });
  }
  return out;
}

export function trendOnOrBefore(series, date) {
  let v;
  for (const p of series) {
    if (p.date <= date) v = p.trend;
    else break;
  }
  return v;
}

export function weightStats(series) {
  if (!series.length) return null;
  const last = series[series.length - 1];
  const first = series[0];
  const diff = (days) => {
    const v = trendOnOrBefore(series, addDays(last.date, -days));
    return v === undefined ? undefined : last.trend - v;
  };
  return {
    date: last.date,
    kg: last.kg,
    trend: last.trend,
    d7: diff(7),
    d30: diff(30),
    sinceStart: series.length > 1 ? last.trend - first.kg : undefined,
  };
}

// ---- Lifting ----

// Ranks sets for "best lift". The heaviest weight wins. At the same weight, more
// reps win. Bodyweight sets have no load, so they rank by reps alone and always
// sit below loaded sets.
export function setScore(s) {
  return (s.kg || 0) * 1000 + Math.min(s.reps || 0, 999);
}

// Groups done sets by exercise, then by workout. Returns
// Map(exerciseId -> [{ workout, sets }]) with sessions ordered oldest first.
export function buildHistory(workouts, sets) {
  const wById = new Map(workouts.map((w) => [w.id, w]));
  const byExercise = new Map();
  for (const s of sets) {
    if (!s.done) continue;
    const w = wById.get(s.workoutId);
    if (!w) continue;
    let perWorkout = byExercise.get(s.exerciseId);
    if (!perWorkout) byExercise.set(s.exerciseId, (perWorkout = new Map()));
    let arr = perWorkout.get(w.id);
    if (!arr) perWorkout.set(w.id, (arr = []));
    arr.push(s);
  }
  const out = new Map();
  for (const [exId, perWorkout] of byExercise) {
    const sessions = [...perWorkout]
      .map(([wid, arr]) => ({ workout: wById.get(wid), sets: arr.sort(byKey((s) => s.n)) }))
      .sort(byKey((x) => x.workout.startedAt));
    out.set(exId, sessions);
  }
  return out;
}

// The most recent session that started before the given time.
export function lastSession(sessions, before = Infinity) {
  if (!sessions) return undefined;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].workout.startedAt < before) return sessions[i];
  }
  return undefined;
}

// Best score across sessions before the given time, or -1 when there is no history.
export function bestScoreBefore(sessions, before = Infinity) {
  let best = -1;
  for (const ses of sessions || []) {
    if (ses.workout.startedAt >= before) continue;
    for (const s of ses.sets) best = Math.max(best, setScore(s));
  }
  return best;
}

export function bestLifts(history, exercisesById, todayStr = today()) {
  const out = [];
  for (const [exerciseId, sessions] of history) {
    let best;
    let bestDate;
    const series = [];
    for (const ses of sessions) {
      let top = 0;
      for (const s of ses.sets) {
        const sc = setScore(s);
        if (sc > top) top = sc;
        if (!best || sc > setScore(best)) {
          best = s;
          bestDate = ses.workout.date;
        }
      }
      series.push(top);
    }
    const last = sessions[sessions.length - 1];
    const ex = exercisesById.get(exerciseId);
    out.push({
      exerciseId,
      name: (ex && ex.name) || last.sets[0].exercise || 'Exercise',
      best,
      bestDate,
      lastDate: last.workout.date,
      lastAt: last.workout.startedAt,
      series,
      // A best only counts as news when there was an earlier session to beat.
      recent: sessions.length > 1 && bestDate !== sessions[0].workout.date && daysBetween(bestDate, todayStr) <= 7,
    });
  }
  return out.sort(byKey((x) => -x.lastAt));
}

// "60 kg × 8, 8, 7" when every set used the same load, else "60 × 8, 62.5 × 6".
export function fmtSets(sets, fmtKg, unit) {
  if (!sets.length) return '';
  const kgs = sets.map((s) => s.kg || 0);
  if (kgs.every((k) => k === kgs[0])) {
    const reps = sets.map((s) => s.reps).join(', ');
    return kgs[0] > 0 ? `${fmtKg(kgs[0])} ${unit} × ${reps}` : `${reps} reps`;
  }
  return sets.map((s) => (s.kg > 0 ? `${fmtKg(s.kg)} × ${s.reps}` : `${s.reps}`)).join(', ');
}

export function fmtSet(s, fmtKg, unit) {
  return s.kg > 0 ? `${fmtKg(s.kg)} ${unit} × ${s.reps}` : `${s.reps} reps`;
}

// ---- Weeks ----

// Workout counts for the last n weeks, oldest first. The last entry is the current week.
export function weekCounts(workouts, todayStr = today(), n = 8) {
  const start = weekStart(todayStr);
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) weeks.push({ start: addDays(start, -7 * i), count: 0 });
  const index = new Map(weeks.map((w, i) => [w.start, i]));
  for (const w of workouts) {
    const i = index.get(weekStart(w.date));
    if (i !== undefined) weeks[i].count++;
  }
  return weeks;
}

// Monday to Sunday of the current week with the workouts done on each day.
export function weekDays(workouts, todayStr = today()) {
  const start = weekStart(todayStr);
  return WEEKDAY_SHORT.map((label, i) => {
    const date = addDays(start, i);
    return {
      date,
      label,
      workouts: workouts.filter((w) => w.date === date),
      isToday: date === todayStr,
      isFuture: date > todayStr,
    };
  });
}

// Map(routineId -> date of the most recent workout started from it).
export function routineLastDone(workouts) {
  const out = new Map();
  for (const w of workouts) {
    if (!w.routineId) continue;
    const cur = out.get(w.routineId);
    if (!cur || w.date > cur) out.set(w.routineId, w.date);
  }
  return out;
}
