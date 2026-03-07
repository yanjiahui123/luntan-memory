import { useState, useEffect, useCallback, useRef } from 'react';

export function useAsync(asyncFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const callIdRef = useRef(0);

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
        setError(e.message);
      }
    } finally {
      if (callId === callIdRef.current) {
        setLoading(false);
      }
    }
  }, deps);

  useEffect(() => { execute(); }, [execute]);

  return { data, loading, error, refetch: execute };
}
