import React, { useCallback, useEffect, useState } from 'react';
import {
  createRecipe,
  fetchRecipeWithAvailability,
  updateRecipe,
} from '../../api/recipes/recipes';
import type { RecipeIngredient } from '../../api/recipes/recipes';

export interface RecipeEditorProps {
  recipeId?: string; // undefined = create mode
  onSaved: (recipeId: string) => void;
  onCancel: () => void;
}

interface IngredientRow extends RecipeIngredient {
  _id: number;
}

interface FormErrors {
  name?: string;
  instructions?: string;
  ingredients?: string;
  ingredientRows?: Record<number, { name?: string; quantity?: string; unit?: string }>;
}

let nextId = 0;
const makeRow = (): IngredientRow => ({ _id: ++nextId, name: '', quantity: 0, unit: '' });

const RecipeEditor: React.FC<RecipeEditorProps> = ({ recipeId, onSaved, onCancel }) => {
  const isEdit = recipeId !== undefined;

  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([makeRow()]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // In edit mode, fetch and pre-populate
  useEffect(() => {
    if (!isEdit || !recipeId) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetchRecipeWithAvailability(recipeId)
      .then(({ recipe }) => {
        if (cancelled) return;
        setName(recipe.name);
        setInstructions(recipe.instructions);
        setSourceUrl(recipe.sourceUrl ?? '');
        setIngredients(
          recipe.ingredients.length > 0
            ? recipe.ingredients.map((ing) => ({ ...ing, _id: ++nextId }))
            : [makeRow()],
        );
      })
      .catch((err) => {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : 'Failed to load recipe');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, recipeId]);

  const addIngredient = useCallback(() => {
    setIngredients((prev) => [...prev, makeRow()]);
  }, []);

  const removeIngredient = useCallback((id: number) => {
    setIngredients((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));
  }, []);

  const updateIngredientField = useCallback(
    (id: number, field: keyof RecipeIngredient, value: string | number) => {
      setIngredients((prev) =>
        prev.map((r) => (r._id === id ? { ...r, [field]: value } : r)),
      );
      // Clear per-row error on change
      setErrors((prev) => {
        const rowErrors = { ...(prev.ingredientRows ?? {}) };
        if (rowErrors[id]) {
          const updated = { ...rowErrors[id] };
          delete updated[field as keyof typeof updated];
          rowErrors[id] = updated;
        }
        return { ...prev, ingredientRows: rowErrors };
      });
    },
    [],
  );

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = 'Recipe name is required.';
    if (!instructions.trim()) errs.instructions = 'Instructions are required.';
    if (ingredients.length === 0) errs.ingredients = 'At least one ingredient is required.';

    const rowErrors: Record<number, { name?: string; quantity?: string; unit?: string }> = {};
    ingredients.forEach((row) => {
      const rowErr: { name?: string; quantity?: string; unit?: string } = {};
      if (!row.name.trim()) rowErr.name = 'Name is required.';
      if (row.quantity <= 0) rowErr.quantity = 'Must be > 0.';
      if (!row.unit.trim()) rowErr.unit = 'Unit is required.';
      if (Object.keys(rowErr).length > 0) rowErrors[row._id] = rowErr;
    });
    if (Object.keys(rowErrors).length > 0) errs.ingredientRows = rowErrors;

    return errs;
  }, [name, instructions, ingredients]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const errs = validate();
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }
      setErrors({});
      setSubmitError(null);
      setSubmitting(true);

      const data = {
        name: name.trim(),
        instructions: instructions.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
        ingredients: ingredients.map(({ name: n, quantity, unit }) => ({ name: n, quantity, unit })),
      };

      try {
        if (isEdit && recipeId) {
          await updateRecipe(recipeId, data);
          onSaved(recipeId);
        } else {
          const recipe = await createRecipe(data);
          onSaved(recipe.recipeId);
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to save recipe');
      } finally {
        setSubmitting(false);
      }
    },
    [validate, name, instructions, sourceUrl, ingredients, isEdit, recipeId, onSaved],
  );

  if (loading) {
    return (
      <div style={styles.centered} role="status" aria-label="Loading recipe">
        <p style={styles.statusText}>Loading…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={styles.centered} role="alert">
        <p style={styles.errorText}>{fetchError}</p>
        <button onClick={onCancel} style={styles.cancelButton} type="button">
          Back
        </button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <button onClick={onCancel} style={styles.backButton} type="button" aria-label="Go back">
          ← Back
        </button>
        <h2 style={styles.pageTitle}>{isEdit ? 'Edit Recipe' : 'New Recipe'}</h2>
      </div>

      {submitError && (
        <div style={styles.errorBanner} role="alert">
          {submitError}
        </div>
      )}

      <form id="recipe-editor-form" onSubmit={handleSubmit} noValidate style={styles.form}>
        {/* Name */}
        <div style={styles.fieldGroup}>
          <label htmlFor="recipe-name" style={styles.label}>
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="recipe-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            style={styles.input}
            aria-required="true"
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <span style={styles.fieldError} role="alert">
              {errors.name}
            </span>
          )}
        </div>

        {/* Instructions */}
        <div style={styles.fieldGroup}>
          <label htmlFor="recipe-instructions" style={styles.label}>
            Instructions <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="recipe-instructions"
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value);
              setErrors((prev) => ({ ...prev, instructions: undefined }));
            }}
            style={styles.textarea}
            rows={5}
            aria-required="true"
            aria-invalid={!!errors.instructions}
          />
          {errors.instructions && (
            <span style={styles.fieldError} role="alert">
              {errors.instructions}
            </span>
          )}
        </div>

        {/* Source URL */}
        <div style={styles.fieldGroup}>
          <label htmlFor="recipe-source-url" style={styles.label}>
            Source URL
          </label>
          <input
            id="recipe-source-url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            style={styles.input}
            placeholder="https://…"
          />
        </div>

        {/* Ingredients */}
        <div style={styles.fieldGroup}>
          <div style={styles.ingredientsHeader}>
            <span style={styles.label}>
              Ingredients <span aria-hidden="true">*</span>
            </span>
          </div>
          {errors.ingredients && (
            <span style={styles.fieldError} role="alert">
              {errors.ingredients}
            </span>
          )}

          <div style={styles.ingredientsList}>
            {ingredients.map((row, index) => {
              const rowErr = errors.ingredientRows?.[row._id];
              return (
                <div key={row._id} style={styles.ingredientRow}>
                  <div style={styles.ingredientFields}>
                    {/* Ingredient name */}
                    <div style={styles.ingredientNameGroup}>
                      <label
                        htmlFor={`ing-name-${row._id}`}
                        style={styles.smallLabel}
                      >
                        Name
                      </label>
                      <input
                        id={`ing-name-${row._id}`}
                        type="text"
                        value={row.name}
                        onChange={(e) => updateIngredientField(row._id, 'name', e.target.value)}
                        style={styles.input}
                        aria-label={`Ingredient ${index + 1} name`}
                        aria-invalid={!!rowErr?.name}
                      />
                      {rowErr?.name && (
                        <span style={styles.fieldError} role="alert">
                          {rowErr.name}
                        </span>
                      )}
                    </div>

                    {/* Quantity + Unit row */}
                    <div style={styles.qtyUnitRow}>
                      <div style={styles.qtyGroup}>
                        <label
                          htmlFor={`ing-qty-${row._id}`}
                          style={styles.smallLabel}
                        >
                          Qty
                        </label>
                        <input
                          id={`ing-qty-${row._id}`}
                          type="number"
                          min="0.001"
                          step="any"
                          value={row.quantity === 0 ? '' : row.quantity}
                          onChange={(e) =>
                            updateIngredientField(row._id, 'quantity', parseFloat(e.target.value) || 0)
                          }
                          style={styles.input}
                          aria-label={`Ingredient ${index + 1} quantity`}
                          aria-invalid={!!rowErr?.quantity}
                        />
                        {rowErr?.quantity && (
                          <span style={styles.fieldError} role="alert">
                            {rowErr.quantity}
                          </span>
                        )}
                      </div>

                      <div style={styles.unitGroup}>
                        <label
                          htmlFor={`ing-unit-${row._id}`}
                          style={styles.smallLabel}
                        >
                          Unit
                        </label>
                        <input
                          id={`ing-unit-${row._id}`}
                          type="text"
                          value={row.unit}
                          onChange={(e) => updateIngredientField(row._id, 'unit', e.target.value)}
                          style={styles.input}
                          placeholder="e.g. g, ml, cup"
                          aria-label={`Ingredient ${index + 1} unit`}
                          aria-invalid={!!rowErr?.unit}
                        />
                        {rowErr?.unit && (
                          <span style={styles.fieldError} role="alert">
                            {rowErr.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeIngredient(row._id)}
                    style={styles.removeButton}
                    disabled={ingredients.length <= 1}
                    aria-label={`Remove ingredient ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={addIngredient} style={styles.addIngredientButton}>
            + Add Ingredient
          </button>
        </div>

        {/* Spacer above fixed action bar */}
        <div style={{ height: 80 }} />
      </form>

      {/* Fixed action bar */}
      <div style={styles.actionBar}>
        <button
          type="button"
          onClick={onCancel}
          style={styles.cancelButton}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="recipe-editor-form"
          style={styles.submitButton}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Recipe'}
        </button>
      </div>
    </div>
  );
};

export default RecipeEditor;

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
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
  },
  smallLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#6b7280',
  },
  input: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  fieldError: {
    fontSize: '0.8125rem',
    color: '#dc2626',
  },
  errorBanner: {
    padding: '0.75rem 1rem',
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    color: '#dc2626',
    fontSize: '0.875rem',
    marginBottom: '0.5rem',
  },
  ingredientsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ingredientsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  ingredientRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  ingredientFields: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  ingredientNameGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  qtyUnitRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  qtyGroup: {
    flex: '0 0 30%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  unitGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  removeButton: {
    flexShrink: 0,
    minWidth: 36,
    minHeight: 36,
    padding: '0.25rem',
    fontSize: '0.875rem',
    color: '#6b7280',
    backgroundColor: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    marginTop: '1.25rem',
  },
  addIngredientButton: {
    minHeight: 44,
    padding: '0.5rem 1rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    cursor: 'pointer',
    alignSelf: 'flex-start',
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
    zIndex: 10,
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    padding: '0.5rem 1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
  },
  submitButton: {
    flex: 2,
    minHeight: 44,
    padding: '0.5rem 1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    gap: '1rem',
  },
  statusText: {
    color: '#6b7280',
    fontSize: '0.9375rem',
    margin: 0,
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.9375rem',
    margin: 0,
  },
};
