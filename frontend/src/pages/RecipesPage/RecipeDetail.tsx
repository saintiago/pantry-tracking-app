import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useCallback, useEffect, useState } from 'react';
import {
  deleteRecipe,
  fetchRecipeWithAvailability,
  computeTotalTime,
  scaleIngredients,
} from '../../api/recipes/recipes';
import type { RecipeWithAvailability } from '../../api/recipes/recipes';
import IngredientAvailability from './IngredientAvailability';
import { resolveUnit } from '../../types/units';
import type { CookingSession } from '../CookingPage/CookingPage';

interface RecipeDetailProps {
  recipeId: string;
  onEdit: () => void;
  onBack: () => void;
  onDeleted: () => void;
  activeCookingSession?: CookingSession | null;
  onStartCooking?: (recipeId: string, recipeName: string) => void;
}

const RecipeDetail: React.FC<RecipeDetailProps> = ({
  recipeId,
  onEdit,
  onBack,
  onDeleted,
  activeCookingSession,
  onStartCooking,
}) => {
  useLanguage();
  const [data, setData] = useState<RecipeWithAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedPortions, setSelectedPortions] = useState<number>(1);

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

  useEffect(() => {
    if (data) setSelectedPortions(data.recipe.portions ?? 1);
  }, [data?.recipe.recipeId]);

  const handleIncrement = useCallback(() => {
    setSelectedPortions((p) => p + 1);
  }, []);

  const handleDecrement = useCallback(() => {
    setSelectedPortions((p) => (p > 1 ? p - 1 : p));
  }, []);

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      t(
        'Are you sure you want to delete this recipe? If it is assigned to meal plans, those assignments will remain but reference a deleted recipe.',
      ),
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
          <button
            onClick={onBack}
            style={styles.backButton}
            type="button"
            aria-label={t('Go back')}
          >
            {t('← Back')}{' '}
          </button>
        </div>
        <div style={styles.loadingState} aria-live="polite">
          {t('Loading recipe…')}{' '}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={styles.page}>
        <div style={styles.pageHeader}>
          <button
            onClick={onBack}
            style={styles.backButton}
            type="button"
            aria-label={t('Go back')}
          >
            {t('← Back')}{' '}
          </button>
        </div>
        <div style={styles.errorBanner} role="alert">
          {translateMessage(error)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { recipe, ingredientAvailability, missingCount } = data;

  const totalTime = computeTotalTime(recipe.prepTime, recipe.cookTime);

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

  // Scale the "required" quantity in availability rows to match the current selectedPortions
  const scaledAvailability = ingredientAvailability.map((item, i) => ({
    ...item,
    required: scaledQuantities[i] ?? item.required,
  }));
  const instructionSteps = Array.isArray(recipe.instructions)
    ? recipe.instructions
    : [recipe.instructions];

  // Cook button state
  const hasActiveSession = activeCookingSession != null;
  const isSameRecipe = hasActiveSession && activeCookingSession!.recipeId === recipe.recipeId;
  const isDifferentRecipe = hasActiveSession && activeCookingSession!.recipeId !== recipe.recipeId;

  const cookButtonLabel = isSameRecipe ? '🍳 Resume Cooking' : '🍳 Cook';
  const cookButtonDisabled = isDifferentRecipe;
  const handleCook = () => {
    if (onStartCooking) {
      onStartCooking(recipe.recipeId, recipe.name);
    }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.pageHeader}>
        <button
          onClick={onBack}
          style={styles.backButton}
          type="button"
          aria-label={t('Go back')}
          disabled={deleting}
        >
          {t('← Back')}{' '}
        </button>
        <h2 style={styles.pageTitle}>{recipe.name}</h2>
      </div>

      {/* Error banner (delete errors) */}
      {error && (
        <div style={styles.errorBanner} role="alert">
          {translateMessage(error)}
        </div>
      )}

      {/* Content */}
      <div style={styles.content}>
        {/* Tags */}
        {(recipe.tags ?? []).length > 0 && (
          <section style={styles.tagsSection} aria-label={t('Recipe tags')}>
            {(recipe.tags ?? []).map((tag) => (
              <span key={tag} style={styles.tagChip}>
                {tag}
              </span>
            ))}
          </section>
        )}

        {/* Time display */}
        {totalTime !== undefined && (
          <section style={styles.timeSection} aria-label={t('Recipe time')}>
            {recipe.prepTime !== undefined && recipe.cookTime !== undefined ? (
              <>
                <span style={styles.timeItem}>
                  {t('Prep:')} {recipe.prepTime} {t('min')}
                </span>
                <span style={styles.timeItem}>
                  {t('Cook:')} {recipe.cookTime} {t('min')}
                </span>
                <span style={{ ...styles.timeItem, ...styles.totalTime }}>
                  {t('Total:')} {totalTime} {t('min')}{' '}
                </span>
              </>
            ) : (
              <span style={{ ...styles.timeItem, ...styles.totalTime }}>
                {t('Total:')} {totalTime} {t('min')}{' '}
              </span>
            )}
          </section>
        )}

        {/* Portions scaler */}
        <section style={styles.portionsSection} aria-label={t('Portions')}>
          <span style={styles.portionsLabel}>{t('Portions')}</span>
          <div style={styles.portionsControls}>
            <button
              type="button"
              onClick={handleDecrement}
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
              onClick={handleIncrement}
              aria-label={t('Increase portions')}
              style={styles.portionsButton}
            >
              +
            </button>
          </div>
        </section>

        <IngredientAvailability
          ingredients={displayedIngredients}
          availability={scaledAvailability}
          missingCount={missingCount}
        />

        {/* Instructions */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>{t('Instructions')}</h3>
          <ol style={styles.instructionsList}>
            {instructionSteps.filter(Boolean).map((step, index) => (
              <li key={index} style={styles.instructions}>
                <strong>{index + 1}.</strong> {step}
              </li>
            ))}
          </ol>
        </section>

        {recipe.chefNotes && (
          <section style={styles.section} aria-label={t("Chef's notes")}>
            <h3 style={styles.sectionTitle}>{t("Chef's notes")}</h3>
            <p style={styles.instructions}>{recipe.chefNotes}</p>
          </section>
        )}

        {/* Source URL */}
        {recipe.sourceUrl && (
          <section style={styles.section}>
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.sourceLink}
            >
              {t('View original recipe')}{' '}
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
          {deleting ? t('Deleting…') : t('Delete')}
        </button>
        <button
          type="button"
          onClick={handleCook}
          style={{
            ...styles.cookButton,
            ...(cookButtonDisabled ? styles.cookButtonDisabled : {}),
            ...(isSameRecipe ? styles.cookButtonResume : {}),
          }}
          disabled={deleting || cookButtonDisabled}
          data-testid="cook-button"
          title={
            isDifferentRecipe
              ? t('Finish your current cooking session before starting a new one')
              : undefined
          }
        >
          {t(cookButtonLabel)}
        </button>
        <button
          type="button"
          onClick={onEdit}
          style={{ ...styles.editButton, ...(deleting ? styles.disabledButton : {}) }}
          disabled={deleting}
          data-testid="edit-button"
        >
          {t('Edit')}{' '}
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
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.9375rem',
    color: 'var(--color-text)',
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
    color: 'var(--color-secondary)',
    fontSize: '1rem',
  },
  errorBanner: {
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--color-danger)',
    color: 'var(--color-danger-text)',
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
    color: 'var(--color-text)',
  },
  instructions: {
    fontSize: '0.9375rem',
    color: 'var(--color-text)',
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  instructionsList: {
    margin: 0,
    paddingLeft: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  sourceLink: {
    fontSize: '0.9375rem',
    color: 'var(--color-action)',
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
    backgroundColor: 'var(--color-surface)',
    borderTop: '1px solid var(--color-border)',
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
    color: 'var(--color-danger-text)',
    backgroundColor: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
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
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-mint)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  cookButton: {
    flex: 1,
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 0.5rem',
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-mint)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  cookButtonDisabled: {
    backgroundColor: 'var(--color-border)',
    color: 'var(--color-secondary)',
    cursor: 'not-allowed',
  },
  cookButtonResume: {
    backgroundColor: 'var(--color-mint)',
  },
  timeSection: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--color-canvas)',
    borderRadius: 8,
    alignItems: 'center',
  },
  timeItem: {
    fontSize: '0.9375rem',
    color: 'var(--color-text)',
  },
  totalTime: {
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  portionsSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--color-canvas)',
    borderRadius: 8,
  },
  portionsLabel: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  portionsControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  portionsButton: {
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  portionsValue: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    minWidth: 32,
    textAlign: 'center' as const,
  },
  ingredientList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  ingredientItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9375rem',
    color: 'var(--color-text)',
    padding: '0.25rem 0',
    borderBottom: '1px solid var(--color-canvas)',
  },
  tagsSection: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.4rem',
  },
  tagChip: {
    backgroundColor: 'var(--color-sky)',
    color: 'var(--color-action)',
    borderRadius: 16,
    fontWeight: 600,
    fontSize: '0.875rem',
    padding: '0.2rem 0.5rem',
  },
};
