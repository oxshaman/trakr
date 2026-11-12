// Browser test runner. Open tools/test.html through the dev server.
// The sync tests run the real apps-script/Code.gs against a fake spreadsheet.

import * as calc from '../src/lib/calc.js';
import { seed } from '../src/lib/seed.js';
import { Store } from '../src/lib/store.js';
import { Sync } from '../src/lib/sync.js';
import { addDays, ago, daysBetween, fix1, fmtClock, parseNum, signed, trimNum, weekStart } from '../src/lib/util.js';
import { loadScript, makeFakeGas, scriptTransport } from './fake-gas.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function eq(got, want, msg = 'values differ') {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) throw new Error(`${msg}: got ${a}, want ${b}`);
}
function ok(v, msg = 'expected a truthy value') {
  if (!v) throw new Error(msg);
}
function near(got, want, msg = 'numbers differ') {
  if (Math.abs(got - want) > 1e-6) throw new Error(`${msg}: got ${got}, want ${want}`);
}
async function rejects(promise, text) {
  try {
    await promise;
  } catch (err) {
    if (text && !String(err.message).includes(text)) throw new Error(`wrong error: ${err.message}`);
    return;
  }
  throw new Error('expected a rejection');
}

// ---- util ----

test('dates: add, difference and week start', () => {
  eq(addDays('2026-10-30', 3), '2026-11-02');
  eq(addDays('2026-03-01', -1), '2026-02-28');
  eq(daysBetween('2026-03-28', '2026-03-30'), 2, 'across a daylight saving change');
  eq(weekStart('2026-11-12'), '2026-11-09', 'Thursday');
  eq(weekStart('2026-11-15'), '2026-11-09', 'Sunday belongs to the week that started Monday');
  eq(weekStart('2026-11-09'), '2026-11-09', 'Monday');
  eq(ago('2026-11-07', '2026-11-12'), '5 days ago');
  eq(ago('2026-11-11', '2026-11-12'), 'yesterday');
});

test('number formatting', () => {
  eq(trimNum(62.5), '62.5');
  eq(trimNum(60), '60');
  eq(trimNum(61.23489), '61.23');
  eq(fix1(84), '84.0');
  eq(signed(-0.6), '−0.6');
  eq(signed(0.5), '+0.5');
  eq(fmtClock(760000), '12:40');
  eq(fmtClock(3760000), '1:02:40');
  eq(parseNum('62,5'), 62.5);
  eq(parseNum(''), undefined);
  eq(parseNum('abc'), undefined);
});

// ---- calc ----

test('trend: flat input gives a flat trend', () => {
  const s = calc.trendSeries([
    { date: '2026-11-01', kg: 80 },
    { date: '2026-11-02', kg: 80 },
    { date: '2026-11-03', kg: 80 },
  ]);
  eq(s.map((p) => p.trend), [80, 80, 80]);
});

test('trend: averages the last 7 days and drops older weigh-ins', () => {
  const s = calc.trendSeries([
    { date: '2026-11-01', kg: 80 },
    { date: '2026-11-02', kg: 81 },
    { date: '2026-11-07', kg: 82 },
    { date: '2026-11-08', kg: 83 },
    { date: '2026-11-20', kg: 90 },
  ]);
  near(s[0].trend, 80);
  near(s[1].trend, 80.5);
  near(s[2].trend, 81, 'days 1 to 7 are all inside the window');
  near(s[3].trend, 82, 'day 1 has left the window');
  near(s[4].trend, 90, 'after a long gap only the new weigh-in counts');
});

test('trend: input order does not matter', () => {
  const s = calc.trendSeries([
    { date: '2026-11-02', kg: 81 },
    { date: '2026-11-01', kg: 80 },
  ]);
  eq(s.map((p) => p.date), ['2026-11-01', '2026-11-02']);
});

test('weight stats: changes over 7 and 30 days', () => {
  const weights = [];
  for (let i = 0; i < 40; i++) weights.push({ date: addDays('2026-10-01', i), kg: 90 - i * 0.1 });
  const stats = calc.weightStats(calc.trendSeries(weights));
  ok(stats.d7 < 0 && stats.d30 < stats.d7, 'a falling weight gives negative changes, larger over 30 days');
  ok(stats.sinceStart < stats.d30);
  eq(calc.weightStats([]), null);
  const one = calc.weightStats(calc.trendSeries([{ date: '2026-11-01', kg: 80 }]));
  eq([one.d7, one.d30, one.sinceStart], [undefined, undefined, undefined]);
});

