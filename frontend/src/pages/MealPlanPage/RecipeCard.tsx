import { t, useLanguage } from '../../i18n/i18n';
import React from 'react';
import type { Assignment } from './weekUtils';
interface Props {
  assignment: Assignment;
  isRemoving: boolean;
  onRemove: (id: string) => void;
  onOpen?: (id: string) => void;
  onMove?: (id: string) => void;
}
export default function RecipeCard({ assignment: a, isRemoving, onRemove, onOpen }: Props) {
  useLanguage();
  return (
    <div
      data-recipe-row
      data-drag-id={`plan:${a.planId}`}
      data-drag-name={a.recipeName}
      aria-disabled={isRemoving}
      onClick={(event) => {
        if (!(event.target as Element).closest('button') && !isRemoving) onOpen?.(a.planId);
      }}
      style={{
        position: 'relative',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        minWidth: 0,
        padding: 6,
      }}
    >
      <button
        type="button"
        data-no-drag
        onClick={() => onRemove(a.planId)}
        disabled={isRemoving}
        aria-label={t('Remove {0} from {1} {2}', a.recipeName, a.date, t(a.mealType))}
        style={{
          display: 'block',
          marginLeft: 'auto',
          minWidth: 44,
          minHeight: 44,
          border: 0,
          borderRadius: 8,
          background: 'var(--color-danger)',
          color: 'var(--color-danger-text)',
          fontSize: 22,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
      <button
        type="button"
        data-plan-open={a.planId}
        data-drag-id={`plan:${a.planId}`}
        data-drag-name={a.recipeName}
        disabled={isRemoving}
        onClick={() => onOpen?.(a.planId)}
        style={{
          width: '100%',
          minHeight: 44,
          textAlign: 'left',
          border: 0,
          background: 'transparent',
          color: 'var(--color-text)',
          padding: '4px 2px',
          fontSize: 15,
          lineHeight: 1.4,
          overflowWrap: 'anywhere',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        {a.recipeName}
      </button>
      {a.entryType && a.entryType !== 'recipe' && <small>{t(a.entryType)}</small>}
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        {a.servings ?? 1} {t('servings')}
        {a.kcalPerPortion !== undefined
          ? ` · ${Math.round(a.kcalPerPortion)} ${t('kcal/portion')}`
          : ` · ${t('Calories unknown')}`}
      </div>
    </div>
  );
}
