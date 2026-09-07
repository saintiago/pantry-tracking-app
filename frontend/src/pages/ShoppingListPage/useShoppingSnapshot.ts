import { useEffect, useRef, useState } from 'react';
import { fetchShoppingData } from '../../api/shopping-list/shopping-list';
import type { ShoppingData } from '../../api/shopping-list/types';

/** Owns cancellation, stale responses, timeouts and reconnect refresh for one account. */
export function useShoppingSnapshot(userId: string, start: string, end: string) {
  const [snapshot, setSnapshot] = useState<{
    userId: string;
    start: string;
    end: string;
    data: ShoppingData;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState !== 'hidden') setRefresh((n) => n + 1);
    };
    window.addEventListener('focus', reload);
    window.addEventListener('online', reload);
    return () => {
      window.removeEventListener('focus', reload);
      window.removeEventListener('online', reload);
    };
  }, []);
  useEffect(() => {
    const id = ++request.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError('');
    fetchShoppingData(start, end, controller.signal)
      .then((data) => {
        if (id === request.current) setSnapshot({ userId, start, end, data });
      })
      .catch((err: unknown) => {
        if (id === request.current)
          setError(
            err instanceof Error && err.name !== 'AbortError'
              ? err.message
              : 'Shopping list request timed out. Please retry.',
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (id === request.current) setLoading(false);
      });
    return () => {
      request.current++;
      clearTimeout(timer);
      controller.abort();
    };
  }, [userId, start, end, refresh]);
  return {
    snapshot: snapshot?.userId === userId ? snapshot : null,
    error,
    loading,
    reload: () => setRefresh((n) => n + 1),
  };
}