test('lifting: set ranking', () => {
  ok(calc.setScore({ kg: 62.5, reps: 6 }) > calc.setScore({ kg: 60, reps: 8 }), 'heavier weight wins');
  ok(calc.setScore({ kg: 60, reps: 8 }) > calc.setScore({ kg: 60, reps: 7 }), 'more reps win at the same weight');
  ok(calc.setScore({ kg: 20, reps: 1 }) > calc.setScore({ reps: 30 }), 'any loaded set ranks above a bodyweight set');
  ok(calc.setScore({ reps: 12 }) > calc.setScore({ reps: 10 }));
});

const W1 = { id: 'w1', date: '2026-11-03', startedAt: 1000, finishedAt: 2000 };
const W2 = { id: 'w2', date: '2026-11-10', startedAt: 3000, finishedAt: 4000 };
const SETS = [
  { id: 'a', workoutId: 'w1', exerciseId: 'bench', exercise: 'Bench press', n: 1, kg: 60, reps: 8, done: true },
  { id: 'b', workoutId: 'w1', exerciseId: 'bench', exercise: 'Bench press', n: 2, kg: 60, reps: 7, done: true },
  { id: 'c', workoutId: 'w2', exerciseId: 'bench', exercise: 'Bench press', n: 2, kg: 62.5, reps: 6, done: true },
  { id: 'd', workoutId: 'w2', exerciseId: 'bench', exercise: 'Bench press', n: 1, kg: 60, reps: 8, done: true },
  { id: 'e', workoutId: 'w2', exerciseId: 'bench', exercise: 'Bench press', n: 3, kg: 70, reps: 5, done: false },
  { id: 'f', workoutId: 'w1', exerciseId: 'pullup', exercise: 'Pull-up', n: 1, reps: 10, done: true },
  { id: 'g', workoutId: 'gone', exerciseId: 'bench', exercise: 'Bench press', n: 1, kg: 200, reps: 1, done: true },
];

test('history: groups done sets by exercise and workout', () => {
  const h = calc.buildHistory([W2, W1], SETS);
  const bench = h.get('bench');
  eq(bench.map((s) => s.workout.id), ['w1', 'w2'], 'oldest first');
  eq(bench[1].sets.map((s) => s.id), ['d', 'c'], 'sorted by set number, undone sets left out');
  eq(calc.lastSession(bench, 3000).workout.id, 'w1');
  eq(calc.lastSession(bench, 1000), undefined);
  eq(calc.bestScoreBefore(bench, 3000), calc.setScore({ kg: 60, reps: 8 }));
  eq(calc.bestScoreBefore(undefined), -1);
});

test('best lifts: best set, date and the recent flag', () => {
  const h = calc.buildHistory([W1, W2], SETS);
  const lifts = calc.bestLifts(h, new Map([['bench', { name: 'Bench press' }]]), '2026-11-12');
  const bench = lifts.find((l) => l.exerciseId === 'bench');
  eq(bench.best.id, 'c', '62.5 x 6 is the heaviest set');
  eq(bench.bestDate, '2026-11-10');
  eq(bench.recent, true);
  eq(bench.series.length, 2);
  const pull = lifts.find((l) => l.exerciseId === 'pullup');
  eq(pull.name, 'Pull-up', 'falls back to the name saved on the set');
  eq(pull.recent, false, 'a first session is not a new best');
  eq(lifts[0].exerciseId, 'bench', 'most recently trained first');
});

test('set formatting', () => {
  const kg = (n) => trimNum(n);
  eq(calc.fmtSets([{ kg: 60, reps: 8 }, { kg: 60, reps: 7 }], kg, 'kg'), '60 kg × 8, 7');
  eq(calc.fmtSets([{ kg: 60, reps: 8 }, { kg: 62.5, reps: 6 }], kg, 'kg'), '60 × 8, 62.5 × 6');
  eq(calc.fmtSets([{ reps: 10 }, { reps: 8 }], kg, 'kg'), '10, 8 reps');
  eq(calc.fmtSets([], kg, 'kg'), '');
});

