/**
 * Load something, once per screen, with the three states a screen can be in.
 *
 * The web app gets this from the framework: a Server Component awaits its data
 * and loading.tsx covers the gap. There is no framework here, and without a
 * shared hook every screen grows its own slightly different copy of the same
 * three useStates - which is how one of them ends up leaving `loading` true
 * forever on the error path.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  error: unknown;
  /** True for the first load only, so a refresh does not blank the screen. */
  loading: boolean;
  /** True while a pull-to-refresh or retry is in flight. */
  refreshing: boolean;
  /** Re-run the loader. `reload(true)` marks it as a refresh, not a first load. */
  reload: (isRefresh?: boolean) => Promise<void>;
  /** Local edits - an optimistic insert, say - without a round trip. */
  setData: (updater: (current: T | null) => T | null) => void;
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Only the newest run may write state: switching filters quickly otherwise
  // lets a slow first request land after a fast second one and win.
  const runId = useRef(0);

  const run = useCallback(
    async (isRefresh = false): Promise<void> => {
      const id = ++runId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await loader();
        if (!mounted.current || id !== runId.current) return;
        setDataState(result);
        setError(null);
      } catch (cause) {
        if (!mounted.current || id !== runId.current) return;
        setError(cause);
      } finally {
        if (mounted.current && id === runId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // The loader is rebuilt whenever its inputs change; deps are the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    void run();
  }, [run]);

  const setData = useCallback((updater: (current: T | null) => T | null) => {
    setDataState((current) => updater(current));
  }, []);

  return { data, error, loading, refreshing, reload: run, setData };
}
