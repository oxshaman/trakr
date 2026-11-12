import { html, useEffect } from './deps.js';
import { Body, MeasurementDetail, WeighIns } from './screens/body.js';
import { Settings } from './screens/settings.js';
import { Today } from './screens/today.js';
import { ExerciseDetail, RoutineEdit, Routines, Training } from './screens/training.js';
import { Workout } from './screens/workout.js';
import { useDesktop, useStore } from './ui/hooks.js';
import { Sidebar, TabBar } from './ui/nav.js';
import { Toasts } from './ui/parts.js';
import { useRoute } from './ui/router.js';

// Maps the path to a screen and the tab it belongs to.
function match(path, desktop) {
  const [a, b, c] = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (!a) return { tab: 'today', screen: html`<${Today} desktop=${desktop} />` };
  if (a === 'body') {
    if (b === 'weight') return { tab: 'body', screen: html`<${WeighIns} />` };
    if (b === 'm' && c) return { tab: 'body', screen: html`<${MeasurementDetail} key=${c} type=${c} />` };
    return { tab: 'body', screen: html`<${Body} />` };
  }
  if (a === 'training') return { tab: 'training', screen: html`<${Training} />` };
  if (a === 'routines') return { tab: 'training', screen: html`<${Routines} />` };
  if (a === 'routine' && b) return { tab: 'training', screen: html`<${RoutineEdit} key=${b} id=${b} />` };
  if (a === 'exercise' && b) return { tab: 'training', screen: html`<${ExerciseDetail} key=${b} id=${b} />` };
  if (a === 'workout' && b) return { tab: 'training', focus: true, screen: html`<${Workout} key=${b} id=${b} />` };
  if (a === 'settings') return { tab: 'settings', screen: html`<${Settings} />` };
  return { tab: 'today', screen: html`<${Today} desktop=${desktop} />` };
}

export function App() {
  useStore();
  const path = useRoute();
  const desktop = useDesktop();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  const { tab, screen, focus } = match(path, desktop);
  return html`
    <div class="app">
      <${Sidebar} tab=${tab} />
      <main class="main" key=${path}>${screen}</main>
      ${!focus && html`<${TabBar} tab=${tab} />`}
      <${Toasts} />
    </div>
  `;
}
