// Sections and sheets that more than one screen uses.

import { html, useEffect, useMemo, useRef, useState } from '../deps.js';
import * as act from '../lib/actions.js';
import { bestLifts, buildHistory, byKey, fmtSet, routineLastDone, trendSeries, weekCounts, weekDays, weightStats } from '../lib/calc.js';
import { db } from '../lib/db.js';
import { MEASUREMENT_TYPES } from '../lib/seed.js';
import { fromL, fromW, lUnit, toL, toW, wUnit } from '../lib/units.js';
import { addDays, ago, daysBetween, fix1, fmtClock, fmtMedium, fmtMinutes, fmtShort, parseDate, parseNum, today, trimNum, weekdayName } from '../lib/util.js';
import { LineChart, Sparkline } from './charts.js';
import { useNow } from './hooks.js';
import { Icon } from './icon.js';
import { Sheet, toast } from './parts.js';
import { go } from './router.js';

export const dayNumber = (date) => daysBetween('2020-01-01', date);
export const measurementName = (type) => (MEASUREMENT_TYPES.find((m) => m.id === type) || { name: type }).name;
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const liftKg = (sys) => (kg) => trimNum(toW(kg, sys));

// Focuses a field when its sheet opens. With select, an existing value is
// selected so typing replaces it.
function useAutoFocus(select = false) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.focus();
    if (select) ref.current.select();
  }, []);
  return ref;
}

// ---- Weight ----

const RANGES = [
  ['1M', 30],
  ['3M', 91],
  ['6M', 182],
  ['All', 0],
];

// Weigh-ins as dots, the trend as a line, with a range switch underneath.
export function TrendChart({ series, goal, sys, height = 160 }) {
  const [range, setRange] = useState('1M');
  const days = RANGES.find((r) => r[0] === range)[1];
  const from = days ? addDays(today(), -days) : '';
  const shown = series.filter((p) => p.date >= from);
  const dots = shown.map((p) => ({ x: dayNumber(p.date), y: toW(p.kg, sys), label: fmtShort(p.date) }));
  const line = shown.map((p) => ({ x: dayNumber(p.date), y: toW(p.trend, sys), label: fmtShort(p.date) }));
  return html`
    <div class="trend-chart">
      ${shown.length
        ? html`<${LineChart}
            key=${range}
            onPastel
            dots=${dots}
            line=${line}
            goal=${goal === undefined ? undefined : toW(goal, sys)}
            height=${height}
            label="Weight over time. Dots are weigh-ins, the line is the trend."
          />`
        : html`<p class="chart-empty" style=${`height:${height}px`}>No weigh-ins in this period.</p>`}
      <div class="range-row" role="group" aria-label="Chart period">
        ${RANGES.map(
          ([id]) => html`<button key=${id} class=${'range' + (range === id ? ' on' : '')} aria-pressed=${range === id ? 'true' : 'false'} onClick=${() => setRange(id)}>${id}</button>`,
        )}
      </div>
    </div>
  `;
}

export function GoalChip({ goal, sys, onClick, solid }) {
  return html`<button class=${'chip chip-btn' + (solid ? ' solid' : '')} onClick=${onClick}>
    <${Icon} name="target" size=${14} sw=${2.5} />
    <span>${goal ? `Goal ${fix1(toW(goal, sys))}` : 'Set a goal'}</span>
  </button>`;
}

