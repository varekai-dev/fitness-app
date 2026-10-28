import { addDatabaseChangeListener } from 'expo-sqlite';
import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useState } from 'react';

/**
 * Runs `query` and re-runs it whenever any table in the database changes.
 *
 * Drizzle's `useLiveQuery` only watches the root table, so nested relational
 * queries (workout -> exercises -> sets) would go stale. The dataset is small
 * and single-user, so re-running on every change is cheap enough.
 *
 * Screens left mounted out of sight (other tabs, screens under a modal) don't
 * re-run on every change: they note it and catch up once they're focused again,
 * so ticking off a set doesn't reload the whole history on the Home tab.
 * A result equal to the previous one keeps the old object, so nothing re-renders.
 *
 * `query` is captured when `deps` change, so list every value it closes over.
 */
export function useDbQuery<T>(query: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  // Undefined outside a navigator (the root layout), which counts as always focused.
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    let cancelled = false;
    let scheduled = false;
    let stale = false;
    let latest = 0;
    const run = () => {
      stale = false;
      const id = ++latest;
      query()
        .then((result) => {
          if (cancelled || id !== latest) return;
          setData((prev) => (prev !== undefined && sameData(prev, result) ? prev : result));
          setError(undefined);
        })
        .catch((e: Error) => {
          if (!cancelled && id === latest) setError(e);
        });
    };
    const focused = () => navigation?.isFocused() ?? true;
    run();
    const sub = addDatabaseChangeListener(() => {
      if (!focused()) {
        stale = true;
        return;
      }
      // Coalesce bursts of row changes (e.g. a transaction) into one re-run.
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        if (!cancelled) run();
      }, 0);
    });
    const unfocus = navigation?.addListener('focus', () => {
      if (stale) run();
    });
    return () => {
      cancelled = true;
      sub.remove();
      unfocus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, ...deps]);

  return { data, error, loading: data === undefined && !error };
}

/**
 * Structural equality for query results: plain objects, arrays, Maps and primitives.
 * `loadedAt` is when a loader ran, not data: it only matters by the day, and the
 * day is in the deps of every query that has it, so a new day still re-renders.
 */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameData(v, b[i]));
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !sameData(v, b.get(k))) return false;
    return true;
  }
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype)
    return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(
    (k) =>
      k in b &&
      (k === 'loadedAt' ||
        sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])),
  );
}
