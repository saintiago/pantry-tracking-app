import React, { useEffect, useRef, useState } from 'react';
import type { RecipeImportDraft } from '@pantry/domain';
import { importRecipe } from '../../api/recipes/import';
import { preparePhoto } from '../../components/RecipePhoto/preparePhoto';
import { t, message, useLanguage } from '../../i18n/i18n';
import { styles } from './styles';

export default function RecipeImporter({
  mode,
  onReview,
  onCancel,
}: {
  mode: 'photo' | 'link';
  onReview: (draft?: RecipeImportDraft) => void;
  onCancel: () => void;
}) {
  useLanguage();
  const [url, setUrl] = useState('');
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [language, setLanguage] = useState('eng');
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  const run = async (ocr = false) => {
    controller.current?.abort();
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setError('');
    try {
      if (ocr) {
        const { recognizeRecipe } = await import('./importOcr');
        const draft = await recognizeRecipe(photo, language, operation.signal, setProgress);
        if (!operation.signal.aborted) onReview(draft);
      } else {
        const result = await importRecipe(
          mode === 'photo' ? { action: 'photo', dataUrl: photo } : { action: 'recipe', url },
          operation.signal,
        );
        if (operation.signal.aborted) return;
        if (result.draft) onReview(result.draft);
        else if (result.fallback) {
          setFallback(true);
          setError(
            result.message ??
              'AI extraction is unavailable. Use on-device text recognition or continue manually.',
          );
        }
      }
    } catch (err) {
      if (!operation.signal.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not import the recipe. Try another source or continue manually.',
        );
        if (mode === 'photo') setFallback(true);
      }
    } finally {
      if (!operation.signal.aborted) {
        setBusy(false);
        setProgress(null);
      }
    }
  };
  const selectPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    controller.current?.abort();
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setError('');
    setFallback(false);
    setPhoto('');
    try {
      const value = await preparePhoto(file);
      if (!operation.signal.aborted) setPhoto(value);
    } catch (err) {
      if (!operation.signal.aborted)
        setError(err instanceof Error ? err.message : 'Could not prepare image.');
    } finally {
      if (!operation.signal.aborted) setBusy(false);
    }
  };
  return (
    <div style={{ ...styles.editorContainer, maxWidth: 760, margin: 'auto' }}>
      <h2>{t(mode === 'photo' ? 'Import from photo' : 'Import from link')}</h2>
      <p>{t('Import creates an editable draft. Nothing is saved until you confirm the recipe.')}</p>
      <p style={{ color: 'var(--color-secondary)' }}>
        {t(
          'AI extraction uses Amazon Bedrock. The selected photo or recipe text is sent to AWS for processing.',
        )}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        {mode === 'link' ? (
          <label style={styles.label}>
            {t('Recipe webpage link')}
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              style={styles.input}
              disabled={busy}
            />
          </label>
        ) : (
          <>
            <label style={styles.label}>
              {t('Take a recipe photo')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={selectPhoto}
                disabled={busy}
                style={{ maxWidth: '100%', minHeight: 44 }}
              />
            </label>
            <label style={styles.label}>
              {t('Upload a recipe photo')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selectPhoto}
                disabled={busy}
                style={{ maxWidth: '100%', minHeight: 44 }}
              />
            </label>
            {photo && (
              <img
                src={photo}
                alt={t('Recipe photo to import')}
                style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }}
              />
            )}
          </>
        )}
        {error && <p role="alert">{message(error)}</p>}
        {busy && (
          <p role="status">
            {progress === null ? t('Extracting recipe…') : t('Reading photo: {0}%', progress)}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
          <button
            type="submit"
            style={styles.submitButton}
            disabled={busy || (mode === 'photo' && !photo)}
          >
            {t(error ? 'Try again' : 'Extract recipe')}
          </button>
          <button
            type="button"
            disabled={busy}
            style={styles.cancelButton}
            onClick={() => onReview()}
          >
            {t('Continue manually')}
          </button>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={() => {
              controller.current?.abort();
              onCancel();
            }}
          >
            {t('Cancel')}
          </button>
        </div>
      </form>
      {fallback && photo && (
        <section aria-label={t('On-device text recognition')}>
          <p>
            {t(
              'Text recognition runs on this device and downloads language files. Clear, printed recipes work best.',
            )}
          </p>
          <label>
            {t('Photo language')}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={busy}
              style={{ minHeight: 44 }}
            >
              <option value="eng">English</option>
              <option value="spa">Español</option>
              <option value="ita">Italiano</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            style={styles.submitButton}
            onClick={() => void run(true)}
          >
            {t('Use on-device text recognition')}
          </button>
        </section>
      )}
    </div>
  );
}