// The weight card on Today. On a wide screen it also holds the chart.
export function WeightCard({ big }) {
  const v = db.version;
  const sys = act.units();
  const unit = wUnit(sys);
  const series = useMemo(() => trendSeries(db.list('weights')), [v]);
  const [sheet, setSheet] = useState(null);
  const stats = weightStats(series);
  const goal = act.goalKg();
  const sheets = [
    sheet === 'log' && html`<${LogWeightSheet} key="log" onClose=${() => setSheet(null)} />`,
    sheet === 'goal' && html`<${GoalSheet} key="goal" onClose=${() => setSheet(null)} />`,
  ];

  if (!stats) {
    return html`
      <section class="card lilac weight-card rise d1">
        <div class="card-top">
          <div class="card-label"><${Icon} name="body" /><span>Weight</span></div>
        </div>
        <p class="card-empty">No weigh-ins yet. Log one each morning and the trend line shows where your weight is really heading.</p>
        <button class="btn on-pastel-ink" onClick=${() => setSheet('log')}><${Icon} name="plus" size=${18} sw=${2.5} /><span>Log weight</span></button>
      </section>
      ${sheets}
    `;
  }

  const loggedToday = stats.date === today();
  return html`
    <section class="card lilac weight-card rise d1">
      <div class="card-top">
        <div class="card-label"><${Icon} name="body" /><span>Weight</span></div>
        ${loggedToday
          ? html`<button class="icon-btn on-pastel" aria-label="Edit today's weight" onClick=${() => setSheet('log')}><${Icon} name="pencil" size=${18} /></button>`
          : html`<button class="btn sm on-pastel-ink" onClick=${() => setSheet('log')}><${Icon} name="plus" size=${16} sw=${2.5} /><span>Log today</span></button>`}
      </div>
      <div class="big-row">
        <div class="big"><span class="big-num">${fix1(toW(stats.kg, sys))}</span><span class="big-unit">${unit}</span></div>
        ${!big && html`<${Sparkline} values=${series.slice(-14).map((p) => p.kg)} w=${124} h=${48} draw dot />`}
      </div>
      <div class="chips">
        ${!loggedToday && html`<span class="chip">Logged ${ago(stats.date)}</span>`}
        ${stats.d7 !== undefined &&
        html`<span class="chip solid">
          <${Icon} name=${stats.d7 > 0 ? 'trendUp' : 'trendDown'} size=${14} sw=${2.5} />
          <span>${fix1(Math.abs(toW(stats.d7, sys)))} ${unit} in 7 days</span>
        </span>`}
        ${big && html`<span class="chip">Trend ${fix1(toW(stats.trend, sys))}</span>`}
        <${GoalChip} goal=${goal} sys=${sys} onClick=${() => setSheet('goal')} />
      </div>
      ${big && html`<${TrendChart} series=${series} goal=${goal} sys=${sys} height=${200} />`}
    </section>
    ${sheets}
  `;
}

export function LogWeightSheet({ onClose, date: initialDate }) {
  const sys = act.units();
  const unit = wUnit(sys);
  const text0 = (d) => {
    const rec = db.get('weights', `w-${d}`);
    return rec ? fix1(toW(rec.kg, sys)) : '';
  };
  const [date, setDate] = useState(initialDate || today());
  const [text, setText] = useState(() => text0(initialDate || today()));
  const ref = useAutoFocus(true);
  const existing = db.get('weights', `w-${date}`);
  const latest = [...db.list('weights')].sort(byKey((w) => w.date)).pop();
  const value = parseNum(text);
  const valid = value !== undefined && value > 0 && value < 1500;

  const save = (e) => {
    e.preventDefault();
    if (!valid) return;
    act.logWeight(date, fromW(value, sys));
    toast('Weight saved');
    onClose();
  };
  const remove = () => {
    act.deleteWeight(date);
    toast('Weigh-in deleted');
    onClose();
  };

  return html`
    <${Sheet} title=${existing ? 'Edit weight' : 'Log weight'} onClose=${onClose}>
      <form class="form" onSubmit=${save}>
        <label class="big-field">
          <input
            ref=${ref}
            class="big-input"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            enterkeyhint="done"
            aria-label=${`Weight in ${unit}`}
            placeholder=${latest ? fix1(toW(latest.kg, sys)) : '0.0'}
            value=${text}
            onInput=${(e) => setText(e.target.value)}
          />
          <span class="big-unit">${unit}</span>
        </label>
        <label class="field">
          <span class="field-label">Date</span>
          <input
            class="input"
            type="date"
            max=${today()}
            value=${date}
            onInput=${(e) => {
              const d = e.target.value;
              if (!d || d > today()) return;
              setDate(d);
              setText(text0(d));
            }}
          />
        </label>
        <div class="form-actions">
          ${existing && html`<button type="button" class="btn ghost danger" onClick=${remove}><${Icon} name="trash" size=${18} /><span>Delete</span></button>`}
          <button type="submit" class="btn ink wide" disabled=${!valid}>Save</button>
        </div>
      </form>
    <//>
  `;
}

