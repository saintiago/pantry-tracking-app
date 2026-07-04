import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchRecipeWithAvailability,
  scaleIngredients,
} from '../../api/recipes/recipes';
import type { RecipeWithAvailability } from '../../api/recipes/recipes';
import CookingMode from '../../components/CookingMode/CookingMode';
import useWakeLock from '../../hooks/useWakeLock';
import { resolveUnit } from '../../types/units';

export interface CookingSession {
  recipeId: string;
  recipeName: string;
  currentStepIndex: number;
}

interface CookingPageProps {
  session: CookingSession;
  onStepChange: (index: number) => void;
  onFinish: () => void;
  /** Navigate away — session persists */
  onExit: () => void;
}

const CookingPage: React.FC<CookingPageProps> = ({
  session,
  onStepChange,
  onFinish,
  onExit,
}) => {
  const [data, setData] = useState<RecipeWithAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPortions, setSelectedPortions] = useState<number>(1);

  // Activate wake lock while cooking page is mounted
  useWakeLock(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRecipeWithAvailability(session.recipeId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load recipe');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session.recipeId]);

  useEffect(() => {
    if (data) setSelectedPortions(data.recipe.portions ?? 1);
  }, [data?.recipe.recipeId]);

  const handleIncrement = useCallback(() => {
    setSelectedPortions((p) => p + 1);
  }, []);

  const handleDecrement = useCallback(() => {
    setSelectedPortions((p) => (p > 1 ? p - 1 : p));
  }, []);

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingState} aria-live="polite">
          Loading recipe…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={styles.page}>
        <div style={styles.pageHeader}>
          <button
            onClick={onExit}
            style={styles.backButton}
            type="button"
            aria-label="Go back"
          >
            ← Back
          </button>
        </div>
        <div style={styles.errorBanner} role="alert">
          {error || 'Recipe not found'}
        </div>
        {error && (
          <button
            type="button"
            onClick={onFinish}
            style={styles.endSessionButton}
          >
            End Cooking Session
          </button>
        )}
      </div>
    );
  }

  const { recipe, ingredientAvailability, missingCount } = data;

  const scaledQuantities = scaleIngredients(
    recipe.ingredients,
    recipe.portions ?? 1,
    selectedPortions,
  );

  const displayedIngredients = recipe.ingredients.map((ing, i) => ({
    ...ing,
    quantity: scaledQuantities[i],
    unit: resolveUnit(ing.unit),
  }));

  const scaledAvailability = ingredientAvailability.map((item, i) => ({
    ...item,
    required: scaledQuantities[i] ?? item.required,
  }));

  const instructionSteps = Array.isArray(recipe.instructions)
    ? recipe.instructions
    : [recipe.instructions];

  return (
    <div style={styles.page}>
      <CookingMode
        recipeName={recipe.name}
        instructionSteps={instructionSteps}
        ingredients={displayedIngredients}
        availability={scaledAvailability}
        missingCount={missingCount}
        selectedPortions={selectedPortions}
        onPortionsIncrement={handleIncrement}
        onPortionsDecrement={handleDecrement}
        onExit={onExit}
        onFinish={onFinish}
        currentStepIndex={session.currentStepIndex}
        onStepChange={onStepChange}
      />
    </div>
  );
};

export default CookingPage;

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1rem',
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
  },
  loadingState: {
    padding: '2rem 1rem',
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '1rem',
  },
  errorBanner: {
    padding: '0.75rem 1rem',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    borderRadius: 8,
    fontSize: '0.9375rem',
    fontWeight: 600,
    margin: '0 1rem 0.75rem',
  },
  endSessionButton: {
    margin: '0 1rem',
    minWidth: 44,
    minHeight: 44,
    padding: '0.625rem 1rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
