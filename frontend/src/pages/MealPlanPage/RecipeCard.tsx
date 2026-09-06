import { t, useLanguage } from '../../i18n/i18n';
import React from 'react';
import type { Assignment } from './weekUtils';

interface RecipeCardProps {
  assignment: Assignment;
  isRemoving: boolean;
  onRemove: (planId: string) => void;
}

const MEAL_TYPE_LABELS: Record<Assignment['mealType'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

const RecipeCard: React.FC<RecipeCardProps> = ({ assignment, isRemoving, onRemove }) => {
  useLanguage();
  const handleRemove = () => {
    onRemove(assignment.planId);
  };

  return (
    <div style={styles.card}>
      <div style={styles.content}>
        <span style={styles.mealType}>{t(MEAL_TYPE_LABELS[assignment.mealType])}</span>
        <span style={styles.recipeName}>{assignment.recipeName}</span>
        {assignment.servings !== undefined && (
          <span>
            {assignment.servings} {t('servings')}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleRemove}
        disabled={isRemoving}
        aria-label={t('Remove assignment')}
        style={isRemoving ? styles.removeButtonDisabled : styles.removeButton}
      >
        ×
      </button>
    </div>
  );
};

export default RecipeCard;

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    minHeight: 52,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    flex: 1,
    minWidth: 0,
  },
  mealType: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  recipeName: {
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: 'var(--color-text)',
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
  },
  removeButton: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    minHeight: 36,
    padding: '0.25rem',
    fontSize: '1.25rem',
    lineHeight: 1,
    color: 'var(--color-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    cursor: 'pointer',
  },
  removeButtonDisabled: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    minHeight: 36,
    padding: '0.25rem',
    fontSize: '1.25rem',
    lineHeight: 1,
    color: 'var(--color-border)',
    backgroundColor: 'var(--color-canvas)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    cursor: 'not-allowed',
    opacity: 0.6,
  },
};