export function GoalSheet({ onClose }) {
  const sys = act.units();
  const unit = wUnit(sys);
  const goal = act.goalKg();
  const [text, setText] = useState(goal ? fix1(toW(goal, sys)) : '');
  const ref = useAutoFocus(true);
  const value = parseNum(text);
  const valid = value !== undefined && value > 0 && value < 1500;
  const save = (e) => {
    e.preventDefault();
    if (!valid) return;
    db.setSetting('goalKg', fromW(value, sys));
    toast('Goal saved');
    onClose();
  };
  const clear = () => {
    db.setSetting('goalKg', '');
    onClose();
  };
  return html`
    <${Sheet} title="Goal weight" onClose=${onClose}>
      <form class="form" onSubmit=${save}>
        <label class="big-field">
          <input ref=${ref} class="big-input" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-label=${`Goal weight in ${unit}`} placeholder="0.0" value=${text} onInput=${(e) => setText(e.target.value)} />
          <span class="big-unit">${unit}</span>
        </label>
        <p class="help">The chart shows the goal as a dashed line, and Body shows how far the trend is from it.</p>
        <div class="form-actions">
          ${goal && html`<button type="button" class="btn ghost" onClick=${clear}>Remove goal</button>`}
          <button type="submit" class="btn ink wide" disabled=${!valid}>Save</button>
        </div>
      </form>
    <//>
  `;
}

// ---- Measurements ----

export function LogMeasurementsSheet({ onClose }) {
  const sys = act.units();
  const unit = lUnit(sys);
  const types = act.trackedMeasurements();
  const load = (d) =>
    Object.fromEntries(
      types.map((t) => {
        const rec = db.get('measurements', `m-${d}-${t}`);
        return [t, rec ? fix1(toL(rec.cm, sys)) : ''];
      }),
    );
  const [date, setDate] = useState(today());
  const [initial, setInitial] = useState(() => load(today()));
  const [vals, setVals] = useState(initial);
  const latest = (t) => {
    const rows = db.list('measurements').filter((m) => m.type === t && m.date <= date).sort(byKey((m) => m.date));
    return rows.length ? fix1(toL(rows[rows.length - 1].cm, sys)) : '';
  };

  const save = (e) => {
    e.preventDefault();
    let changed = 0;
    db.batch(() => {
      for (const t of types) {
        if (vals[t] === initial[t]) continue;
        const v = parseNum(vals[t]);
        if (v !== undefined && v > 0) {
          act.logMeasurement(date, t, fromL(v, sys));
          changed++;
        } else if (vals[t].trim() === '' && initial[t] !== '') {
          act.deleteMeasurement(date, t);
          changed++;
        }
      }
    });
    if (changed) toast('Measurements saved');
    onClose();
  };

  return html`
    <${Sheet} title="Log measurements" onClose=${onClose}>
      <form class="form" onSubmit=${save}>
        <p class="help">Fill in the ones you measured. Leave the rest empty.</p>
        ${types.map(
          (t) => html`
            <label class="field inline" key=${t}>
              <span class="field-label">${measurementName(t)}</span>
              <span class="unit-input">
                <input
                  class="input num"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder=${latest(t)}
                  value=${vals[t]}
                  onInput=${(e) => setVals({ ...vals, [t]: e.target.value })}
                />
                <span class="muted">${unit}</span>
              </span>
            </label>
          `,
        )}
        <label class="field inline">
          <span class="field-label">Date</span>
          <input
            class="input"
            type="date"
            max=${today()}
            value=${date}
            onInput=${(e) => {
              const d = e.target.value;
              if (!d || d > today()) return;
              const next = load(d);
              setDate(d);
              setInitial(next);
              setVals(next);
            }}
          />
        </label>
        <div class="form-actions">
          <button type="submit" class="btn ink wide">Save</button>
        </div>
      </form>
    <//>
  `;
}

