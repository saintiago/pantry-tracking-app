import React, { useEffect, useRef, useState } from 'react';
import { fetchRecipeImage } from '../../api/recipes/images';
import { t, useLanguage } from '../../i18n/i18n';

/** Fetch private image URLs only as a card approaches the viewport. */
export default function LibraryCover({ imageId, name }: { imageId?: string; name: string }) {
  useLanguage();
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setUrl('');
    setFailed(false);
    if (visible && imageId)
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
  }, [visible, imageId]);
  return (
    <span ref={root} className="library-cover">
      {url && !failed ? (
        <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span
          className="library-cover-placeholder"
          aria-label={failed ? t('Could not load image.') : undefined}
        >
          <span aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || '—'}</span>
        </span>
      )}
    </span>
  );
}
