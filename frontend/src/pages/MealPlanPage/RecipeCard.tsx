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
  const handleRemove = () => {
    onRemove(assignment.planId);
  };

  return (
    <div style={styles.card}>
      <div style={styles.content}>
        <span style={styles.mealType}>{MEAL_TYPE_LABELS[assignment.mealType]}</span>
        <span style={styles.recipeName}>{assignment.recipeName}</span>
      </div>
      <button
        type="button"
        onClick={handleRemove}
        disabled={isRemoving}
        aria-label="Remove assignment"
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
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
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
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  recipeName: {
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: '#1f2937',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    color: '#6b7280',
    backgroundColor: 'transparent',
    border: '1px solid #d1d5db',
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
    color: '#d1d5db',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    cursor: 'not-allowed',
    opacity: 0.6,
  },
};
