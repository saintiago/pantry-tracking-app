import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext/AuthContext';
import { getAccountLanguage, saveAccountLanguage } from '../auth/cognitoClient/cognitoClient';
import {
  deviceKey,
  cancelLanguageLoad,
  DevicePreference,
  getLanguage,
  Language,
  readDevice,
  setLanguage,
  supportedLanguage,
  systemLanguage,
  writeDevice,
} from './i18n';

interface Preferences {
  signedIn: boolean;
  accountLanguage?: Language;
  loading: boolean;
  saving: boolean;
  error: string;
  choose: (language: Language) => void;
  saveDefault: () => Promise<void>;
}
const Context = createContext<Preferences | null>(null);
export const useLanguagePreferences = () => useContext(Context);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const userId = user?.userId;
  const [accountLanguage, setAccountLanguage] = useState<Language>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const identity = useRef(userId);
  identity.current = userId;
  // Only an explicit choice made on this login screen can be carried into an account.
  const guestChoice = useRef<Language>();

  async function apply(
    preference: DevicePreference,
    owner: string | undefined,
    version: number,
    persist = true,
  ) {
    const applied = await setLanguage(preference.language);
    if (!applied || identity.current !== owner || revision.current !== version) return;
    if (persist && !writeDevice(preference, owner)) {
      setError('Language works for this session, but could not be saved on this device.');
    }
  }

  useEffect(() => {
    const version = ++revision.current;
    cancelLanguageLoad();
    if (isLoading) return;
    const local = readDevice(userId);
    let cancelled = false;
    setError('');
    setAccountLanguage(undefined);
    setSaving(false);
    if (!userId) {
      setLoading(false);
      void apply(local ?? { language: systemLanguage(), source: 'system' }, undefined, version);
      return () => {
        revision.current++;
        cancelLanguageLoad();
      };
    }
    const explicitGuest = guestChoice.current;
    guestChoice.current = undefined;
    if (local) void apply(local, userId, version, false);
    else if (explicitGuest)
      void apply({ language: explicitGuest, source: 'explicit' }, userId, version);
    setLoading(true);
    getAccountLanguage()
      .then((value) => {
        if (cancelled) return;
        const account = supportedLanguage(value);
        setAccountLanguage(account);
        // A slow account read must never overwrite a newer selection or another tab's choice.
        if (revision.current !== version || local || explicitGuest || readDevice(userId)) return;
        const next = account ?? systemLanguage();
        void apply({ language: next, source: account ? 'account' : 'system' }, userId, version);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load your account language. Your device language still works.');
          if (revision.current === version && !local && !explicitGuest && !readDevice(userId)) {
            void apply({ language: systemLanguage(), source: 'system' }, userId, version, false);
          }
        }
        // Do not persist a provisional system fallback after a network failure.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      revision.current++;
      cancelLanguageLoad();
    };
  }, [userId, isLoading]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== deviceKey(userId)) return;
      const saved = readDevice(userId);
      if (saved) {
        void apply(saved, userId, ++revision.current, false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  function choose(language: Language) {
    if (!userId) guestChoice.current = language;
    setError('');
    void apply({ language, source: 'explicit' }, userId, ++revision.current);
  }
  async function saveDefault() {
    if (!userId || saving) return;
    const owner = userId;
    const selected = getLanguage();
    setSaving(true);
    setError('');
    try {
      await saveAccountLanguage(selected);
      if (identity.current === owner) setAccountLanguage(selected);
    } catch {
      if (identity.current === owner)
        setError(
          'Could not save your account language. Your selected language is still active. Please retry.',
        );
    } finally {
      if (identity.current === owner) setSaving(false);
    }
  }
  return (
    <Context.Provider
      value={{ signedIn: !!userId, accountLanguage, loading, saving, error, choose, saveDefault }}
    >
      {children}
    </Context.Provider>
  );
}
