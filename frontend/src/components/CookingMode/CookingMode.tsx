import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { IngredientStatus, RecipeIngredient } from '../../api/recipes/recipes';
import IngredientAvailability from '../../pages/RecipesPage/IngredientAvailability';
import ResizableSplit from '../ResizableSplit/ResizableSplit';
import ConfirmDialog from './ConfirmDialog';

interface CookingModeProps {
  recipeName: string;
  instructionSteps: string[];
  ingredients: RecipeIngredient[];
  availability: IngredientStatus[];
  missingCount: number;
  selectedPortions: number;
  onPortionsIncrement: () => void;
  onPortionsDecrement: () => void;
  /** Navigate away from cooking page — session persists */
  onExit: () => void;
  /** End the cooking session permanently */
  onFinish: () => void;
  /** Current step index (controlled from session state) */
  currentStepIndex: number;
  /** Update step index in session state */
  onStepChange: (index: number) => void;
}

const CookingMode: React.FC<CookingModeProps> = ({
  recipeName,
  instructionSteps,
  ingredients,
  availability,
  missingCount,
  selectedPortions,
  onPortionsIncrement,
  onPortionsDecrement,
  onExit,
  onFinish,
  currentStepIndex,
  onStepChange,
}) => {
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const currentStepRef = useRef<HTMLLIElement>(null);

  const totalSteps = instructionSteps.length;
  const isLastStep = currentStepIndex >= totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;

  // Auto-scroll current step into view
  useEffect(() => {
    if (currentStepRef.current && typeof currentStepRef.current.scrollIntoView === 'function') {
      currentStepRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentStepIndex]);

  const goToPrev = useCallback(() => {
    if (!isFirstStep) onStepChange(currentStepIndex - 1);
  }, [currentStepIndex, isFirstStep, onStepChange]);

  const goToNext = useCallback(() => {
    if (!isLastStep) onStepChange(currentStepIndex + 1);
  }, [currentStepIndex, isLastStep, onStepChange]);

  const handleFinish = useCallback(() => {
    const allDone = currentStepIndex >= totalSteps - 1;
    if (allDone) {
      onFinish();
    } else {
      setShowFinishConfirm(true);
    }
  }, [currentStepIndex, totalSteps, onFinish]);

  const handleFinishConfirm = useCallback(() => {
    setShowFinishConfirm(false);
    onFinish();
  }, [onFinish]);

  const handleFinishCancel = useCallback(() => {
    setShowFinishConfirm(false);
  }, []);

  const progressPercent =
    totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 100;

  const stepsPanel = (
    <div style={styles.panel}>
      <div style={styles.stepHeader}>
        <span style={styles.stepHeaderTitle}>Steps</span>
        <span style={styles.stepCounter}>
          Step {currentStepIndex + 1} of {totalSteps}
        </span>
      </div>

      <div style={styles.stepNav}>
        <button
          type="button"
          onClick={goToPrev}
          disabled={isFirstStep}
          style={{
            ...styles.stepNavButton,
            ...(isFirstStep ? styles.stepNavButtonDisabled : {}),
          }}
          aria-label="Previous step"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={goToNext}
          disabled={isLastStep}
          style={{
            ...styles.stepNavButton,
            ...(isLastStep ? styles.stepNavButtonDisabled : {}),
          }}
          aria-label="Next step"
        >
          Next
        </button>
      </div>

      <ol style={styles.stepList} aria-label="Recipe steps">
        {instructionSteps.map((step, i) => (
          <li
            key={i}
            ref={i === currentStepIndex ? currentStepRef : undefined}
            onClick={() => onStepChange(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onStepChange(i);
              }
            }}
            role="button"
            tabIndex={0}
            aria-current={i === currentStepIndex ? 'step' : undefined}
            aria-label={`Step ${i + 1}${i < currentStepIndex ? ' (completed)' : ''}${i === currentStepIndex ? ' (current)' : ''}`}
            data-testid={`cooking-step-${i}`}
            style={getStepStyle(i, currentStepIndex)}
          >
            <span style={getStepNumberStyle(i, currentStepIndex)}>{i + 1}</span>
            <span style={styles.stepText}>{step}</span>
            {i < currentStepIndex && (
              <span style={styles.checkmark} aria-hidden="true">✓</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );

  const ingredientsPanel = (
    <div style={styles.panel}>
      <IngredientAvailability
        ingredients={ingredients}
        availability={availability}
        missingCount={missingCount}
      />
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <button
          type="button"
          onClick={onExit}
          style={styles.backButton}
          aria-label="Leave cooking mode"
        >
          ← Back
        </button>
        <h2 style={styles.recipeName} title={recipeName}>{recipeName}</h2>
        <div style={styles.headerRight}>
          {/* Compact portions scaler */}
          <div style={styles.portionsControls} aria-label="Portions">
            <button
              type="button"
              onClick={onPortionsDecrement}
              disabled={selectedPortions === 1}
              aria-label="Decrease portions"
              style={styles.portionsButton}
            >
              –
            </button>
            <span style={styles.portionsValue} aria-live="polite">
              {selectedPortions}
            </span>
            <button
              type="button"
              onClick={onPortionsIncrement}
              aria-label="Increase portions"
              style={styles.portionsButton}
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            style={styles.finishButton}
            data-testid="finish-cooking-button"
          >
            Finish
          </button>
        </div>
      </header>

      {/* Split content */}
      <ResizableSplit top={stepsPanel} bottom={ingredientsPanel} />

      {/* Progress bar */}
      <div style={styles.progressBar} role="progressbar" aria-valuenow={currentStepIndex + 1} aria-valuemin={0} aria-valuemax={totalSteps} aria-label="Recipe progress">
        <div
          style={{
            ...styles.progressFill,
            width: `${progressPercent}%`,
          }}
          data-testid="cooking-progress-fill"
        />
      </div>

      {/* Finish confirmation dialog */}
      {showFinishConfirm && (
        <ConfirmDialog
          message={`You've completed ${currentStepIndex + 1} of ${totalSteps} steps. Are you sure you want to finish cooking?`}
          confirmLabel="Finish Anyway"
          cancelLabel="Keep Cooking"
          onConfirm={handleFinishConfirm}
          onCancel={handleFinishCancel}
        />
      )}
    </div>
  );
};

/** Get the visual style for a step based on its position relative to current */
function getStepStyle(
  index: number,
  currentStepIndex: number,
): React.CSSProperties {
  const base: React.CSSProperties = { ...stepStyles.stepItem };
  if (index < currentStepIndex) {
    return { ...base, ...stepStyles.completed };
  }
  if (index === currentStepIndex) {
    return { ...base, ...stepStyles.current };
  }
  return base;
}

function getStepNumberStyle(
  index: number,
  currentStepIndex: number,
): React.CSSProperties {
  const base: React.CSSProperties = { ...stepStyles.stepNumber };
  if (index < currentStepIndex) {
    return { ...base, ...stepStyles.stepNumberCompleted };
  }
  if (index === currentStepIndex) {
    return { ...base, ...stepStyles.stepNumberCurrent };
  }
  return base;
}

export default CookingMode;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#ffffff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
    minHeight: 56,
    gap: '0.5rem',
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 0.75rem',
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.9375rem',
    color: '#374151',
    flexShrink: 0,
  },
  recipeName: {
    fontSize: '1.125rem',
    fontWeight: 700,
    margin: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#111827',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },
  portionsControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  portionsButton: {
    minWidth: 36,
    minHeight: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.25rem',
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: '#374151',
  },
  portionsValue: {
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: '#111827',
    minWidth: 24,
    textAlign: 'center',
  },
  finishButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    cursor: 'pointer',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    height: '100%',
    boxSizing: 'border-box',
  },
  stepHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepHeaderTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#111827',
  },
  stepCounter: {
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  stepNav: {
    display: 'flex',
    gap: '0.5rem',
  },
  stepNavButton: {
    flex: 1,
    minWidth: 44,
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#374151',
  },
  stepNavButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  stepList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  stepText: {
    flex: 1,
    fontSize: '1.125rem',
    lineHeight: 1.7,
    color: '#111827',
  },
  checkmark: {
    flexShrink: 0,
    fontSize: '1.25rem',
    color: '#16a34a',
    fontWeight: 700,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e5e7eb',
    flexShrink: 0,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#d4829a',
    transition: 'width 0.2s ease',
  },
};

const stepStyles: Record<string, React.CSSProperties> = {
  stepItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem',
    borderRadius: 10,
    cursor: 'pointer',
    minHeight: 44,
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background-color 0.15s ease',
  },
  completed: {
    backgroundColor: '#f0fdf4',
  },
  current: {
    backgroundColor: '#fef3c7',
    borderLeft: '3px solid #f59e0b',
    fontWeight: 700,
  },
  stepNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: '#e5e7eb',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
    flexShrink: 0,
  },
  stepNumberCompleted: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
  },
  stepNumberCurrent: {
    backgroundColor: '#f59e0b',
    color: '#ffffff',
  },
};
