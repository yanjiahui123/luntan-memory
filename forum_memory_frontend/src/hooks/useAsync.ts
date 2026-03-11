import { useState, useEffect, useCallback, useRef } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAsync<T>(asyncFn: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const execute = useCallback(() => {
    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    asyncFn(controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setData(result);
        }
      })
      .catch(e => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    execute();
    return () => { abortRef.current?.abort(); };
  }, [execute]);

  return { data, loading, error, refetch: execute };
}
