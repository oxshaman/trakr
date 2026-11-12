import { html } from '../deps.js';
import { fmtLong, today } from '../lib/util.js';
import { Icon } from '../ui/icon.js';
import { Head, SyncButton } from '../ui/parts.js';
import { BestLifts, HistoryList, MeasurementsList, StartWorkout, WeekSection, WeightCard } from '../ui/sections.js';

// The home screen. On a phone it is the weight card, the routine tiles and the
// week. On a wide screen the weight card also holds the chart, and the lists
// from Training and Body sit underneath.
export function Today({ desktop }) {
  return html`
    <div class="screen">
      <${Head} title="Today" sub=${fmtLong(today())}>
        ${!desktop && html`<${SyncButton} />`}
        ${!desktop && html`<a class="icon-btn" href="#/settings" aria-label="Settings"><${Icon} name="settings" /></a>`}
      <//>
      <div class="today-grid">
        <${WeightCard} big=${desktop} />
        <div class="side-col">
          <${StartWorkout} />
          <${WeekSection} boxed=${desktop} />
        </div>
      </div>
      ${desktop &&
      html`<div class="three-col rise d3">
        <${BestLifts} limit=${3} />
        <${HistoryList} limit=${3} />
        <${MeasurementsList} />
      </div>`}
    </div>
  `;
}
