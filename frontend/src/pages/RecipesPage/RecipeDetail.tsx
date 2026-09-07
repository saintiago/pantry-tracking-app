import RecipePhoto from '../../components/RecipePhoto/RecipePhoto';
import { styles } from './detailStyles';
import { RecipeHeaderMedia } from './RecipeCalories';
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
  onStartCooking?: (recipeId: string, recipeName: string, portions?: number) => void;
  backLabel?: string;
  plannedMeal?: { date: string; mealType: string; servings: number };
  onSaveServings?: (value: number) => Promise<void>;
}

const RecipeDetail: React.FC<RecipeDetailProps> = ({
  recipeId,
  onEdit,
  onBack,
  onDeleted,
  activeCookingSession,
  onStartCooking,
  backLabel,
  plannedMeal,
  onSaveServings,
}) => {
  useLanguage();
  const [data, setData] = useState<RecipeWithAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPortions, setSavingPortions] = useState(false);
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
    if (data) setSelectedPortions(plannedMeal?.servings ?? data.recipe.portions ?? 1);
  }, [data?.recipe.recipeId, plannedMeal?.servings]);

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
            aria-label={t(backLabel ?? 'Go back')}
          >
            {t(backLabel ?? '← Back')}{' '}
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
            aria-label={t(backLabel ?? 'Go back')}
          >
            {t(backLabel ?? '← Back')}{' '}
          </button>
        </div>
        <div style={styles.errorBanner} role="alert">
          {translateMessage(error)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { recipe, ingredientAvailability } = data;

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
    status:
      scaledQuantities[i] == null
        ? item.status
        : item.available >= scaledQuantities[i]!
          ? ('available' as const)
          : item.available > 0
            ? ('partial' as const)
            : ('missing' as const),
  }));
  const missingCount = scaledAvailability.filter((item) => item.status !== 'available').length;
  const instructionSteps = Array.isArray(recipe.instructions)
    ? recipe.instructions
    : [recipe.instructions];

  const hasActiveSession = activeCookingSession != null;
  const isSameRecipe = hasActiveSession && activeCookingSession!.recipeId === recipe.recipeId;
  const isDifferentRecipe = hasActiveSession && activeCookingSession!.recipeId !== recipe.recipeId;

  const cookButtonLabel = isSameRecipe ? '🍳 Resume Cooking' : '🍳 Cook';
  const cookButtonDisabled = isDifferentRecipe;
  const handleCook = () => {
    if (onStartCooking) {
      onStartCooking(recipe.recipeId, recipe.name, selectedPortions);
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
          aria-label={t(backLabel ?? 'Go back')}
          disabled={deleting}
        >
          {t(backLabel ?? '← Back')}{' '}
        </button>
        <h2 style={styles.pageTitle}>{recipe.name}</h2>
      </div>

      <RecipeHeaderMedia recipe={recipe} />

      {/* Error banner (delete errors) */}
      {error && (
        <div style={styles.errorBanner} role="alert">
          {translateMessage(error)}
        </div>
      )}

      {plannedMeal && (
        <p aria-label={t('Planned meal')}>
          {plannedMeal.date} · {t(plannedMeal.mealType)} · {plannedMeal.servings} {t('servings')}
        </p>
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

        {onSaveServings && (
          <button
            disabled={savingPortions || selectedPortions === plannedMeal?.servings}
            onClick={async () => {
              setSavingPortions(true);
              setError(null);
              try {
                await onSaveServings(selectedPortions);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to update meal');
              } finally {
                setSavingPortions(false);
              }
            }}
          >
            {t('Save servings for this meal')}
          </button>
        )}
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
                <RecipePhoto
                  imageId={recipe.instructionImageIds?.[index]}
                  alt={t('Image for step {0}', index + 1)}
                />
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