export function MeasurementsList() {
  const v = db.version;
  const sys = act.units();
  const types = act.trackedMeasurements();
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () =>
      types.map((type) => {
        const entries = db.list('measurements').filter((m) => m.type === type).sort(byKey((m) => m.date));
        return { type, last: entries[entries.length - 1], prev: entries[entries.length - 2] };
      }),
    [v, types.join()],
  );
  return html`
    <section class="section">
      <div class="section-head">
        <h2 class="h2">Measurements</h2>
        <span class="section-side">
          <span class="muted">${lUnit(sys)}</span>
          <button class="btn sm soft" onClick=${() => setOpen(true)}><${Icon} name="plus" size=${16} sw=${2.5} /><span>Log</span></button>
        </span>
      </div>
      ${!types.length && html`<p class="empty">No measurements selected. Pick some in Settings.</p>`}
      <div class="rows">
        ${rows.map((r) => {
          const diff = r.last && r.prev ? toL(r.last.cm, sys) - toL(r.prev.cm, sys) : null;
          return html`
            <a key=${r.type} class="row" href=${'#/body/m/' + r.type}>
              <span class="round sky"><${Icon} name="ruler" size=${18} /></span>
              <span class="row-main">
                <span class="row-title">${measurementName(r.type)}</span>
                <span class="row-sub">${r.last ? fmtMedium(r.last.date) : 'Not measured yet'}</span>
              </span>
              ${r.last && html`<span class="row-value">${fix1(toL(r.last.cm, sys))}</span>`}
              ${diff !== null &&
              html`<span class="delta">
                ${Math.abs(diff) >= 0.05 && html`<${Icon} name=${diff > 0 ? 'arrowUp' : 'arrowDown'} size=${12} sw=${3} />`}
                <span>${fix1(Math.abs(diff))}</span>
              </span>`}
            </a>
          `;
        })}
      </div>
    </section>
    ${open && html`<${LogMeasurementsSheet} onClose=${() => setOpen(false)} />`}
  `;
}

// ---- Workouts ----

function ResumeCard({ workout }) {
  const now = useNow(true);
  const done = act.setsOf(workout.id).filter((s) => s.done).length;
  return html`
    <a class=${'resume ' + (workout.color || 'butter')} href=${'#/workout/' + workout.id}>
      <span class="resume-main">
        <span class="tile-name">${workout.name}</span>
        <span class="tile-meta tnum">${fmtClock(now - workout.startedAt)} · ${plural(done, 'set')} done</span>
      </span>
      <span class="resume-go"><span>Resume</span><${Icon} name="arrowRight" size=${18} sw=${2.5} /></span>
    </a>
  `;
}

