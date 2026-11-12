// Hash routing. Paths look like #/body or #/workout/<id>. Every screen change is
// a history entry, so the phone's back button and swipe-back work.
//
// Each entry stores its position (i) in history.state. That is how back() knows
// whether there is an earlier screen inside the app to return to.

import { useEffect, useState } from '../deps.js';

let index = (history.state && history.state.i) || 0;
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

const read = () => {
  const h = location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
};

export function useRoute() {
  const [path, setPath] = useState(read());
  useEffect(() => {
    const on = () => setPath(read());
    subs.add(on);
    return () => subs.delete(on);
  }, []);
  return path;
}

export function go(path, { replace = false } = {}) {
  if (replace) {
    history.replaceState({ i: index }, '', '#' + path);
  } else {
    if (path === read()) return;
    history.pushState({ i: ++index }, '', '#' + path);
  }
  emit();
}

// Goes back one screen. On a fresh load there is no earlier screen, so it opens
// the fallback instead of leaving the app.
export function back(fallback = '/') {
  if (index > 0) history.back();
  else go(fallback, { replace: true });
}

window.addEventListener('popstate', (e) => {
  index = (e.state && e.state.i) || 0;
  emit();
});

// Plain <a href="#/..."> links go through go() so they get a position too.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href^="#/"]');
  if (!a) return;
  e.preventDefault();
  go(a.getAttribute('href').slice(1));
});
