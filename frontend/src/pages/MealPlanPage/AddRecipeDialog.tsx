import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createMealPlan,
  fetchRecipesForPlanning,
  type MealPlan,
  type PlannableRecipe,
} from '../../api/meal-plans/meal-plans';

/**
 * Sorts an array of PlannableRecipe objects alphabetically by name,
 * case-insensitively (using locale-aware comparison with base sensitivity).
 * Returns a new array; does not mutate the input.
 */
export function sortRecipes(recipes: PlannableRecipe[]): PlannableRecipe[] {
  return [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

interface AddRecipeDialogProps {
  /** ISO date (YYYY-MM-DD) for which we're adding a recipe */
  date: string;
  /** Called with the newly-created MealPlan on success */
  onAdd: (mealPlan: MealPlan) => void;
  /** Called to dismiss without creating */
  onClose: () => void;
}

type MealType = 'breakfast' | 'lunch' | 'dinner';
type FetchState = 'idle' | 'loading' | 'success' | 'error';

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
];

const AddRecipeDialog: React.FC<AddRecipeDialogProps> = ({ date, onAdd, onClose }) => {
  const [recipes, setRecipes] = useState<PlannableRecipe[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [mealType, setMealType] = useState<MealType>('breakfast');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  // Ref to track if we should abort an in-flight fetch when component unmounts
  const abortRef = useRef<AbortController | null>(null);

  const loadRecipes = useCallback(async () => {
    setFetchState('loading');
    setFetchError(null);

    try {
      const data = await fetchRecipesForPlanning();
      // Sort alphabetically, case-insensitive
      setRecipes(sortRecipes(data.recipes));
      setFetchState('success');
    } catch (err) {
      setFetchState('error');
      setFetchError(err instanceof Error ? err.message : 'Failed to load recipes');
      setRecipes([]);
    }
  }, []);

  // Load recipes on mount
  useEffect(() => {
    loadRecipes();

    return () => {
      abortRef.current?.abort();
    };
  }, [loadRecipes]);

  const handleConfirm = async () => {
    // Validation
    if (!selectedRecipeId) {
      setValidationMessage('Please select a recipe before confirming.');
      return;
    }
    setValidationMessage(null);

    const selectedRecipe = recipes.find((r) => r.recipeId === selectedRecipeId);
    if (!selectedRecipe) {
      setValidationMessage('Selected recipe not found. Please try again.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await createMealPlan({
        date,
        mealType,
        recipeId: selectedRecipe.recipeId,
        recipeName: selectedRecipe.name,
      });
      onAdd(result.mealPlan);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Failed to save assignment. Please try again.',
      );
      // Keep dialog open with retained selection (req 4.9, 4.10)
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecipeSelect = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    if (validationMessage) {
      setValidationMessage(null);
    }
  };

  const handleMealTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMealType(e.target.value as MealType);
  };

  const hasNoRecipes = fetchState === 'success' && recipes.length === 0;
  const confirmDisabled = isSubmitting || hasNoRecipes || fetchState !== 'success';

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        style={styles.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-recipe-dialog-title"
        style={styles.dialog}
      >
        <div style={styles.header}>
          <h2 id="add-recipe-dialog-title" style={styles.title}>
            Add Recipe
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={styles.closeButton}
          >
            ×
          </button>
        </div>

        {/* Meal Type selector */}
        <div style={styles.field}>
          <label htmlFor="meal-type-select" style={styles.label}>
            Meal
          </label>
          <select
            id="meal-type-select"
            value={mealType}
            onChange={handleMealTypeChange}
            disabled={isSubmitting}
            style={styles.select}
          >
            {MEAL_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Recipe list area */}
        <div style={styles.field}>
          <span style={styles.label}>Recipe</span>

          {/* Loading state — req 6.2 */}
          {fetchState === 'loading' && (
            <div style={styles.stateMessage} aria-live="polite">
              Loading recipes…
            </div>
          )}

          {/* Error + retry — req 6.5 */}
          {fetchState === 'error' && (
            <div style={styles.errorState} aria-live="polite">
              <span style={styles.errorText}>{fetchError ?? 'Failed to load recipes.'}</span>
              <button type="button" onClick={loadRecipes} style={styles.retryButton}>
                Retry
              </button>
            </div>
          )}

          {/* Empty state — req 4.11, 6.4 */}
          {hasNoRecipes && (
            <div style={styles.stateMessage} aria-live="polite">
              No recipes found. Add some recipes first.
            </div>
          )}

          {/* Recipe list — req 4.2, 6.3 */}
          {fetchState === 'success' && recipes.length > 0 && (
            <ul style={styles.recipeList} role="listbox" aria-label="Available recipes">
              {recipes.map((recipe) => {
                const isSelected = recipe.recipeId === selectedRecipeId;
                return (
                  <li
                    key={recipe.recipeId}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleRecipeSelect(recipe.recipeId)}
                    style={isSelected ? styles.recipeItemSelected : styles.recipeItem}
                  >
                    {recipe.name}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Validation message — req 4.6 */}
          {validationMessage && (
            <div style={styles.validationMessage} role="alert">
              {validationMessage}
            </div>
          )}
        </div>

        {/* Submit error — req 4.9, 4.10 */}
        {submitError && (
          <div style={styles.submitError} role="alert" aria-live="assertive">
            {submitError}
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={isSubmitting ? styles.cancelButtonDisabled : styles.cancelButton}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            aria-disabled={confirmDisabled}
            style={confirmDisabled ? styles.confirmButtonDisabled : styles.confirmButton}
          >
            {isSubmitting ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </>
  );
};

export default AddRecipeDialog;

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 900,
  },
  dialog: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 901,
    width: 'min(90vw, 480px)',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.25rem 0.75rem',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#111827',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    padding: 0,
    fontSize: '1.5rem',
    lineHeight: 1,
    color: '#6b7280',
    backgroundColor: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
  },
  select: {
    padding: '0.5rem 0.75rem',
    fontSize: '0.9375rem',
    color: '#1f2937',
    backgroundColor: '#f9fafb',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    cursor: 'pointer',
  },
  recipeList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    maxHeight: '240px',
    overflowY: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  recipeItem: {
    padding: '0.625rem 0.875rem',
    fontSize: '0.9375rem',
    color: '#1f2937',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
    userSelect: 'none',
  },
  recipeItemSelected: {
    padding: '0.625rem 0.875rem',
    fontSize: '0.9375rem',
    color: '#1d4ed8',
    backgroundColor: '#eff6ff',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
    fontWeight: 600,
    userSelect: 'none',
  },
  stateMessage: {
    padding: '1rem',
    fontSize: '0.9375rem',
    color: '#6b7280',
    textAlign: 'center',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  errorState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    border: '1px solid #fecaca',
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  errorText: {
    fontSize: '0.9375rem',
    color: '#dc2626',
    textAlign: 'center',
  },
  retryButton: {
    padding: '0.375rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#1d4ed8',
    backgroundColor: '#ffffff',
    border: '1px solid #1d4ed8',
    borderRadius: 6,
    cursor: 'pointer',
  },
  validationMessage: {
    fontSize: '0.875rem',
    color: '#dc2626',
  },
  submitError: {
    margin: '0 1.25rem',
    padding: '0.625rem 0.875rem',
    fontSize: '0.875rem',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '0.75rem 1.25rem 1rem',
    borderTop: '1px solid #e5e7eb',
    flexShrink: 0,
    marginTop: 'auto',
  },
  cancelButton: {
    padding: '0.5rem 1.25rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: '#374151',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
  },
  cancelButtonDisabled: {
    padding: '0.5rem 1.25rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: '#9ca3af',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  confirmButton: {
    padding: '0.5rem 1.25rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#2563eb',
    border: '1px solid #2563eb',
    borderRadius: 8,
    cursor: 'pointer',
  },
  confirmButtonDisabled: {
    padding: '0.5rem 1.25rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#93c5fd',
    border: '1px solid #93c5fd',
    borderRadius: 8,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
};
