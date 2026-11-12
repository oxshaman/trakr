import { html, useMemo, useState } from '../deps.js';
import * as act from '../lib/actions.js';
import { byKey, trendSeries, weightStats } from '../lib/calc.js';
import { db } from '../lib/db.js';
import { lUnit, toL, toW, wUnit } from '../lib/units.js';
import { fix1, fmtMedium, fmtShort, signed, today } from '../lib/util.js';
import { LineChart } from '../ui/charts.js';
import { Icon } from '../ui/icon.js';
import { Head, toast } from '../ui/parts.js';
import { GoalChip, GoalSheet, LogMeasurementsSheet, LogWeightSheet, MeasurementsList, TrendChart, dayNumber, measurementName } from '../ui/sections.js';

function Stat({ label, value, unit }) {
  return html`
    <div class="stat">
      <span class="stat-label">${label}</span>
      ${value === undefined
        ? html`<span class="stat-none">not yet</span>`
        : html`<span class="stat-line"><span class="stat-value">${signed(value)}</span><span class="stat-unit">${unit}</span></span>`}
    </div>
  `;
}

export function Body() {
  const v = db.version;
  const sys = act.units();
  const unit = wUnit(sys);
  const series = useMemo(() => trendSeries(db.list('weights')), [v]);
  const [sheet, setSheet] = useState(null);
  const stats = weightStats(series);
  const goal = act.goalKg();
  const gap = stats && goal ? toW(stats.trend, sys) - toW(goal, sys) : null;
  const conv = (kg) => (kg === undefined ? undefined : toW(kg, sys));

  return html`
    <div class="screen">
      <${Head} title="Body">
        <button class="btn ink" onClick=${() => setSheet('weight')}><${Icon} name="plus" size=${18} sw=${2.5} /><span>Log weight</span></button>
      <//>
      <div class="body-grid">
        <section class="card lilac rise d1">
          ${stats
            ? html`
                <div class="card-split">
                  <div class="col">
                    <div class="card-label"><${Icon} name=${stats.d7 > 0 ? 'trendUp' : 'trendDown'} /><span>Trend</span></div>
                    <div class="big"><span class="big-num md">${fix1(toW(stats.trend, sys))}</span><span class="big-unit">${unit}</span></div>
                  </div>
                  <div class="col end">
                    <${GoalChip} solid goal=${goal} sys=${sys} onClick=${() => setSheet('goal')} />
                    ${gap !== null && html`<span class="card-note">${Math.abs(gap) < 0.05 ? 'Goal reached' : `${fix1(Math.abs(gap))} ${unit} to go`}</span>`}
                  </div>
                </div>
                <${TrendChart} series=${series} goal=${goal} sys=${sys} height=${170} />
              `
            : html`
                <div class="card-label"><${Icon} name="trendDown" /><span>Trend</span></div>
                <p class="card-empty">Log your weight to start the chart. The trend line smooths out day-to-day swings from water and food.</p>
                <button class="btn on-pastel-ink" onClick=${() => setSheet('weight')}><${Icon} name="plus" size=${18} sw=${2.5} /><span>Log weight</span></button>
              `}
        </section>
        <div class="side-col">
          ${stats &&
          html`<section class="stats rise d2" aria-label="Change in trend weight">
            <${Stat} label="7 days" value=${conv(stats.d7)} unit=${unit} />
            <${Stat} label="30 days" value=${conv(stats.d30)} unit=${unit} />
            <${Stat} label="Since start" value=${conv(stats.sinceStart)} unit=${unit} />
          </section>`}
          ${stats &&
          html`<a class="row link-row rise d2" href="#/body/weight">
            <span class="row-main"><span class="row-title">All weigh-ins</span></span>
            <span class="muted">${series.length}</span>
            <${Icon} name="chevronRight" size=${18} />
          </a>`}
          <div class="rise d3"><${MeasurementsList} /></div>
        </div>
      </div>
      ${sheet === 'weight' && html`<${LogWeightSheet} onClose=${() => setSheet(null)} />`}
      ${sheet === 'goal' && html`<${GoalSheet} onClose=${() => setSheet(null)} />`}
    </div>
  `;
}

