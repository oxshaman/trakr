// Starter exercises and routines. Ids are fixed so two devices that both seed
// end up with the same rows after syncing.

export const COLORS = ['peach', 'mint', 'sky', 'lilac', 'butter', 'pink'];

export const MEASUREMENT_TYPES = [
  { id: 'waist', name: 'Waist' },
  { id: 'chest', name: 'Chest' },
  { id: 'hips', name: 'Hips' },
  { id: 'arm', name: 'Arm' },
  { id: 'thigh', name: 'Thigh' },
  { id: 'shoulders', name: 'Shoulders' },
  { id: 'neck', name: 'Neck' },
  { id: 'calf', name: 'Calf' },
];

export const DEFAULT_MEASUREMENTS = ['waist', 'chest', 'arm'];

const EXERCISES = [
  'Bench press',
  'Overhead press',
  'Incline dumbbell press',
  'Lateral raise',
  'Triceps pushdown',
  'Dips',
  'Push-up',
  'Chest fly',
  'Deadlift',
  'Barbell row',
  'Pull-up',
  'Chin-up',
  'Lat pulldown',
  'Seated cable row',
  'Face pull',
  'Biceps curl',
  'Hammer curl',
  'Squat',
  'Front squat',
  'Romanian deadlift',
  'Leg press',
  'Leg curl',
  'Leg extension',
  'Calf raise',
  'Lunge',
  'Bulgarian split squat',
  'Hip thrust',
  'Hanging leg raise',
  'Cable crunch',
];

export const seedId = (name) => 'ex-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const ROUTINES = [
  { id: 'routine-push', name: 'Push', color: 'peach', exercises: ['Bench press', 'Overhead press', 'Incline dumbbell press', 'Lateral raise', 'Triceps pushdown'] },
  { id: 'routine-pull', name: 'Pull', color: 'mint', exercises: ['Barbell row', 'Pull-up', 'Lat pulldown', 'Face pull', 'Biceps curl'] },
  { id: 'routine-legs', name: 'Legs', color: 'sky', exercises: ['Squat', 'Romanian deadlift', 'Leg press', 'Calf raise'] },
];

// Runs once on a device with no exercise or routine records at all.
export function seed(store) {
  if (store.t.exercises.size || store.t.routines.size) return false;
  store.batch(() => {
    for (const name of EXERCISES) store.putSeed('exercises', { id: seedId(name), name });
    ROUTINES.forEach((r, i) => {
      store.putSeed('routines', { id: r.id, name: r.name, color: r.color, position: i, exerciseIds: r.exercises.map(seedId) });
    });
    store._emit();
  });
  return true;
}
