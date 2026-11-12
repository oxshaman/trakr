import { useEffect, useLayoutEffect, useRef, useState } from '../deps.js';
import { db, sync } from '../lib/db.js';

// Re-renders the component whenever the data changes. Returns the data version.
export function useStore() {
  const [, bump] = useState(0);
  useEffect(() => db.subscribe(() => bump((n) => n + 1)), []);
  return db.version;
}

export function useSync() {
  const [, bump] = useState(0);
  useEffect(() => sync.subscribe(() => bump((n) => n + 1)), []);
  return sync;
}

export function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export const useDesktop = () => useMedia('(min-width: 960px)');

// The current time, refreshed on an interval while active.
export function useNow(active = true, ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

// Tracks an element's width so charts can draw at real pixel size.
export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
