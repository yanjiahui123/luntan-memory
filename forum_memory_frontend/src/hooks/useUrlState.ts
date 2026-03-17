import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Sync a single URL search param with React state.
 * Removes the param when the value equals the default.
 *
 * @param resetKeys — other URL params to delete in the same update
 *   (e.g. pass ['page'] so switching a filter automatically resets pagination).
 *   This avoids the React Router batching issue where two separate
 *   setSearchParams calls in the same tick overwrite each other.
 */
export function useUrlState(key: string, defaultValue: string, resetKeys?: string[]): [string, (val: string) => void];
export function useUrlState(key: string, defaultValue: number, resetKeys?: string[]): [number, (val: number) => void];
export function useUrlState(key: string, defaultValue: string | number, resetKeys: string[] = []): [string | number, (val: string | number) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const isNumber = typeof defaultValue === 'number';
  let value: string | number = defaultValue;
  if (raw != null) {
    value = isNumber ? (parseInt(raw, 10) || defaultValue) : raw;
  }

  // Stable serialization for dependency tracking
  const resetKeysKey = resetKeys.join(',');

  const setValue = useCallback((val: string | number) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      const strVal = String(val);
      if (strVal === '' || strVal === String(defaultValue)) {
        next.delete(key);
      } else {
        next.set(key, strVal);
      }
      // Reset dependent keys in the same URL update
      for (const rk of resetKeys) {
        next.delete(rk);
      }
      return next;
    }, { replace: true });
  }, [key, defaultValue, setParams, resetKeysKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue];
}
