import React from 'react';
import type { IngredientStatus, RecipeIngredient } from '../../api/recipes/recipes';
import { formatQuantity } from '../../utils/quantity';
import { getUnitLabel } from '../../types/units';

interface IngredientAvailabilityProps {
  ingredients?: RecipeIngredient[];
  availability: IngredientStatus[];
  missingCount: number;
}

const chipColors: Record<IngredientStatus['status'], string> = {
  available: '#16a34a',
  partial: '#f59e0b',
  missing: '#dc2626',
};

const IngredientAvailability: React.FC<IngredientAvailabilityProps> = ({
  ingredients: providedIngredients,
  availability,
  missingCount,
}) => {
  const ingredients: RecipeIngredient[] =
    providedIngredients ??
    availability.map((item) => ({
      name: item.name,
      quantity: item.required,
      unit: item.unit,
    }));

  return (
    <section aria-label="Ingredients">
      <h3 style={styles.title}>Ingredients</h3>
      <p style={{ ...styles.summary, color: missingCount > 0 ? '#dc2626' : '#16a34a' }}>
        {missingCount > 0
          ? `${missingCount} ingredient(s) missing or partial`
          : 'All ingredients available'}
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
              : `${formatQuantity(ingredient.quantity)} ${getUnitLabel(
                  ingredient.unit,
                  ingredient.quantity,
                )}`;

          let statusLabel: string = status?.status ?? 'missing';
          if (status?.status === 'partial' && status.required !== null) {
            statusLabel = `have ${status.available} / need ${status.required} ${getUnitLabel(
              status.unit,
              status.required,
            )}`;
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
                  {statusLabel}
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
    color: '#111827',
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
    color: '#374151',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0.35rem 0',
    borderBottom: '1px solid #f3f4f6',
  },
  ingredientText: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '0.35rem',
    minWidth: 0,
    color: '#374151',
  },
  quantity: {
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  chip: {
    flexShrink: 0,
    padding: '2px 8px',
    borderRadius: 12,
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
};