// Routine tiles. The routine you have not done for the longest comes first.
export function StartWorkout() {
  const v = db.version;
  const active = act.activeWorkout();
  const last = useMemo(() => routineLastDone(act.finishedWorkouts()), [v]);
  const routines = act.routinesInOrder().sort(byKey((r) => last.get(r.id) || ''));
  const start = (routine) => go('/workout/' + act.startWorkout(routine));
  const when = (r) => {
    const text = last.get(r.id) ? ago(last.get(r.id)) : 'not done yet';
    return text[0].toUpperCase() + text.slice(1);
  };
  return html`
    <section class="section rise d2">
      <div class="section-head"><h2 class="h2">${active ? 'Workout in progress' : 'Start a workout'}</h2></div>
      ${active
        ? html`<${ResumeCard} workout=${active} />`
        : html`
            <div class="tiles">
              ${routines.map(
                (r) => html`
                  <button key=${r.id} class=${'tile ' + r.color} onClick=${() => start(r)}>
                    <span class="tile-top"><span class="tile-name">${r.name}</span><${Icon} name="arrowRight" size=${18} sw=${2.5} /></span>
                    <span class="tile-meta">${when(r)}</span>
                  </button>
                `,
              )}
              <button class="tile blank" onClick=${() => start(null)}>
                <span class="tile-top"><span class="tile-name">Empty</span><${Icon} name="plus" size=${18} sw=${2.5} /></span>
                <span class="tile-meta">Pick as you go</span>
              </button>
            </div>
          `}
    </section>
  `;
}

export function WeekSection({ boxed }) {
  const days = weekDays(act.finishedWorkouts());
  const count = days.reduce((n, d) => n + d.workouts.length, 0);
  return html`
    <section class=${'section week rise d3' + (boxed ? ' boxed' : '')}>
      <div class="section-head">
        <h2 class="h2">This week</h2>
        <span class="muted">${plural(count, 'workout')}</span>
      </div>
      <div class="week-row">
        ${days.map((d, i) => {
          const w = d.workouts[0];
          return html`
            <div key=${d.date} class="day">
              ${w
                ? html`<span class=${'day-dot pop ' + (w.color || 'butter')} style=${`animation-delay:${(0.5 + i * 0.07).toFixed(2)}s`} title=${w.name}>
                    <${Icon} name="check" size=${18} sw=${2.5} />
                  </span>`
                : html`<span class=${'day-dot' + (d.isToday ? ' today' : '')}>${d.isToday && html`<span class="day-pip"></span>`}</span>`}
              <span class=${'day-label' + (d.isToday ? ' on' : '')}>${d.label}</span>
            </div>
          `;
        })}
      </div>
    </section>
  `;
}

// Workouts per week for the last eight weeks.
export function WeekCard() {
  const weeks = weekCounts(act.finishedWorkouts());
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const current = weeks[weeks.length - 1].count;
  return html`
    <section class="card mint week-card rise d1">
      <div class="week-card-main">
        <div class="card-label"><${Icon} name="dumbbell" /><span>This week</span></div>
        <div class="big-col">
          <span class="big-num">${current}</span>
          <span class="card-note">${current === 1 ? 'workout' : 'workouts'} so far</span>
        </div>
      </div>
      <div class="bars-col">
        <div class="bars" role="img" aria-label=${`Workouts per week over the last 8 weeks: ${weeks.map((w) => w.count).join(', ')}`}>
          ${weeks.map(
            (w, i) =>
              html`<span
                key=${w.start}
                class=${'bar' + (i === weeks.length - 1 ? ' now' : '') + (w.count ? '' : ' zero')}
                style=${`height:${w.count ? Math.round((w.count / max) * 76) : 6}px;animation-delay:${(0.3 + i * 0.05).toFixed(2)}s`}
              ></span>`,
          )}
        </div>
        <span class="card-note right">Last 8 weeks</span>
      </div>
    </section>
  `;
}