test('weeks: counts and day rows', () => {
  const ws = [{ date: '2026-11-09' }, { date: '2026-11-10' }, { date: '2026-11-07' }, { date: '2026-09-01' }];
  const counts = calc.weekCounts(ws, '2026-11-12', 8);
  eq(counts.length, 8);
  eq(counts[7], { start: '2026-11-09', count: 2 });
  eq(counts[6], { start: '2026-11-02', count: 1 });
  const days = calc.weekDays(ws, '2026-11-12');
  eq(days.map((d) => d.workouts.length), [1, 1, 0, 0, 0, 0, 0]);
  eq(days[3].isToday, true);
  eq(days[4].isFuture, true);
});

// ---- store ----

function makeStore(clock) {
  const store = new Store();
  store.now = () => clock.t;
  return store;
}

test('store: put, patch, remove', () => {
  const clock = { t: 100 };
  const s = makeStore(clock);
  s.put('weights', { id: 'w-1', date: '2026-11-12', kg: 84.2 });
  eq(s.get('weights', 'w-1').updatedAt, 100);
  eq(s.get('weights', 'w-1')._dirty, true);
  s.patch('weights', 'w-1', { kg: 84 });
  eq(s.get('weights', 'w-1').updatedAt, 101, 'a second write in the same millisecond still moves forward');
  eq(s.get('weights', 'w-1').date, '2026-11-12', 'patch keeps other fields');
  s.remove('weights', 'w-1');
  eq(s.get('weights', 'w-1'), undefined);
  eq(s.raw('weights', 'w-1').deleted, true, 'weights leave a tombstone');
  eq(s.list('weights').length, 0);
  s.put('weights', { id: 'w-1', date: '2026-11-12', kg: 83 });
  eq(s.list('weights').length, 1, 'logging again brings the record back');
});

test('store: unsynced workouts and sets are dropped without a tombstone', () => {
  const s = makeStore({ t: 100 });
  s.put('sets', { id: 's1', workoutId: 'x', exerciseId: 'e', n: 1, done: false });
  s.remove('sets', 's1');
  eq(s.raw('sets', 's1'), undefined);
});

test('store: one notification per batch', () => {
  const s = makeStore({ t: 100 });
  let calls = 0;
  s.subscribe(() => calls++);
  s.batch(() => {
    s.put('weights', { id: 'a', date: '2026-11-01', kg: 1 });
    s.put('weights', { id: 'b', date: '2026-11-02', kg: 2 });
    eq(s.list('weights').length, 2, 'reads inside a batch see the writes');
  });
  eq(calls, 1);
});

test('store: a workout stays local until finished, a set until done', () => {
  const s = makeStore({ t: 100 });
  s.put('workouts', { id: 'wk', date: '2026-11-12', name: 'Push', startedAt: 1, exerciseIds: ['e'] });
  s.put('sets', { id: 's1', workoutId: 'wk', exerciseId: 'e', n: 1, kg: 60, reps: 8, done: true });
  s.put('sets', { id: 's2', workoutId: 'wk', exerciseId: 'e', n: 2, done: false });
  eq(s.dirtySnapshot().count, 0);
  s.patch('workouts', 'wk', { finishedAt: 2 });
  const snap = s.dirtySnapshot();
  eq(Object.keys(snap.changes).sort(), ['sets', 'workouts']);
  eq(snap.changes.sets.map((r) => r.id), ['s1']);
  ok(!('_dirty' in snap.changes.sets[0]), 'private flags are not sent');
});

test('store: backup export and import', () => {
  const a = makeStore({ t: 100 });
  a.put('weights', { id: 'w-1', date: '2026-11-12', kg: 84.2 });
  const b = makeStore({ t: 50 });
  b.put('weights', { id: 'w-1', date: '2026-11-12', kg: 90 });
  eq(b.importData(JSON.parse(JSON.stringify(a.exportData()))), 1);
  eq(b.get('weights', 'w-1').kg, 84.2, 'the newer record wins');
  eq(b.importData(a.exportData()), 0, 'importing the same file again changes nothing');
  let threw = false;
  try {
    b.importData({ foo: 1 });
  } catch (err) {
    threw = true;
  }
  ok(threw, 'rejects files that are not trakr backups');
});

