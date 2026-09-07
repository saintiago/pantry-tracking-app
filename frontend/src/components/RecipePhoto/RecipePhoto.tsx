import React, { useEffect, useState } from 'react';
import { fetchRecipeImage } from '../../api/recipes/images';
import { t, useLanguage } from '../../i18n/i18n';

export default function RecipePhoto({ imageId, alt }: { imageId?: string | null; alt: string }) {
  useLanguage();
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setUrl('');
    setFailed(false);
    if (imageId)
      fetchRecipeImage(imageId)
        .then((value) => {
          if (!cancelled) setUrl(value);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    return () => {
      cancelled = true;
    };
  }, [imageId, attempt]);
  if (!imageId) return null;
  if (failed)
    return (
      <div role="status">
        {t('Could not load image.')}{' '}
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          {t('Retry image')}
        </button>
      </div>
    );
  return url ? (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: 360,
        objectFit: 'contain',
        borderRadius: 12,
        margin: '10px 0',
      }}
    />
  ) : (
    <p role="status">{t('Loading image…')}</p>
  );
}
