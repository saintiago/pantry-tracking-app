import React, { useLayoutEffect } from 'react';
import { useAuth } from '../auth/AuthContext/AuthContext';
import { loadPreferences, preferenceKey, usePreferences } from './store';
import './appearance.css';
export default function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const id = user?.userId ?? 'guest';
  const preferences = usePreferences();
  useLayoutEffect(() => {
    loadPreferences(id);
    const sync = (e: StorageEvent) => {
      if (e.key === preferenceKey(id) || e.key === null) loadPreferences(id);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [id]);
  useLayoutEffect(() => {
    document.documentElement.dataset.appearance = preferences.appearance;
  }, [preferences.appearance]);
  return <>{children}</>;
}
