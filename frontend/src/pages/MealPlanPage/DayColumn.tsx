import React from 'react';
import RecipeCard from './RecipeCard';
import type { Assignment } from './weekUtils';
import { getDayLabel, getDayNumber } from './weekUtils';

interface DayColumnProps {
  date: string; // ISO date (YYYY-MM-DD)
  assignments: Assignment[]; // Already sorted by sortAssignments
  removingPlanIds: Set<string>; // planIds currently being deleted
  onRemove: (planId: string) => void;
  onAddClick: (date: string) => void; // called when Add_Recipe_Button is clicked
  onDropRecipe?: (recipeId: string, date: string, mealType: Assignment['mealType']) => void;
  selectedRecipeId?: string;
  saving?: boolean;
  dragTarget?: string;
}

const DayColumn: React.FC<DayColumnProps> = ({
  date,
  assignments,
  removingPlanIds,
  onRemove,
  onAddClick,
  onDropRecipe,
  selectedRecipeId,
  saving,
  dragTarget,
}) => {
  const handleAddClick = () => {
    onAddClick(date);
  };

  return (
    <div style={styles.column} data-date={date}>
      <div style={styles.header}>
        <span style={styles.dayLabel}>{getDayLabel(date)}</span>
        <span style={styles.dayNumber}>{getDayNumber(date)}</span>
      </div>
      {(['breakfast', 'lunch', 'dinner'] as const).map((mealType) => (
        <section
          key={mealType}
          aria-label={`${mealType} on ${date}`}
          data-meal-date={onDropRecipe ? date : undefined}
          data-meal-type={mealType}
          data-drop-disabled={saving ? 'true' : undefined}
          data-drag-over={dragTarget === `${date}/${mealType}` ? 'true' : undefined}
          style={{
            ...styles.mealSlot,
            backgroundColor:
              dragTarget === `${date}/${mealType}`
                ? 'var(--color-mint)'
                : selectedRecipeId
                  ? 'var(--color-success)'
                  : 'var(--color-canvas)',
            outline:
              dragTarget === `${date}/${mealType}` ? '2px solid var(--color-action)' : undefined,
          }}
        >
          {onDropRecipe ? (
            <button
              type="button"
              aria-label={`Plan ${mealType} on ${date}`}
              disabled={saving}
              data-drag-over={dragTarget === `${date}/${mealType}` ? 'true' : undefined}
              onClick={() => {
                if (selectedRecipeId) onDropRecipe(selectedRecipeId, date, mealType);
              }}
              style={styles.mealButton}
            >
              {mealType}
            </button>
          ) : (
            <div style={styles.mealLabel}>{mealType}</div>
          )}
          <div style={styles.cards}>
            {assignments
              .filter((assignment) => assignment.mealType === mealType)
              .map((assignment) => (
                <RecipeCard
                  key={assignment.planId}
                  assignment={assignment}
                  isRemoving={removingPlanIds.has(assignment.planId)}
                  onRemove={onRemove}
                />
              ))}
          </div>
        </section>
      ))}
      <button
        type="button"
        onClick={handleAddClick}
        aria-label="Add recipe"
        style={styles.addButton}
      >
        +
      </button>
    </div>
  );
};

export default DayColumn;

const styles: Record<string, React.CSSProperties> = {
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    flex: 1,
    minWidth: 0,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.125rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid var(--color-border)',
  },
  dayLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  dayNumber: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    lineHeight: 1,
  },
  mealSlot: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px dashed var(--color-border)',
    borderRadius: 8,
    padding: '0.25rem',
    minWidth: 0,
  },
  mealButton: {
    width: '100%',
    minHeight: 36,
    padding: '0.25rem',
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'var(--color-secondary)',
    fontSize: '0.75rem',
    textTransform: 'capitalize',
    cursor: 'pointer',
  },
  mealLabel: {
    padding: '0.5rem 0.25rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    color: 'var(--color-secondary)',
    textTransform: 'capitalize',
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    flex: 1,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 36,
    fontSize: '1.25rem',
    lineHeight: 1,
    color: 'var(--color-secondary)',
    backgroundColor: 'transparent',
    border: '1px dashed var(--color-border)',
    borderRadius: 8,
    cursor: 'pointer',
    padding: '0.25rem',
  },
};
