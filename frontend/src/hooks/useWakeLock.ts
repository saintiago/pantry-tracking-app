import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Encapsulates the Screen Wake Lock API lifecycle.
 *
 * When `active` is true, requests a screen wake lock to prevent the device
 * from sleeping. When `active` becomes false, releases the lock.
 *
 * Handles automatic re-acquisition when the page becomes visible again
 * (browsers auto-release wake locks when the tab is hidden).
 *
 * @param active - Whether the wake lock should be held
 * @returns `isSupported` — whether the browser supports the API;
 *          `isActive` — whether a wake lock is currently held
 */
function useWakeLock(active: boolean): { isSupported: boolean; isActive: boolean } {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const activeRef = useRef(active);

  // Keep activeRef in sync so the visibility handler always reads the fresh value
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Detect browser support once on mount
  useEffect(() => {
    setIsSupported('wakeLock' in navigator);
  }, []);

  const acquire = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      // Release any existing sentinel before requesting a new one
      if (sentinelRef.current) {
        await sentinelRef.current.release();
      }
      const sentinel = await navigator.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setIsActive(true);
      sentinel.onrelease = () => {
        sentinelRef.current = null;
        setIsActive(false);
      };
    } catch (err) {
      // Wake lock requests can fail in battery-saver mode or on low battery
      console.warn('Wake Lock request failed:', err);
      setIsActive(false);
    }
  }, []);

  const release = useCallback(async () => {
    if (sentinelRef.current) {
      await sentinelRef.current.release();
      // The onrelease handler fires synchronously, clearing the ref and isActive
    }
  }, []);

  // Main lifecycle: acquire or release based on the `active` prop
  useEffect(() => {
    if (active) {
      acquire();
    } else {
      release();
    }
    return () => {
      release();
    };
  }, [active, acquire, release]);

  // Re-acquire when the page becomes visible again after being hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        activeRef.current &&
        !sentinelRef.current
      ) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [acquire]);

  return { isSupported, isActive };
}

export default useWakeLock;
