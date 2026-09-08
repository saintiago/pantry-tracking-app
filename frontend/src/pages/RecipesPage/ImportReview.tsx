import React, { useState } from 'react';
import type { RecipeImportDraft } from '@pantry/domain';
import { importSourceImage } from '../../api/recipes/import';
import { uploadRecipeImage } from '../../api/recipes/images';
import { t, message, useLanguage } from '../../i18n/i18n';
export default function ImportReview({
  draft,
  onImage,
  onBusy,
}: {
  draft: RecipeImportDraft;
  onImage: (id: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  useLanguage();
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  return (
    <section
      aria-label={t('Import review')}
      style={{
        background: 'var(--color-warning)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <h3>{t('Review imported recipe')}</h3>
      <p>
        {t(
          'Check every field before saving. Highlighted notes identify missing or uncertain information.',
        )}
      </p>
      <p>
        {t(
          draft.method === 'bedrock'
            ? 'Extracted with Amazon Bedrock'
            : draft.method === 'ocr'
              ? 'Extracted with on-device text recognition'
              : 'Extracted from webpage metadata and text',
        )}
      </p>
      <ul>
        {draft.warnings.map((warning, index) => (
          <li key={index}>{message(warning)}</li>
        ))}
      </ul>
      <details>
        <summary>{t('Original extracted text')}</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.rawText}</pre>
      </details>
      {draft.imageUrl && !added && (
        <div>
          <p>
            {t(
              'The source offers a recipe image. Import it only if you have permission to use it.',
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={permission}
              onChange={(e) => setPermission(e.target.checked)}
              disabled={busy}
            />
            {t('I have permission to use the source image')}
          </label>
          <button
            type="button"
            disabled={!permission || busy}
            style={{ minHeight: 44 }}
            onClick={async () => {
              setBusy(true);
              onBusy(true);
              setError('');
              try {
                const image = await importSourceImage(draft.imageUrl!);
                const id = await uploadRecipeImage(image.dataUrl);
                onImage(id);
                setAdded(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not load image.');
              } finally {
                setBusy(false);
                onBusy(false);
              }
            }}
          >
            {t(busy ? 'Uploading image…' : 'Import source image')}
          </button>
          {error && <p role="alert">{message(error)}</p>}
        </div>
      )}
    </section>
  );
}
