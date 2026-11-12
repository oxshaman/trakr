import { html, useMemo, useRef, useState } from '../deps.js';
import * as act from '../lib/actions.js';
import { bestScoreBefore, buildHistory, byKey, fmtSets, lastSession, setScore } from '../lib/calc.js';
import { db } from '../lib/db.js';
import { fromW, toW, wUnit } from '../lib/units.js';
import { fmtClock, fmtMedium, fmtMinutes, trimNum } from '../lib/util.js';
import { useNow } from '../ui/hooks.js';
import { Icon } from '../ui/icon.js';
import { Head, NumInput, Sheet, toast } from '../ui/parts.js';
import { back } from '../ui/router.js';
import { ExercisePicker, liftKg, plural } from '../ui/sections.js';

// The logging screen. It serves a workout in progress and, with the same
// controls, a finished workout that is being corrected.
export function Workout({ id }) {
  const w = db.get('workouts', id);
  if (!w) {
    return html`
      <div class="screen narrow">
        <${Head} title="Workout not found" backTo="/" />
        <p class="empty">It may have been deleted, here or on another device.</p>
      </div>
    `;
  }
  return html`<${WorkoutView} key=${id} w=${w} />`;
}

function Timer({ from }) {
  const now = useNow(true);
  return html`<span class="tnum">${fmtClock(now - from)}</span>`;
}

// Suggested numbers for a set, shown as grey placeholders. The weight follows
// the previous set of this workout when there is one, else last time's set.
// The reps follow last time's set in the same position.
function suggest(sets, i, last) {
  const ref = last ? last.sets[Math.min(i, last.sets.length - 1)] : undefined;
  let kg = ref ? ref.kg : undefined;
  let reps = ref ? ref.reps : undefined;
  for (let j = i - 1; j >= 0; j--) {
    if (sets[j].kg !== undefined) {
      kg = sets[j].kg;
      break;
    }
  }
  if (reps === undefined) {
    for (let j = i - 1; j >= 0; j--) {
      if (sets[j].reps !== undefined) {
        reps = sets[j].reps;
        break;
      }
    }
  }
  return { kg, reps };
}

function SetRow({ s, hint, sys }) {
  const repsRef = useRef(null);
  const unit = wUnit(sys);
  const patch = (fields) => db.patch('sets', s.id, fields);

  // Marking a set done with empty fields accepts the suggested numbers.
  const toggle = () => {
    const cur = db.get('sets', s.id);
    if (!cur) return;
    if (cur.done) {
      patch({ done: false });
      return;
    }
    const kg = cur.kg !== undefined ? cur.kg : hint.kg;
    const reps = cur.reps !== undefined ? cur.reps : hint.reps;
    if (!reps) {
      if (repsRef.current) repsRef.current.focus();
      return;
    }
    patch({ kg, reps, done: true });
  };

  return html`
    <div class=${'set-grid set-row' + (s.done ? ' done' : '')}>
      <span class="set-n">${s.n}</span>
      <${NumInput}
        cls="cell"
        label=${`Set ${s.n}, weight in ${unit}`}
        value=${s.kg === undefined ? undefined : trimNum(toW(s.kg, sys))}
        placeholder=${hint.kg === undefined ? '' : trimNum(toW(hint.kg, sys))}
        onCommit=${(n) => patch({ kg: n === undefined ? undefined : Math.max(0, fromW(n, sys)) })}
      />
      <${NumInput}
        cls="cell"
        inputRef=${repsRef}
        label=${`Set ${s.n}, reps`}
        value=${s.reps}
        placeholder=${hint.reps === undefined ? '' : String(hint.reps)}
        onCommit=${(n) => patch({ reps: n === undefined ? undefined : Math.max(0, Math.round(n)) })}
      />
      <${NumInput}
        cls="cell"
        label=${`Set ${s.n}, RPE from 1 to 10`}
        value=${s.rpe}
        onCommit=${(n) => patch({ rpe: n === undefined ? undefined : Math.min(10, Math.max(1, Math.round(n * 2) / 2)) })}
      />
      <button class=${'check' + (s.done ? ' on pop' : '')} aria-pressed=${s.done ? 'true' : 'false'} aria-label=${s.done ? `Set ${s.n} is done. Tap to undo.` : `Mark set ${s.n} done`} onClick=${toggle}>
        <${Icon} name="check" size=${22} sw=${2.5} />
      </button>
    </div>
  `;
}

