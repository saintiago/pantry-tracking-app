import DialogShell from '../DialogShell/DialogShell';
import React, { useState } from 'react';
import { t, useLanguage } from '../../i18n/i18n';

/** Sharing always starts with a user gesture; unsupported devices get editable plain text. */
export default function ShareButton({
  title,
  text,
  disabled = false,
}: {
  title: string;
  text: string;
  disabled?: boolean;
}) {
  useLanguage();
  const [fallback, setFallback] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        style={{
          minHeight: 44,
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
        onClick={async () => {
          setStatus('');
          if (!navigator.share) {
            setFallback(true);
            return;
          }
          setBusy(true);
          try {
            await navigator.share({ title, text });
          } catch (error) {
            if (!(error instanceof Error && error.name === 'AbortError')) setFallback(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span aria-hidden="true">📤</span> {t('Share {0}', title)}
      </button>
      {fallback && (
        <DialogShell label={t('Share {0}', title)} onClose={() => setFallback(false)}>
          <h3>{t('Share {0}', title)}</h3>
          <p>{t('Copy this text into WhatsApp, email, or another app.')}</p>
          <textarea
            aria-label={t('Text to share')}
            readOnly
            value={text}
            rows={12}
            style={{ width: '100%', boxSizing: 'border-box' }}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setStatus('Copied');
              } catch {
                setStatus('Select the text and copy it manually.');
              }
            }}
          >
            {t('Copy text')}
          </button>
          <button type="button" onClick={() => setFallback(false)}>
            {t('Close')}
          </button>
          {status && <p role="status">{t(status)}</p>}
        </DialogShell>
      )}
    </>
  );
}
