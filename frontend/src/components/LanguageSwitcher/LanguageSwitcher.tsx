import React, { useEffect, useRef, useState } from 'react';
import { languages, message as translateMessage, t, useLanguage } from '../../i18n/i18n';
import { useLanguagePreferences } from '../../i18n/LanguageProvider';
import Flag from './Flag';

export default function LanguageSwitcher() {
  const language = useLanguage();
  const preferences = useLanguagePreferences();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  if (!preferences) return null;
  const current = languages.find((entry) => entry.code === language)!;
  return (
    <div
      ref={container}
      style={{ position: 'relative', flexShrink: 0 }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={t('Change language')}
        aria-expanded={open}
        aria-controls="language-options"
        onClick={() => setOpen(!open)}
        style={button}
      >
        <Flag language={current.code} /> <span>{current.code.toUpperCase()}</span>
      </button>
      {open && (
        <div
          id="language-options"
          role="group"
          aria-label={t('Language')}
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            zIndex: 30,
            width: 270,
            maxWidth: 'calc(100vw - 32px)',
            padding: 12,
            borderRadius: 12,
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 16px #0002',
          }}
        >
          <p style={{ marginBottom: 8, fontWeight: 700 }}>{t('Language on this device')}</p>
          {languages.map((entry) => (
            <button
              key={entry.code}
              type="button"
              lang={entry.code}
              aria-pressed={language === entry.code}
              onClick={() => preferences.choose(entry.code)}
              style={{
                ...button,
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: language === entry.code ? 'var(--color-mint)' : 'var(--color-surface)',
              }}
            >
              <Flag language={entry.code} /> {entry.name} {language === entry.code ? '✓' : ''}
            </button>
          ))}
          {preferences.signedIn && (
            <>
              <p style={{ fontSize: 13, margin: '10px 0' }}>
                {t(
                  'Account default: {0}',
                  preferences.loading
                    ? t('Loading…')
                    : (languages.find((entry) => entry.code === preferences.accountLanguage)
                        ?.name ?? t('Not set')),
                )}
              </p>
              <button
                type="button"
                style={{ ...button, width: '100%' }}
                disabled={preferences.saving || preferences.loading}
                onClick={() => void preferences.saveDefault()}
              >
                {t(preferences.saving ? 'Saving…' : 'Use this language as account default')}
              </button>
              <p style={{ fontSize: 12, marginTop: 8 }}>
                {t('Other devices keep their saved language.')}
              </p>
            </>
          )}
          {preferences.error && (
            <p role="alert" style={{ fontSize: 13, marginTop: 8 }}>
              {translateMessage(preferences.error)}
            </p>
          )}
          <button
            type="button"
            style={{ ...button, marginTop: 8 }}
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            {t('Close')}
          </button>
        </div>
      )}
    </div>
  );
}
const button: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '8px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  cursor: 'pointer',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
};
