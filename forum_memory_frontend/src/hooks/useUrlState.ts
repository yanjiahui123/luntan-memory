import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Sync a single URL search param with React state.
 * Removes the param when the value equals the default.
 */
export function useUrlState(key: string, defaultValue: string): [string, (val: string) => void];
export function useUrlState(key: string, defaultValue: number): [number, (val: number) => void];
export function useUrlState(key: string, defaultValue: string | number): [string | number, (val: string | number) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const isNumber = typeof defaultValue === 'number';
  const value = raw != null
    ? (isNumber ? (parseInt(raw, 10) || defaultValue) : raw)
    : defaultValue;

  const setValue = useCallback((val: string | number) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      const strVal = String(val);
      if (strVal === '' || strVal === String(defaultValue)) {
        next.delete(key);
      } else {
        next.set(key, strVal);
      }
      return next;
    }, { replace: true });
  }, [key, defaultValue, setParams]);

  return [value, setValue];
}