// ---- sync against the real script ----

const source = await (await fetch('../apps-script/Code.gs')).text();

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function world(opts) {
  const gas = makeFakeGas(opts);
  const script = loadScript(source, gas);
  const clock = { t: 1000 };
  const device = ({ seeded = false, secret = 'test-secret' } = {}) => {
    const store = makeStore(clock);
    if (seeded) seed(store);
    const sync = new Sync(store, { transport: scriptTransport(script), storage: fakeStorage() });
    sync.configure({ url: 'https://script.test/exec', secret });
    return { store, sync };
  };
  const tab = (name) => (gas.sheets.get(name) ? gas.sheets.get(name).records() : []);
  return { gas, script, clock, device, tab };
}

test('script: answers GET and rejects a wrong secret', async () => {
  const w = world();
  eq(JSON.parse(w.script.doGet().text).ok, true);
  const bad = w.device({ secret: 'nope' });
  await rejects(bad.sync.syncNow(), 'Wrong secret');
  eq(bad.sync.state.status, 'error');
});

test('script: refuses to run with the default secret', async () => {
  const gas = makeFakeGas();
  const script = loadScript(source, gas, 'change-me');
  const res = JSON.parse(script.doPost({ postData: { contents: JSON.stringify({ secret: 'change-me' }) } }).text);
  eq(res.ok, false);
});

test('sync: a weigh-in travels from one device to another', async () => {
  const w = world();
  const a = w.device();
  const b = w.device();
  a.store.put('weights', { id: 'w-2026-11-12', date: '2026-11-12', kg: 84.2 });
  await a.sync.syncNow();
  eq(a.store.get('weights', 'w-2026-11-12')._dirty, false);
  const rows = w.tab('weights');
  eq(rows.length, 1);
  ok(rows[0].date instanceof Date, 'the sheet holds a real date');
  eq(rows[0].kg, 84.2);
  eq(rows[0].deleted, false);
  await b.sync.syncNow();
  const got = b.store.get('weights', 'w-2026-11-12');
  eq([got.date, got.kg, got._dirty, got._synced], ['2026-11-12', 84.2, false, true]);
  ok(!('rev' in got), 'the revision column stays on the server');
});

test('sync: an edit on the second device comes back to the first', async () => {
  const w = world();
  const a = w.device();
  const b = w.device();
  a.store.put('weights', { id: 'w-1', date: '2026-11-12', kg: 84.2 });
  await a.sync.syncNow();
  await b.sync.syncNow();
  w.clock.t = 2000;
  b.store.patch('weights', 'w-1', { kg: 83.9 });
  await b.sync.syncNow();
  await a.sync.syncNow();
  eq(a.store.get('weights', 'w-1').kg, 83.9);
  eq(w.tab('weights').length, 1, 'an edit updates the row in place');
});

test('sync: when both devices edit offline, the later edit wins on both', async () => {
  for (const order of ['a-first', 'b-first']) {
    const w = world();
    const a = w.device();
    const b = w.device();
    a.store.put('weights', { id: 'w-1', date: '2026-11-12', kg: 84 });
    await a.sync.syncNow();
    await b.sync.syncNow();
    w.clock.t = 2000;
    a.store.patch('weights', 'w-1', { kg: 83 });
    w.clock.t = 3000;
    b.store.patch('weights', 'w-1', { kg: 82 });
    if (order === 'a-first') {
      await a.sync.syncNow();
      await b.sync.syncNow();
    } else {
      await b.sync.syncNow();
      await a.sync.syncNow();
    }
    await a.sync.syncNow();
    await b.sync.syncNow();
    eq([a.store.get('weights', 'w-1').kg, b.store.get('weights', 'w-1').kg], [82, 82], order);
    eq(w.tab('weights')[0].kg, 82, order);
    eq(a.store.dirtySnapshot().count + b.store.dirtySnapshot().count, 0, 'nothing left to push');
  }
});

test('sync: a delete reaches the other device', async () => {
  const w = world();
  const a = w.device();
  const b = w.device();
  a.store.put('weights', { id: 'w-1', date: '2026-11-12', kg: 84 });
  await a.sync.syncNow();
  await b.sync.syncNow();
  w.clock.t = 2000;
  a.store.remove('weights', 'w-1');
  await a.sync.syncNow();
  await b.sync.syncNow();
  eq(b.store.get('weights', 'w-1'), undefined);
  eq(w.tab('weights')[0].deleted, true, 'the row stays in the sheet, marked deleted');
});