function WorkoutView({ w }) {
  const v = db.version;
  const sys = act.units();
  const unit = wUnit(sys);
  const fmtKg = liftKg(sys);
  const active = !w.finishedAt;
  const color = w.color || 'butter';

  const sets = useMemo(() => act.setsOf(w.id).sort(byKey((s) => s.n)), [v, w.id]);
  const history = useMemo(() => buildHistory(act.finishedWorkouts().filter((x) => x.id !== w.id), db.list('sets')), [v, w.id]);
  const setsFor = (exId) => sets.filter((s) => s.exerciseId === exId);
  const complete = (exId) => {
    const xs = setsFor(exId);
    return xs.length > 0 && xs.every((s) => s.done);
  };

  const [openId, setOpenId] = useState(() => w.exerciseIds.find((x) => !complete(x)) || w.exerciseIds[0] || null);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(null);

  const nameOf = (exId) => {
    const ex = db.raw('exercises', exId);
    const anySet = sets.find((s) => s.exerciseId === exId);
    return (ex && ex.name) || (anySet && anySet.exercise) || 'Exercise';
  };

  const info = (exId) => {
    const xs = setsFor(exId);
    const sessions = history.get(exId);
    const prior = bestScoreBefore(sessions, w.startedAt);
    return {
      xs,
      last: lastSession(sessions, w.startedAt),
      done: xs.filter((s) => s.done).length,
      // A new best needs an earlier workout to beat.
      isBest: prior >= 0 && xs.some((s) => s.done && setScore(s) > prior),
    };
  };

  const close = () => {
    if (!active) act.tidyWorkout(w);
    back(active ? '/' : '/training');
  };

  const finish = () => {
    if (!active) {
      close();
      return;
    }
    if (act.finishWorkout(w)) {
      toast('Workout saved');
      back('/');
    } else if (window.confirm('No sets are marked done yet. Discard this workout?')) {
      act.deleteWorkout(w);
      back('/');
    }
  };

  const discard = () => {
    const question = active ? 'Discard this workout? The sets you logged in it are lost.' : 'Delete this workout and its sets?';
    if (!window.confirm(question)) return;
    act.deleteWorkout(w);
    toast(active ? 'Workout discarded' : 'Workout deleted');
    back(active ? '/' : '/training');
  };

  const openCard = (exId) => {
    const { xs, last, isBest } = info(exId);
    return html`
      <section key=${exId} class=${'card ex-card ' + color}>
        <div class="ex-head">
          <button class="ex-title" aria-expanded="true" onClick=${() => setOpenId(null)}>
            <span class="ex-name">${nameOf(exId)}</span>
            <span class="ex-last">${last ? `Last time ${fmtSets(last.sets, fmtKg, unit)}` : 'First time logging this exercise'}</span>
          </button>
          <button class="icon-btn on-pastel" aria-label=${`Options for ${nameOf(exId)}`} onClick=${() => setMenu(exId)}><${Icon} name="more" sw=${3} /></button>
        </div>
        ${isBest &&
        html`<span class="chip butter best wiggle"><${Icon} name="star" size=${14} sw=${1.5} filled /><span>New best</span></span>`}
        <div class="set-grid set-labels" aria-hidden="true">
          <span>Set</span><span>${unit}</span><span>Reps</span><span>RPE</span><span>Done</span>
        </div>
        <div class="set-rows">${xs.map((s, i) => html`<${SetRow} key=${s.id} s=${s} hint=${suggest(xs, i, last)} sys=${sys} />`)}</div>
        <div class="ex-actions">
          <button class="btn soft-on-pastel wide" onClick=${() => act.addSet(w, exId)}><${Icon} name="plus" size=${18} sw=${2.5} /><span>Add set</span></button>
          ${xs.length > 0 &&
          html`<button class="btn soft-on-pastel square" aria-label="Remove the last set" onClick=${() => act.removeLastSet(w, exId)}><${Icon} name="minus" size=${18} sw=${2.5} /></button>`}
        </div>
      </section>
    `;
  };

  const closedRow = (exId, i) => {
    const { xs, done, isBest } = info(exId);
    const all = xs.length > 0 && done === xs.length;
    return html`
      <button key=${exId} class="ex-row" aria-expanded="false" onClick=${() => setOpenId(exId)}>
        <span class=${'badge' + (all ? ' done' : '')}>${all ? html`<${Icon} name="check" size=${16} sw=${3} />` : i + 1}</span>
        <span class="ex-row-name">${nameOf(exId)}</span>
        ${isBest && html`<span class="star-badge" role="img" aria-label="New best"><${Icon} name="star" size=${14} sw=${1.5} filled /></span>`}
        <span class="muted small">${done ? `${done} of ${xs.length}` : plural(xs.length, 'set')}</span>
        <${Icon} name="chevronDown" size=${18} />
      </button>
    `;
  };

  const at = menu ? w.exerciseIds.indexOf(menu) : -1;

  return html`
    <div class="screen narrow focus">
      <header class="wk-head">
        <button class="icon-btn" aria-label=${active ? 'Close. The workout keeps running.' : 'Back'} onClick=${close}><${Icon} name=${active ? 'x' : 'arrowLeft'} /></button>
        <div class="wk-title">
          <span class="wk-name">${w.name}</span>
          <span class="wk-sub">
            ${active
              ? html`<${Icon} name="clock" size=${13} sw=${2.5} /><${Timer} from=${w.startedAt} />`
              : `${fmtMedium(w.date)} · ${fmtMinutes(w.finishedAt - w.startedAt)}`}
          </span>
        </div>
        <button class="btn ink" onClick=${finish}>${active ? 'Finish' : 'Done'}</button>
      </header>

      ${w.exerciseIds.length > 0 &&
      html`<div class="seg-bars" role="img" aria-label=${`${w.exerciseIds.filter(complete).length} of ${w.exerciseIds.length} exercises complete`}>
        ${w.exerciseIds.map((x) => html`<span key=${x} class=${'seg-bar' + (complete(x) ? ' done' : x === openId ? ' cur' : '')}></span>`)}
      </div>`}

      ${!w.exerciseIds.length && html`<p class="empty">This workout has no exercises yet. Add the first one below.</p>`}

      <div class="ex-list">${w.exerciseIds.map((x, i) => (x === openId ? openCard(x) : closedRow(x, i)))}</div>

      <button class="btn dashed" onClick=${() => setPicker(true)}><${Icon} name="plus" size=${18} sw=${2.5} /><span>Add exercise</span></button>
      <button class="link-btn danger" onClick=${discard}>${active ? 'Discard workout' : 'Delete workout'}</button>

      ${picker &&
      html`<${ExercisePicker}
        exclude=${w.exerciseIds}
        onPick=${(x) => {
          act.addExercise(w, x);
          setOpenId(x);
        }}
        onClose=${() => setPicker(false)}
      />`}

      ${menu &&
      html`<${Sheet} title=${nameOf(menu)} onClose=${() => setMenu(null)}>
        <div class="menu">
          ${at > 0 &&
          html`<button class="menu-item" onClick=${() => { act.moveExercise(w, menu, -1); setMenu(null); }}><${Icon} name="arrowUp" /><span>Move up</span></button>`}
          ${at < w.exerciseIds.length - 1 &&
          html`<button class="menu-item" onClick=${() => { act.moveExercise(w, menu, 1); setMenu(null); }}><${Icon} name="arrowDown" /><span>Move down</span></button>`}
          <a class="menu-item" href=${'#/exercise/' + menu}><${Icon} name="clock" /><span>See this exercise's history</span></a>
          <button class="menu-item danger" onClick=${() => { act.removeExercise(w, menu); setMenu(null); }}><${Icon} name="trash" /><span>Remove from this workout</span></button>
        </div>
      <//>`}
    </div>
  `;
}
