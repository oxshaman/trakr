// Everything the screens do to the data goes through these functions.

import { buildHistory, byKey, lastSession } from './calc.js';
import { db } from './db.js';
import { COLORS, DEFAULT_MEASUREMENTS } from './seed.js';
import { today, uid } from './util.js';

// ---- Settings ----

export const units = () => db.setting('units', 'metric');

export function goalKg() {
  const v = parseFloat(db.setting('goalKg', ''));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export function trackedMeasurements() {
  try {
    const v = JSON.parse(db.setting('measurements', ''));
    if (Array.isArray(v)) return v;
  } catch (err) {
    // Not set yet.
  }
  return DEFAULT_MEASUREMENTS;
}

// ---- Weight and measurements ----
// Ids come from the date, so there is one weigh-in per day and one value per
// measurement per day. Logging again on the same day replaces the earlier value.

export const logWeight = (date, kg) => db.put('weights', { id: `w-${date}`, date, kg });
export const deleteWeight = (date) => db.remove('weights', `w-${date}`);

export const logMeasurement = (date, type, cm) => db.put('measurements', { id: `m-${date}-${type}`, date, type, cm });
export const deleteMeasurement = (date, type) => db.remove('measurements', `m-${date}-${type}`);

// ---- Exercises ----

export const exercisesByName = () => [...db.list('exercises')].sort(byKey((e) => e.name.toLowerCase()));

export function createExercise(name) {
  const trimmed = name.trim();
  const clean = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const existing = db.list('exercises').find((e) => e.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  return db.put('exercises', { id: uid(), name: clean }).id;
}

export const renameExercise = (id, name) => db.patch('exercises', id, { name: name.trim() });
export const deleteExercise = (id) => db.remove('exercises', id);

// ---- Routines ----

export const routinesInOrder = () => [...db.list('routines')].sort(byKey((r) => r.position || 0));

export function createRoutine() {
  const routines = db.list('routines');
  const used = new Set(routines.map((r) => r.color));
  const color = COLORS.find((c) => !used.has(c)) || COLORS[routines.length % COLORS.length];
  const position = routines.reduce((max, r) => Math.max(max, r.position || 0), -1) + 1;
  return db.put('routines', { id: uid(), name: 'New routine', color, position, exerciseIds: [] }).id;
}

export const deleteRoutine = (id) => db.remove('routines', id);

// ---- Workouts ----

export const activeWorkout = () => db.list('workouts').find((w) => !w.finishedAt);
export const finishedWorkouts = () => db.list('workouts').filter((w) => w.finishedAt);
export const setsOf = (workoutId) => db.list('sets').filter((s) => s.workoutId === workoutId);

export function addSet(workout, exerciseId) {
  const ex = db.get('exercises', exerciseId);
  let n = 0;
  for (const s of db.list('sets')) {
    if (s.workoutId === workout.id && s.exerciseId === exerciseId && s.n > n) n = s.n;
  }
  // The exercise name and date are copied onto the row so the sheet reads well on its own.
  return db.put('sets', { id: uid(), workoutId: workout.id, exerciseId, exercise: ex ? ex.name : '', date: workout.date, n: n + 1, done: false });
}

// A new exercise starts with as many sets as last time, or three.
function addStartingSets(workout, exerciseId, history) {
  const last = lastSession(history.get(exerciseId), workout.startedAt);
  const count = last ? Math.min(Math.max(last.sets.length, 1), 8) : 3;
  for (let i = 0; i < count; i++) addSet(workout, exerciseId);
}

export function startWorkout(routine) {
  const id = uid();
  db.batch(() => {
    const exerciseIds = routine ? routine.exerciseIds.filter((x) => db.get('exercises', x)) : [];
    const workout = db.put('workouts', {
      id,
      date: today(),
      name: routine ? routine.name : 'Workout',
      routineId: routine ? routine.id : undefined,
      color: routine ? routine.color : 'butter',
      startedAt: Date.now(),
      exerciseIds,
    });
    const history = buildHistory(finishedWorkouts(), db.list('sets'));
    for (const exId of exerciseIds) addStartingSets(workout, exId, history);
  });
  return id;
}

export function addExercise(workout, exerciseId) {
  if (workout.exerciseIds.includes(exerciseId)) return;
  db.batch(() => {
    db.patch('workouts', workout.id, { exerciseIds: [...workout.exerciseIds, exerciseId] });
    const history = buildHistory(finishedWorkouts().filter((w) => w.id !== workout.id), db.list('sets'));
    addStartingSets(workout, exerciseId, history);
  });
}

export function removeExercise(workout, exerciseId) {
  db.batch(() => {
    for (const s of setsOf(workout.id)) {
      if (s.exerciseId === exerciseId) db.remove('sets', s.id);
    }
    db.patch('workouts', workout.id, { exerciseIds: workout.exerciseIds.filter((x) => x !== exerciseId) });
  });
}

export function moveExercise(workout, exerciseId, dir) {
  const ids = [...workout.exerciseIds];
  const i = ids.indexOf(exerciseId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  db.patch('workouts', workout.id, { exerciseIds: ids });
}

export function removeLastSet(workout, exerciseId) {
  const sets = setsOf(workout.id).filter((s) => s.exerciseId === exerciseId).sort(byKey((s) => s.n));
  if (sets.length) db.remove('sets', sets[sets.length - 1].id);
}

// Drops sets that were never marked done and renumbers the rest 1, 2, 3.
// Used when a workout is finished and when an old workout is closed after editing.
export function tidyWorkout(workout) {
  const sets = setsOf(workout.id).sort(byKey((s) => s.n));
  const next = new Map();
  db.batch(() => {
    for (const s of sets) {
      if (!s.done) {
        db.remove('sets', s.id);
        continue;
      }
      const n = (next.get(s.exerciseId) || 0) + 1;
      next.set(s.exerciseId, n);
      if (s.n !== n) db.patch('sets', s.id, { n });
    }
    const exerciseIds = workout.exerciseIds.filter((x) => next.has(x));
    if (exerciseIds.length !== workout.exerciseIds.length) db.patch('workouts', workout.id, { exerciseIds });
  });
}

// Returns false when there is nothing to save.
export function finishWorkout(workout) {
  if (!setsOf(workout.id).some((s) => s.done)) return false;
  db.batch(() => {
    tidyWorkout(workout);
    db.patch('workouts', workout.id, { finishedAt: Date.now() });
  });
  return true;
}

export function deleteWorkout(workout) {
  db.batch(() => {
    for (const s of setsOf(workout.id)) db.remove('sets', s.id);
    db.remove('workouts', workout.id);
  });
}
