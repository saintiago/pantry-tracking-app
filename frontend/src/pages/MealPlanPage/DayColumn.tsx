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
}

const DayColumn: React.FC<DayColumnProps> = ({
  date,
  assignments,
  removingPlanIds,
  onRemove,
  onAddClick,
}) => {
  const handleAddClick = () => {
    onAddClick(date);
  };

  return (
    <div style={styles.column}>
      <div style={styles.header}>
        <span style={styles.dayLabel}>{getDayLabel(date)}</span>
        <span style={styles.dayNumber}>{getDayNumber(date)}</span>
      </div>
      <div style={styles.cards}>
        {assignments.map((assignment) => (
          <RecipeCard
            key={assignment.planId}
            assignment={assignment}
            isRemoving={removingPlanIds.has(assignment.planId)}
            onRemove={onRemove}
          />
        ))}
      </div>
      <button type="button" onClick={handleAddClick} aria-label="Add recipe" style={styles.addButton}>
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
    borderBottom: '1px solid #e5e7eb',
  },
  dayLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  dayNumber: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#1f2937',
    lineHeight: 1,
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
    color: '#6b7280',
    backgroundColor: 'transparent',
    border: '1px dashed #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
    padding: '0.25rem',
  },
};
