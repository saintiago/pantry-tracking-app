import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext/AuthContext';
import { getAccountLanguage, saveAccountLanguage } from '../auth/cognitoClient/cognitoClient';
import {
  deviceKey,
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

  useEffect(() => {
    const local = readDevice(userId);
    if (local) setLanguage(local.language);
    else setLanguage(systemLanguage());
    if (isLoading) return;
    const version = ++revision.current;
    let cancelled = false;
    setError('');
    setAccountLanguage(undefined);
    setSaving(false);
    if (!userId) {
      setLoading(false);
      if (!local && !writeDevice({ language: getLanguage(), source: 'system' })) {
        setError('Language works for this session, but could not be saved on this device.');
      }
      return;
    }
    const explicitGuest = guestChoice.current;
    guestChoice.current = undefined;
    if (!local && explicitGuest) {
      setLanguage(explicitGuest);
      if (!writeDevice({ language: explicitGuest, source: 'explicit' }, userId)) {
        setError('Language works for this session, but could not be saved on this device.');
      }
    }
    setLoading(true);
    getAccountLanguage()
      .then((value) => {
        if (cancelled) return;
        const account = supportedLanguage(value);
        setAccountLanguage(account);
        // A slow account read must never overwrite a newer selection or another tab's choice.
        if (revision.current !== version || local || explicitGuest || readDevice(userId)) return;
        const next = account ?? systemLanguage();
        setLanguage(next);
        if (!writeDevice({ language: next, source: account ? 'account' : 'system' }, userId)) {
          setError('Language works for this session, but could not be saved on this device.');
        }
      })
      .catch(() => {
        if (!cancelled)
          setError('Could not load your account language. Your device language still works.');
        // Do not persist a provisional system fallback after a network failure.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isLoading]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== deviceKey(userId)) return;
      const saved = readDevice(userId);
      if (saved) {
        revision.current++;
        setLanguage(saved.language);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  function choose(language: Language) {
    revision.current++;
    setLanguage(language);
    if (!userId) guestChoice.current = language;
    setError(
      writeDevice({ language, source: 'explicit' }, userId)
        ? ''
        : 'Language works for this session, but could not be saved on this device.',
    );
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