// The heaviest set per exercise, most recently trained first.
export function BestLifts({ limit }) {
  const v = db.version;
  const sys = act.units();
  const [all, setAll] = useState(false);
  const lifts = useMemo(() => {
    const history = buildHistory(act.finishedWorkouts(), db.list('sets'));
    return bestLifts(history, new Map(db.list('exercises').map((e) => [e.id, e])));
  }, [v]);
  const shown = all || !limit ? lifts : lifts.slice(0, limit);
  return html`
    <section class="section">
      <div class="section-head"><h2 class="h2">Best lifts</h2></div>
      ${!lifts.length && html`<p class="empty">Finish a workout and the heaviest set for each exercise shows up here.</p>`}
      <div class="rows">
        ${shown.map(
          (l) => html`
            <a key=${l.exerciseId} class="row" href=${'#/exercise/' + l.exerciseId}>
              <span class="row-main">
                <span class="row-title">${l.name}</span>
                <span class="row-sub">${fmtMedium(l.bestDate)}</span>
              </span>
              <${Sparkline} values=${l.series} />
              ${l.recent &&
              html`<span class="star-badge" role="img" aria-label="New best this week"><${Icon} name="star" size=${14} sw=${1.5} filled /></span>`}
              <span class="row-value">${fmtSet(l.best, liftKg(sys), wUnit(sys))}</span>
            </a>
          `,
        )}
      </div>
      ${limit && lifts.length > limit && html`<button class="link-btn" onClick=${() => setAll(!all)}>${all ? 'Show fewer' : `Show all ${lifts.length}`}</button>`}
    </section>
  `;
}

export function HistoryList({ limit }) {
  const [all, setAll] = useState(false);
  const workouts = [...act.finishedWorkouts()].sort(byKey((w) => -w.startedAt));
  const shown = all || !limit ? workouts : workouts.slice(0, limit);
  const t = today();
  return html`
    <section class="section">
      <div class="section-head"><h2 class="h2">History</h2></div>
      ${!workouts.length && html`<p class="empty">Finished workouts are listed here. Tap one to see or edit it.</p>`}
      <div class="rows">
        ${shown.map(
          (w) => html`
            <a key=${w.id} class="row" href=${'#/workout/' + w.id}>
              <span class=${'round num ' + (w.color || 'butter')}>${parseDate(w.date).getDate()}</span>
              <span class="row-main">
                <span class="row-title">${w.name}</span>
                <span class="row-sub">
                  ${[daysBetween(w.date, t) < 7 ? weekdayName(w.date) : fmtShort(w.date), plural(w.exerciseIds.length, 'exercise'), fmtMinutes(w.finishedAt - w.startedAt)].join(' · ')}
                </span>
              </span>
              <${Icon} name="chevronRight" size=${18} />
            </a>
          `,
        )}
      </div>
      ${limit && workouts.length > limit && html`<button class="link-btn" onClick=${() => setAll(!all)}>${all ? 'Show fewer' : `Show all ${workouts.length}`}</button>`}
    </section>
  `;
}

// Search the exercise list, or create a new exercise from the search text.
export function ExercisePicker({ exclude = [], onPick, onClose, multi = false }) {
  const [q, setQ] = useState('');
  const ref = useAutoFocus();
  const all = act.exercisesByName();
  const needle = q.trim().toLowerCase();
  const shown = all.filter((e) => !exclude.includes(e.id) && (!needle || e.name.toLowerCase().includes(needle)));
  const exact = all.some((e) => e.name.toLowerCase() === needle);
  const pick = (id) => {
    onPick(id);
    if (multi) setQ('');
    else onClose();
  };
  return html`
    <${Sheet} title="Add exercise" onClose=${onClose}>
      <label class="search">
        <${Icon} name="search" size=${18} />
        <input ref=${ref} class="search-input" type="text" autocomplete="off" placeholder="Search or type a new name" aria-label="Search exercises" value=${q} onInput=${(e) => setQ(e.target.value)} />
      </label>
      <div class="pick-list">
        ${needle &&
        !exact &&
        html`<button class="pick create" onClick=${() => pick(act.createExercise(q))}>
          <${Icon} name="plus" size=${18} sw=${2.5} /><span>Create "${q.trim()}"</span>
        </button>`}
        ${shown.map((e) => html`<button key=${e.id} class="pick" onClick=${() => pick(e.id)}><span>${e.name}</span></button>`)}
        ${!shown.length && !needle && html`<p class="empty">Every exercise is already added. Type a name to create a new one.</p>`}
      </div>
      ${multi && html`<div class="form-actions"><button class="btn ink wide" onClick=${onClose}>Done</button></div>`}
    <//>
  `;
}