test('sync: starter data from two devices does not duplicate', async () => {
  const w = world();
  const a = w.device({ seeded: true });
  const b = w.device({ seeded: true });
  const count = a.store.list('exercises').length;
  ok(count > 20);
  await a.sync.syncNow();
  await b.sync.syncNow();
  await a.sync.syncNow();
  eq(w.tab('exercises').length, count);
  eq(w.tab('routines').length, 3);
  eq(b.store.list('exercises').length, count);
  eq(a.store.dirtySnapshot().count + b.store.dirtySnapshot().count, 0);
});

test('sync: deleting a starter routine sticks on a freshly seeded device', async () => {
  const w = world();
  const a = w.device({ seeded: true });
  await a.sync.syncNow();
  w.clock.t = 2000;
  a.store.remove('routines', 'routine-legs');
  a.store.patch('routines', 'routine-push', { name: 'Push day' });
  await a.sync.syncNow();
  const b = w.device({ seeded: true });
  await b.sync.syncNow();
  eq(b.store.get('routines', 'routine-legs'), undefined);
  eq(b.store.get('routines', 'routine-push').name, 'Push day');
  eq(b.store.get('routines', 'routine-push').exerciseIds.length, 5, 'the exercise list survives as an array');
});

test('sync: a workout is pushed when finished, with done sets only', async () => {
  const w = world();
  const a = w.device();
  const b = w.device();
  a.store.put('workouts', { id: 'wk', date: '2026-11-12', name: 'Push', color: 'peach', startedAt: 500, exerciseIds: ['ex-bench-press'] });
  a.store.put('sets', { id: 's1', workoutId: 'wk', exerciseId: 'ex-bench-press', exercise: 'Bench press', date: '2026-11-12', n: 1, kg: 60, reps: 8, rpe: 7.5, done: true });
  a.store.put('sets', { id: 's2', workoutId: 'wk', exerciseId: 'ex-bench-press', exercise: 'Bench press', date: '2026-11-12', n: 2, reps: 12, done: true });
  a.store.put('sets', { id: 's3', workoutId: 'wk', exerciseId: 'ex-bench-press', exercise: 'Bench press', date: '2026-11-12', n: 3, done: false });
  await a.sync.syncNow();
  eq(w.tab('workouts').length + w.tab('sets').length, 0, 'nothing is in the sheet while the workout runs');
  a.store.remove('sets', 's3');
  a.store.patch('workouts', 'wk', { finishedAt: 900 });
  await a.sync.syncNow();
  eq(w.tab('workouts').length, 1);
  const rows = w.tab('sets');
  eq(rows.map((r) => r.id).sort(), ['s1', 's2']);
  eq(rows.find((r) => r.id === 's1').rpe, 7.5);
  eq(rows.find((r) => r.id === 's2').kg, '', 'a bodyweight set has an empty kg cell');
  await b.sync.syncNow();
  const wk = b.store.get('workouts', 'wk');
  eq([wk.name, wk.color, wk.startedAt, wk.finishedAt, wk.exerciseIds], ['Push', 'peach', 500, 900, ['ex-bench-press']]);
  const s2 = b.store.get('sets', 's2');
  eq([s2.kg, s2.reps, s2.rpe, s2.done, s2.exercise], [undefined, 12, undefined, true, 'Bench press']);
  b.store.remove('sets', 's2');
  eq(b.store.raw('sets', 's2').deleted, true, 'a synced set leaves a tombstone when deleted');
});

test('sync: settings and odd exercise names keep their text', async () => {
  const w = world();
  const a = w.device();
  const b = w.device();
  a.store.setSetting('goalKg', '78');
  a.store.setSetting('measurements', '["waist","chest"]');
  a.store.put('exercises', { id: 'e1', name: '10-12' });
  a.store.put('exercises', { id: 'e2', name: '2026-01-05' });
  await a.sync.syncNow();
  await b.sync.syncNow();
  eq(b.store.setting('goalKg'), '78');
  eq(b.store.setting('measurements'), '["waist","chest"]');
  eq(b.store.get('exercises', 'e1').name, '10-12');
  eq(b.store.get('exercises', 'e2').name, '2026-01-05');
});

