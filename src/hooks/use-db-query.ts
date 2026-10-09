import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useState } from 'react';

/**
 * Runs `query` and re-runs it whenever any table in the database changes.
 *
 * Drizzle's `useLiveQuery` only watches the root table, so nested relational
 * queries (workout -> exercises -> sets) would go stale. The dataset is small
 * and single-user, so re-running on every change is cheap enough.
 *
 * `query` is captured when `deps` change, so list every value it closes over.
 */
export function useDbQuery<T>(query: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let scheduled = false;
    const run = () => {
      query()
        .then((result) => {
          if (!cancelled) setData(result);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e);
        });
    };
    run();
    const sub = addDatabaseChangeListener(() => {
      // Coalesce bursts of row changes (e.g. a transaction) into one re-run.
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        run();
      }, 0);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading: data === undefined && !error };
}
