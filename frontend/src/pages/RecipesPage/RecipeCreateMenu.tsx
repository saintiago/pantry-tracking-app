import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../../i18n/i18n';
import { styles } from './styles';
export default function RecipeCreateMenu({
  onSelect,
}: {
  onSelect: (mode: 'manual' | 'photo' | 'link') => void;
}) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <div
      ref={root}
      style={{ position: 'relative' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          root.current?.querySelector('button')?.focus();
        }
      }}
    >
      <button
        type="button"
        style={styles.newButton}
        aria-expanded={open}
        aria-controls="recipe-create-options"
        onClick={() => setOpen(!open)}
      >
        {t('+ New Recipe')} <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          id="recipe-create-options"
          role="group"
          aria-label={t('Recipe creation options')}
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            zIndex: 5,
            width: 210,
            padding: 6,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px #0002',
          }}
        >
          {(['manual', 'photo', 'link'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(mode);
              }}
              style={{
                display: 'block',
                width: '100%',
                minHeight: 44,
                textAlign: 'left',
                background: 'transparent',
                border: 0,
                borderRadius: 6,
                padding: 10,
              }}
            >
              {t(
                mode === 'manual'
                  ? 'Add manually'
                  : mode === 'photo'
                    ? 'Import from photo'
                    : 'Import from link',
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