test('sync: the sheet grows past its row limit', async () => {
  const w = world({ maxRows: 5 });
  const a = w.device();
  const b = w.device();
  for (let i = 0; i < 20; i++) {
    const date = addDays('2026-10-01', i);
    a.store.put('weights', { id: `w-${date}`, date, kg: 90 - i * 0.1 });
  }
  await a.sync.syncNow();
  eq(w.tab('weights').length, 20);
  await b.sync.syncNow();
  eq(b.store.list('weights').length, 20);
  eq(b.store.get('weights', 'w-2026-10-20').date, '2026-10-20');
});

test('sync: a sync with no changes does not move the revision', async () => {
  const w = world();
  const a = w.device();
  a.store.put('weights', { id: 'w-1', date: '2026-11-12', kg: 84 });
  await a.sync.syncNow();
  const rev = a.sync.cfg.lastRev;
  await a.sync.syncNow();
  await a.sync.syncNow();
  eq(a.sync.cfg.lastRev, rev);
  eq(w.gas.props.get('rev'), String(rev));
});

test('sync: an edit made during a sync is pushed by the next one', async () => {
  const w = world();
  const a = w.device();
  a.store.put('weights', { id: 'w-1', date: '2026-11-12', kg: 84 });
  const inner = a.sync.transport;
  a.sync.transport = async (url, payload) => {
    const res = await inner(url, payload);
    w.clock.t = 5000;
    a.store.patch('weights', 'w-1', { kg: 80 });
    return res;
  };
  await a.sync.syncNow();
  a.sync.transport = inner;
  eq(a.store.get('weights', 'w-1')._dirty, true);
  await a.sync.syncNow();
  eq(w.tab('weights')[0].kg, 80);
});

test('sync: "send everything again" does not duplicate rows', async () => {
  const w = world();
  const a = w.device({ seeded: true });
  a.store.put('weights', { id: 'w-1', date: '2026-11-12', kg: 84 });
  await a.sync.syncNow();
  const before = w.tab('exercises').length;
  a.sync.reset();
  ok(a.store.dirtySnapshot().count > before);
  await a.sync.syncNow();
  eq(w.tab('exercises').length, before);
  eq(w.tab('weights').length, 1);
});

// ---- offline file list ----

test('service worker: every file the app loads is in its offline list', async () => {
  const sw = await (await fetch('../sw.js')).text();
  const listed = new Set([...sw.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1]));
  ok(listed.size > 20, 'found the ASSETS list');

  // Every listed file must exist, or installing the service worker fails.
  for (const path of listed) {
    const res = await fetch('../' + path);
    ok(res.ok, `listed file is missing: ${path}`);
  }

  // Follow imports from the entry module and check each one is listed.
  const root = new URL('../', location.href).href;
  const seen = new Set();
  const queue = [new URL('../src/main.js', location.href).href];
  while (queue.length) {
    const url = queue.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const code = await (await fetch(url)).text();
    for (const m of code.matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) queue.push(new URL(m[1], url).href);
  }
  const missing = [...seen].map((u) => u.slice(root.length)).filter((p) => !listed.has(p));
  eq(missing, [], 'modules missing from ASSETS in sw.js');

  const html = await (await fetch('../index.html')).text();
  for (const m of html.matchAll(/(?:href|src)="((?!https?:)[^"#]+)"/g)) ok(listed.has(m[1]), `index.html loads ${m[1]}, which is not listed`);
});

// ---- run ----

const out = document.getElementById('out');
let failed = 0;
for (const t of tests) {
  const line = document.createElement('li');
  try {
    await t.fn();
    line.textContent = `PASS  ${t.name}`;
  } catch (err) {
    failed++;
    line.textContent = `FAIL  ${t.name}: ${err.message}`;
    line.className = 'fail';
    console.error(t.name, err);
  }
  out.appendChild(line);
}
const summary = `${tests.length - failed} of ${tests.length} tests passed`;
document.getElementById('summary').textContent = summary;
document.title = failed ? `FAILED: ${summary}` : `OK: ${summary}`;
