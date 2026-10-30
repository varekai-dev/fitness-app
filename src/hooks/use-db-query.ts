import { addDatabaseChangeListener } from 'expo-sqlite';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';

/**
 * Runs `query` and re-runs it whenever any table in the database changes while enabled.
 *
 * Drizzle's `useLiveQuery` only watches the root table, so nested relational
 * queries (workout -> exercises -> sets) would go stale. The dataset is small
 * and single-user, so re-running on every change is cheap enough.
 *
 * A result equal to the previous one keeps its object, so nothing re-renders.
 *
 * `query` is captured when `deps` change, so list every value it closes over.
 */
export function useDbQuery<T>(query: () => Promise<T>, deps: unknown[] = [], enabled = true) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let scheduled = false;
    let latest = 0;
    const run = () => {
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
    run();
    const sub = addDatabaseChangeListener(() => {
      // Coalesce bursts of row changes (e.g. a transaction) into one re-run.
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        if (!cancelled) run();
      }, 0);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, error, loading: data === undefined && !error };
}

/** Re-runs its query when a route becomes focused and skips updates while it is hidden. */
export function useFocusedDbQuery<T>(query: () => Promise<T>, deps: unknown[] = []) {
  const focused = useIsFocused();
  return useDbQuery(query, deps, focused);
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
