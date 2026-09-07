import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage, message } from '../../i18n/i18n';
import { uploadRecipeImage } from '../../api/recipes/images';
import RecipePhoto from './RecipePhoto';
import { preparePhoto } from './preparePhoto';

export default function RecipePhotoField({
  label,
  imageId,
  onChange,
  onBusy,
  disabled,
}: {
  label: string;
  imageId?: string | null;
  onChange: (value: string | null) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <div style={{ minWidth: 0 }}>
      <RecipePhoto imageId={imageId} alt={label} />
      <label style={{ display: 'block', margin: '8px 0' }}>
        {label}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || busy}
          style={{ display: 'block', maxWidth: '100%', minHeight: 44 }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setBusy(true);
            onBusy(true);
            setError('');
            try {
              const data = await preparePhoto(file);
              if (!mounted.current) return;
              const id = await uploadRecipeImage(data);
              if (mounted.current) onChange(id);
            } catch (err) {
              if (mounted.current)
                setError(err instanceof Error ? err.message : 'Could not prepare image.');
            } finally {
              if (mounted.current) setBusy(false);
              onBusy(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">{t('Uploading image…')}</p>}
      {error && <p role="alert">{message(error)}</p>}
      {imageId && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onChange(null)}
          style={{ minHeight: 44 }}
        >
          {t('Remove image: {0}', label)}
        </button>
      )}
    </div>
  );
}
