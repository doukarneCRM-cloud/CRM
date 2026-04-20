import { useEffect, useState } from 'react';

/**
 * Returns a value that only updates after `delay` ms without a new change.
 * Used to throttle search input → API calls so we don't fire a request on
 * every keystroke.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
