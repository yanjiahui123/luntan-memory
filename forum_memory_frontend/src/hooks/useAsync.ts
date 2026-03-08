import { useState, useEffect, useCallback, useRef } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAsync<T>(asyncFn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const callIdRef = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const execute = useCallback(async () => {
    const callId = ++callIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn();
      if (callId === callIdRef.current) {
        setData(result);
      }
    } catch (e) {
      if (callId === callIdRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (callId === callIdRef.current) {
        setLoading(false);
      }
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { execute(); }, [execute]);

  return { data, loading, error, refetch: execute };
}
