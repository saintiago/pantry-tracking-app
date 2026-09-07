import RecipePhoto from '../RecipePhoto/RecipePhoto';
import { t, useLanguage } from '../../i18n/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { IngredientStatus, RecipeIngredient } from '../../api/recipes/recipes';
import IngredientAvailability from '../../pages/RecipesPage/IngredientAvailability';
import ResizableSplit from '../ResizableSplit/ResizableSplit';
import ConfirmDialog from './ConfirmDialog';

interface CookingModeProps {
  backLabel?: string;
  recipeName: string;
  instructionSteps: string[];
  instructionImageIds?: (string | null)[];
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
  instructionImageIds,
  ingredients,
  availability,
  missingCount,
  selectedPortions,
  onPortionsIncrement,
  onPortionsDecrement,
  onExit,
  backLabel,
  onFinish,
  currentStepIndex,
  onStepChange,
}) => {
  useLanguage();
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

  const progressPercent = totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 100;

  const stepsPanel = (
    <div style={styles.panel}>
      <div style={styles.stepHeader}>
        <span style={styles.stepHeaderTitle}>{t('Steps')}</span>
        <span style={styles.stepCounter}>
          {t('Step')} {currentStepIndex + 1} {t('of')} {totalSteps}
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
          aria-label={t('Previous step')}
        >
          {t('Previous')}{' '}
        </button>
        <button
          type="button"
          onClick={goToNext}
          disabled={isLastStep}
          style={{
            ...styles.stepNavButton,
            ...(isLastStep ? styles.stepNavButtonDisabled : {}),
          }}
          aria-label={t('Next step')}
        >
          {t('Next')}{' '}
        </button>
      </div>

      <ol style={styles.stepList} aria-label={t('Recipe steps')}>
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
            aria-label={t(
              'Step {0}{1}{2}',
              i + 1,
              i < currentStepIndex ? ' (completed)' : '',
              i === currentStepIndex ? ' (current)' : '',
            )}
            data-testid={`cooking-step-${i}`}
            style={getStepStyle(i, currentStepIndex)}
          >
            <span style={getStepNumberStyle(i, currentStepIndex)}>{i + 1}</span>
            <div style={styles.stepText}>
              {step}
              <RecipePhoto
                imageId={instructionImageIds?.[i]}
                alt={t('Image for step {0}', i + 1)}
              />
            </div>
            {i < currentStepIndex && (
              <span style={styles.checkmark} aria-hidden="true">
                ✓
              </span>
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
          aria-label={t('Leave cooking mode')}
        >
          {t(backLabel ?? '← Back')}{' '}
        </button>
        <h2 style={styles.recipeName} title={recipeName}>
          {recipeName}
        </h2>
        <div style={styles.headerRight}>
          {/* Compact portions scaler */}
          <div style={styles.portionsControls} aria-label={t('Portions')}>
            <button
              type="button"
              onClick={onPortionsDecrement}
              disabled={selectedPortions === 1}
              aria-label={t('Decrease portions')}
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
              aria-label={t('Increase portions')}
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
            {t('Finish')}{' '}
          </button>
        </div>
      </header>

      {/* Split content */}
      <ResizableSplit top={stepsPanel} bottom={ingredientsPanel} />

      {/* Progress bar */}
      <div
        style={styles.progressBar}
        role="progressbar"
        aria-valuenow={currentStepIndex + 1}
        aria-valuemin={0}
        aria-valuemax={totalSteps}
        aria-label={t('Recipe progress')}
      >
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
          message={t(
            "You've completed {0} of {1} steps. Are you sure you want to finish cooking?",
            currentStepIndex + 1,
            totalSteps,
          )}
          confirmLabel={t('Finish Anyway')}
          cancelLabel={t('Keep Cooking')}
          onConfirm={handleFinishConfirm}
          onCancel={handleFinishCancel}
        />
      )}
    </div>
  );
};

/** Get the visual style for a step based on its position relative to current */
function getStepStyle(index: number, currentStepIndex: number): React.CSSProperties {
  const base: React.CSSProperties = { ...stepStyles.stepItem };
  if (index < currentStepIndex) {
    return { ...base, ...stepStyles.completed };
  }
  if (index === currentStepIndex) {
    return { ...base, ...stepStyles.current };
  }
  return base;
}

function getStepNumberStyle(index: number, currentStepIndex: number): React.CSSProperties {
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
    backgroundColor: 'var(--color-surface)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--color-border)',
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
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.9375rem',
    color: 'var(--color-text)',
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
    color: 'var(--color-text)',
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
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  portionsValue: {
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    minWidth: 24,
    textAlign: 'center',
  },
  finishButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-danger-text)',
    backgroundColor: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
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
    color: 'var(--color-text)',
  },
  stepCounter: {
    fontSize: '0.875rem',
    color: 'var(--color-secondary)',
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
    backgroundColor: 'var(--color-canvas)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    cursor: 'pointer',
    color: 'var(--color-text)',
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
    color: 'var(--color-text)',
  },
  checkmark: {
    flexShrink: 0,
    fontSize: '1.25rem',
    color: 'var(--color-action)',
    fontWeight: 700,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'var(--color-border)',
    flexShrink: 0,
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'var(--color-mint)',
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
    backgroundColor: 'var(--color-mint)',
  },
  current: {
    backgroundColor: 'var(--color-warning)',
    borderLeft: '3px solid var(--color-warning-text)',
    fontWeight: 700,
  },
  stepNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: 'var(--color-border)',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    flexShrink: 0,
  },
  stepNumberCompleted: {
    backgroundColor: 'var(--color-mint)',
    color: 'var(--color-text)',
  },
  stepNumberCurrent: {
    backgroundColor: 'var(--color-warning)',
    color: 'var(--color-text)',
  },
};