// Every weigh-in, newest first. Tap one to change or delete it.
export function WeighIns() {
  const sys = act.units();
  const unit = wUnit(sys);
  const rows = [...db.list('weights')].sort(byKey((w) => w.date)).reverse();
  const [date, setDate] = useState(null);
  return html`
    <div class="screen narrow">
      <${Head} title="Weigh-ins" backTo="/body">
        <button class="btn ink" onClick=${() => setDate(today())}><${Icon} name="plus" size=${18} sw=${2.5} /><span>Log</span></button>
      <//>
      ${!rows.length && html`<p class="empty">No weigh-ins yet.</p>`}
      <div class="rows rise d1">
        ${rows.map(
          (w) => html`
            <button key=${w.id} class="row" onClick=${() => setDate(w.date)}>
              <span class="row-main"><span class="row-title">${fmtMedium(w.date)}</span></span>
              <span class="row-value">${fix1(toW(w.kg, sys))} ${unit}</span>
              <${Icon} name="pencil" size=${16} />
            </button>
          `,
        )}
      </div>
      ${date && html`<${LogWeightSheet} key=${date} date=${date} onClose=${() => setDate(null)} />`}
    </div>
  `;
}

// One measurement over time, with its entries.
export function MeasurementDetail({ type }) {
  const sys = act.units();
  const unit = lUnit(sys);
  const [open, setOpen] = useState(false);
  const rows = db.list('measurements').filter((m) => m.type === type).sort(byKey((m) => m.date));
  const dots = rows.map((m) => ({ x: dayNumber(m.date), y: toL(m.cm, sys), label: fmtShort(m.date) }));
  const last = rows[rows.length - 1];
  const first = rows[0];
  const remove = (m) => {
    act.deleteMeasurement(m.date, m.type);
    toast('Entry deleted');
  };
  return html`
    <div class="screen narrow">
      <${Head} title=${measurementName(type)} backTo="/body">
        <button class="btn ink" onClick=${() => setOpen(true)}><${Icon} name="plus" size=${18} sw=${2.5} /><span>Log</span></button>
      <//>
      ${last
        ? html`
            <section class="card sky rise d1">
              <div class="card-split">
                <div class="col">
                  <div class="card-label"><${Icon} name="ruler" /><span>Latest</span></div>
                  <div class="big"><span class="big-num md">${fix1(toL(last.cm, sys))}</span><span class="big-unit">${unit}</span></div>
                </div>
                ${rows.length > 1 &&
                html`<div class="col end">
                  <span class="chip solid">${signed(toL(last.cm, sys) - toL(first.cm, sys))} ${unit}</span>
                  <span class="card-note">since ${fmtShort(first.date)}</span>
                </div>`}
              </div>
              <${LineChart} onPastel dots=${dots} height=${150} label=${`${measurementName(type)} over time`} />
            </section>
            <section class="section rise d2">
              <div class="section-head"><h2 class="h2">Entries</h2><span class="muted">${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}</span></div>
              <div class="rows">
                ${[...rows].reverse().map(
                  (m) => html`
                    <div key=${m.id} class="row static">
                      <span class="row-main"><span class="row-title">${fmtMedium(m.date)}</span></span>
                      <span class="row-value">${fix1(toL(m.cm, sys))} ${unit}</span>
                      <button class="icon-btn sm" aria-label=${`Delete the entry from ${fmtMedium(m.date)}`} onClick=${() => remove(m)}><${Icon} name="trash" size=${18} /></button>
                    </div>
                  `,
                )}
              </div>
            </section>
          `
        : html`<p class="empty rise d1">Nothing logged for ${measurementName(type).toLowerCase()} yet.</p>`}
      ${open && html`<${LogMeasurementsSheet} onClose=${() => setOpen(false)} />`}
    </div>
  `;
}
