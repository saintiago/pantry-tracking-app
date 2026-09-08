import { message as translateMessage, t, useLanguage } from '../../i18n/i18n';
import React from 'react';
import type { IngredientStatus, RecipeIngredient } from '../../api/recipes/recipes';
import { measurementParts, formatMeasurement } from '../../types/units';
import { getUnitLabel } from '../../types/units';

interface IngredientAvailabilityProps {
  ingredients?: RecipeIngredient[];
  availability: IngredientStatus[];
  missingCount: number;
}

const chipColors: Record<IngredientStatus['status'], string> = {
  available: 'var(--color-success)',
  partial: 'var(--color-warning)',
  missing: 'var(--color-danger)',
};

const IngredientAvailability: React.FC<IngredientAvailabilityProps> = ({
  ingredients: providedIngredients,
  availability,
  missingCount,
}) => {
  useLanguage();
  const ingredients: RecipeIngredient[] =
    providedIngredients ??
    availability.map((item) => ({
      name: item.name,
      quantity: item.required,
      unit: item.unit,
    }));

  return (
    <section aria-label={t('Ingredients')}>
      <h3 style={styles.title}>{t('Ingredients')}</h3>
      <p
        style={{
          ...styles.summary,
          color: missingCount > 0 ? 'var(--color-danger-text)' : 'var(--color-action)',
        }}
      >
        {missingCount > 0
          ? t('{0} ingredient(s) missing or partial', missingCount)
          : t('All ingredients available')}
      </p>
      <div style={styles.list}>
        {ingredients.map((ingredient, index) => {
          const status = availability[index];
          const previousSection = index > 0 ? ingredients[index - 1].section?.trim() : undefined;
          const section = ingredient.section?.trim();
          const showSection = Boolean(section && section !== previousSection);
          const quantityLabel =
            ingredient.quantity === null
              ? getUnitLabel(ingredient.unit, 1)
              : formatMeasurement(ingredient.quantity, ingredient.unit);

          let statusLabel: string = status?.status ?? 'missing';
          if (status?.status === 'partial' && status.required !== null) {
            statusLabel = `have ${measurementParts(status.available, status.unit).amount} / need ${measurementParts(status.required, status.unit).amount} ${measurementParts(status.required, status.unit).label}`;
          }

          return (
            <React.Fragment key={`${ingredient.name}-${index}`}>
              {showSection && <h4 style={styles.sectionHeading}>{section}</h4>}
              <div style={styles.row}>
                <span style={styles.ingredientText}>
                  <span style={styles.quantity}>{quantityLabel}</span>
                  <span>{ingredient.name}</span>
                </span>
                <span
                  style={{
                    ...styles.chip,
                    backgroundColor: chipColors[status?.status ?? 'missing'],
                  }}
                >
                  {translateMessage(statusLabel)}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
};

export default IngredientAvailability;

const styles: Record<string, React.CSSProperties> = {
  title: {
    fontSize: '1rem',
    fontWeight: 700,
    margin: 0,
    color: 'var(--color-text)',
  },
  summary: {
    margin: '0.5rem 0',
    fontWeight: 600,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  sectionHeading: {
    margin: '0.75rem 0 0.1rem',
    fontSize: '0.9375rem',
    fontStyle: 'italic',
    color: 'var(--color-text)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '0.75rem',
    padding: '0.35rem 0',
    borderBottom: '1px solid var(--color-canvas)',
  },
  ingredientText: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '0.35rem',
    minWidth: 0,
    color: 'var(--color-text)',
  },
  quantity: {
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  chip: {
    flexShrink: 0,
    padding: '2px 8px',
    borderRadius: 12,
    color: 'var(--color-text)',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
};
