import { html, useMemo, useState } from '../deps.js';
import * as act from '../lib/actions.js';
import { buildHistory, setScore } from '../lib/calc.js';
import { db } from '../lib/db.js';
import { COLORS } from '../lib/seed.js';
import { toW, wUnit } from '../lib/units.js';
import { fmtMedium, fmtShort } from '../lib/util.js';
import { LineChart } from '../ui/charts.js';
import { Icon } from '../ui/icon.js';
import { Head, TextInput, toast } from '../ui/parts.js';
import { back, go } from '../ui/router.js';
import { BestLifts, ExercisePicker, HistoryList, WeekCard, dayNumber, liftKg } from '../ui/sections.js';

export function Training() {
  return html`
    <div class="screen">
      <${Head} title="Training">
        <a class="btn outline" href="#/routines"><${Icon} name="list" size=${18} sw=${2.5} /><span>Routines</span></a>
      <//>
      <div class="training-grid">
        <div class="side-col">
          <${WeekCard} />
          <div class="rise d2"><${BestLifts} limit=${5} /></div>
        </div>
        <div class="rise d3"><${HistoryList} limit=${8} /></div>
      </div>
    </div>
  `;
}

// ---- Routines ----

export function Routines() {
  const routines = act.routinesInOrder();
  const names = (r) =>
    r.exerciseIds
      .map((id) => db.get('exercises', id))
      .filter(Boolean)
      .map((e) => e.name)
      .join(', ');
  return html`
    <div class="screen narrow">
      <${Head} title="Routines" backTo="/training">
        <button class="btn ink" onClick=${() => go('/routine/' + act.createRoutine())}><${Icon} name="plus" size=${18} sw=${2.5} /><span>New</span></button>
      <//>
      ${!routines.length && html`<p class="empty">No routines yet. A routine is a saved list of exercises that you can start with one tap.</p>`}
      <div class="rows rise d1">
        ${routines.map(
          (r) => html`
            <a key=${r.id} class="row tall" href=${'#/routine/' + r.id}>
              <span class=${'round ' + r.color}><${Icon} name="dumbbell" size=${18} /></span>
              <span class="row-main">
                <span class="row-title">${r.name}</span>
                <span class="row-sub">${names(r) || 'No exercises yet'}</span>
              </span>
              <${Icon} name="chevronRight" size=${18} />
            </a>
          `,
        )}
      </div>
    </div>
  `;
}

export function RoutineEdit({ id }) {
  const [picker, setPicker] = useState(false);
  const r = db.get('routines', id);
  if (!r) {
    return html`<div class="screen narrow"><${Head} title="Routine not found" backTo="/routines" /></div>`;
  }
  const save = (fields) => db.patch('routines', id, fields);
  const ids = r.exerciseIds.filter((x) => db.get('exercises', x));
  const move = (i, dir) => {
    const next = [...ids];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save({ exerciseIds: next });
  };
  const remove = () => {
    if (!window.confirm(`Delete the routine "${r.name}"? Workouts you already logged stay.`)) return;
    act.deleteRoutine(id);
    toast('Routine deleted');
    back('/routines');
  };
  return html`
    <div class="screen narrow">
      <${Head} title="Edit routine" backTo="/routines" />
      <section class="section rise d1">
        <label class="field">
          <span class="field-label">Name</span>
          <${TextInput} value=${r.name} label="Routine name" onCommit=${(name) => name && save({ name })} />
        </label>
        <div class="field">
          <span class="field-label">Color</span>
          <div class="swatches">
            ${COLORS.map(
              (c) => html`
                <button key=${c} class=${`swatch ${c}${r.color === c ? ' on' : ''}`} aria-label=${c} aria-pressed=${r.color === c ? 'true' : 'false'} onClick=${() => save({ color: c })}>
                  ${r.color === c && html`<${Icon} name="check" size=${18} sw=${2.5} />`}
                </button>
              `,
            )}
          </div>
        </div>
      </section>
      <section class="section rise d2">
        <div class="section-head"><h2 class="h2">Exercises</h2></div>
        ${!ids.length && html`<p class="empty">Add the exercises you do in this routine, in the order you do them.</p>`}
        <div class="rows">
          ${ids.map(
            (x, i) => html`
              <div key=${x} class="row static">
                <span class="badge">${i + 1}</span>
                <span class="row-main"><span class="row-title">${db.get('exercises', x).name}</span></span>
                <button class="icon-btn sm" aria-label="Move up" disabled=${i === 0} onClick=${() => move(i, -1)}><${Icon} name="arrowUp" size=${18} /></button>
                <button class="icon-btn sm" aria-label="Move down" disabled=${i === ids.length - 1} onClick=${() => move(i, 1)}><${Icon} name="arrowDown" size=${18} /></button>
                <button class="icon-btn sm" aria-label="Remove from routine" onClick=${() => save({ exerciseIds: ids.filter((y) => y !== x) })}><${Icon} name="x" size=${18} /></button>
              </div>
            `,
          )}
        </div>
        <button class="btn dashed" onClick=${() => setPicker(true)}><${Icon} name="plus" size=${18} sw=${2.5} /><span>Add exercise</span></button>
      </section>
      <button class="link-btn danger" onClick=${remove}>Delete routine</button>
      ${picker && html`<${ExercisePicker} multi exclude=${ids} onPick=${(x) => save({ exerciseIds: [...(db.get('routines', id).exerciseIds || []), x] })} onClose=${() => setPicker(false)} />`}
    </div>
  `;
}

