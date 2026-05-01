import React, { useCallback, useEffect, useState } from 'react';
import { deleteRecipe, fetchRecipeWithAvailability, computeTotalTime } from '../../api/recipes/recipes';
import type { RecipeWithAvailability } from '../../api/recipes/recipes';
import IngredientAvailability from './IngredientAvailability';

interface RecipeDetailProps {
  recipeId: string;
  onEdit: () => void;
  onBack: () => void;
  onDeleted: () => void;
}

const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipeId, onEdit, onBack, onDeleted }) => {
  const [data, setData] = useState<RecipeWithAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRecipeWithAvailability(recipeId)
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
  }, [recipeId]);

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this recipe? If it is assigned to meal plans, those assignments will remain but reference a deleted recipe.',
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteRecipe(recipeId);
      onDeleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete recipe');
      setDeleting(false);
    }
  }, [recipeId, onDeleted]);

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.pageHeader}>
          <button onClick={onBack} style={styles.backButton} type="button" aria-label="Go back">
            ← Back
          </button>
        </div>
        <div style={styles.loadingState} aria-live="polite">
          Loading recipe…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={styles.page}>
        <div style={styles.pageHeader}>
          <button onClick={onBack} style={styles.backButton} type="button" aria-label="Go back">
            ← Back
          </button>
        </div>
        <div style={styles.errorBanner} role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { recipe, ingredientAvailability, missingCount } = data;

  const totalTime = computeTotalTime(recipe.prepTime, recipe.cookTime);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.pageHeader}>
        <button onClick={onBack} style={styles.backButton} type="button" aria-label="Go back" disabled={deleting}>
          ← Back
        </button>
        <h2 style={styles.pageTitle}>{recipe.name}</h2>
      </div>

      {/* Error banner (delete errors) */}
      {error && (
        <div style={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Content */}
      <div style={styles.content}>
        {/* Time display */}
        {totalTime !== undefined && (
          <section style={styles.timeSection} aria-label="Recipe time">
            {recipe.prepTime !== undefined && recipe.cookTime !== undefined ? (
              <>
                <span style={styles.timeItem}>Prep: {recipe.prepTime} min</span>
                <span style={styles.timeItem}>Cook: {recipe.cookTime} min</span>
                <span style={{ ...styles.timeItem, ...styles.totalTime }}>Total: {totalTime} min</span>
              </>
            ) : (
              <span style={{ ...styles.timeItem, ...styles.totalTime }}>Total: {totalTime} min</span>
            )}
          </section>
        )}

        {/* Ingredient availability */}
        <IngredientAvailability availability={ingredientAvailability} missingCount={missingCount} />

        {/* Instructions */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Instructions</h3>
          <p style={styles.instructions}>{recipe.instructions}</p>
        </section>

        {/* Source URL */}
        {recipe.sourceUrl && (
          <section style={styles.section}>
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.sourceLink}
            >
              View original recipe
            </a>
          </section>
        )}

        {/* Spacer above fixed action bar */}
        <div style={{ height: 80 }} />
      </div>

      {/* Fixed action bar */}
      <div style={styles.actionBar}>
        <button
          type="button"
          onClick={handleDelete}
          style={{ ...styles.deleteButton, ...(deleting ? styles.disabledButton : {}) }}
          disabled={deleting}
          data-testid="delete-button"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          style={{ ...styles.editButton, ...(deleting ? styles.disabledButton : {}) }}
          disabled={deleting}
          data-testid="edit-button"
        >
          Edit
        </button>
      </div>
    </div>
  );
};

export default RecipeDetail;

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    position: 'relative',
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
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
  pageTitle: {
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    marginBottom: '0.75rem',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    margin: 0,
    color: '#111827',
  },
  instructions: {
    fontSize: '0.9375rem',
    color: '#374151',
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  sourceLink: {
    fontSize: '0.9375rem',
    color: '#2563eb',
    textDecoration: 'underline',
  },
  actionBar: {
    position: 'fixed',
    bottom: 56,
    left: 0,
    right: 0,
    display: 'flex',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
    zIndex: 20,
    maxWidth: 1920,
    margin: '0 auto',
    height: 72,
    boxSizing: 'border-box',
  },
  deleteButton: {
    flex: 1,
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    cursor: 'pointer',
  },
  editButton: {
    flex: 2,
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 1rem',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#ffffff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  timeSection: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  timeItem: {
    fontSize: '0.9375rem',
    color: '#374151',
  },
  totalTime: {
    fontWeight: 700,
    color: '#111827',
  },
};