// ---- One exercise over time ----

export function ExerciseDetail({ id }) {
  const v = db.version;
  const sys = act.units();
  const unit = wUnit(sys);
  const fmtKg = liftKg(sys);
  const sessions = useMemo(() => buildHistory(act.finishedWorkouts(), db.list('sets')).get(id) || [], [v, id]);
  const ex = db.raw('exercises', id);
  const name = (ex && ex.name) || (sessions[0] && sessions[0].sets[0].exercise) || 'Exercise';
  const exists = ex && !ex.deleted;

  // Loaded exercises chart the top weight per workout. Bodyweight ones chart top reps.
  const loaded = sessions.some((s) => s.sets.some((x) => x.kg > 0));
  const top = (s) => (loaded ? toW(Math.max(...s.sets.map((x) => x.kg || 0)), sys) : Math.max(...s.sets.map((x) => x.reps || 0)));
  const dots = sessions.map((s) => ({ x: dayNumber(s.workout.date), y: top(s), label: fmtShort(s.workout.date) }));
  let best;
  for (const s of sessions) for (const x of s.sets) if (!best || setScore(x) > setScore(best)) best = x;

  const remove = () => {
    if (!window.confirm(`Delete "${name}" from your exercise list? Logged sets stay in your history.`)) return;
    act.deleteExercise(id);
    toast('Exercise deleted');
    back('/training');
  };
  const setLabel = (x) => `${x.kg > 0 ? `${fmtKg(x.kg)} × ${x.reps}` : `${x.reps}`}${x.rpe ? ` @${x.rpe}` : ''}`;

  return html`
    <div class="screen narrow">
      <${Head} title=${name} backTo="/training" />
      ${best
        ? html`
            <section class="card peach rise d1">
              <div class="card-split">
                <div class="col">
                  <div class="card-label"><${Icon} name="star" /><span>Best set</span></div>
                  <div class="big">
                    <span class="big-num md">${best.kg > 0 ? fmtKg(best.kg) : best.reps}</span>
                    <span class="big-unit">${best.kg > 0 ? `${unit} × ${best.reps}` : 'reps'}</span>
                  </div>
                </div>
                <div class="col end"><span class="card-note">${loaded ? `Top weight per workout, ${unit}` : 'Top reps per workout'}</span></div>
              </div>
              <${LineChart} onPastel dots=${dots} height=${150} fmtY=${(n) => String(Math.round(n * 10) / 10)} label=${`${name}: best set per workout`} />
            </section>
            <section class="section rise d2">
              <div class="section-head"><h2 class="h2">History</h2></div>
              <div class="rows">
                ${[...sessions].reverse().map(
                  (s) => html`
                    <a key=${s.workout.id} class="row tall" href=${'#/workout/' + s.workout.id}>
                      <span class="row-main">
                        <span class="row-title">${fmtMedium(s.workout.date)}</span>
                        <span class="row-sub wrap">${s.sets.map(setLabel).join(', ')}</span>
                      </span>
                      <${Icon} name="chevronRight" size=${18} />
                    </a>
                  `,
                )}
              </div>
            </section>
          `
        : html`<p class="empty rise d1">No sets logged for this exercise yet.</p>`}
      ${exists &&
      html`<section class="section rise d3">
        <label class="field">
          <span class="field-label">Name</span>
          <${TextInput} value=${ex.name} label="Exercise name" onCommit=${(n) => n && act.renameExercise(id, n)} />
        </label>
        <button class="link-btn danger" onClick=${remove}>Delete exercise</button>
      </section>`}
    </div>
  `;
}
