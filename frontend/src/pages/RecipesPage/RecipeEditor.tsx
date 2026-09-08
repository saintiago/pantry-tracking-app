import { changeMeasureUnit } from '../../preferences/MeasurementInput';
import IngredientMeasurements from './IngredientMeasurements';
import RecipeNameField from './RecipeNameField';
import type { RecipeImportDraft } from '@pantry/domain';
import ImportReview from './ImportReview';
import MoveRowButtons, { moveRow } from './MoveRowButtons';
import { validateTimeField, validatePortionsField } from './recipeFormRules';
import { validKcal } from '@pantry/domain';
import RecipeCalories from './RecipeCalories';
import RecipeInstructionsEditor, { makeInstructionRow } from './RecipeInstructionsEditor';
import type { InstructionRow } from './RecipeInstructionsEditor';
import RecipePhotoField from '../../components/RecipePhoto/RecipePhotoField';
import { styles } from './styles';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRecipe,
  fetchRecipeWithAvailability,
  scaleIngredients,
  updateRecipe,
} from '../../api/recipes/recipes';
import type { RecipeIngredient } from '../../api/recipes/recipes';
import { searchInventory } from '../../api/inventory/inventory';
import AutocompleteDropdown from '../../components/AutocompleteDropdown/AutocompleteDropdown';
import type { InventoryItem } from '../../components/AutocompleteDropdown/AutocompleteDropdown';
import { getUnitLabel, resolveUnit } from '../../types/units';
import { parseFractionalQuantity } from '../../utils/quantity';
import TagInput from '../../components/TagInput/TagInput';

export interface RecipeEditorProps {
  initialDraft?: RecipeImportDraft;
  recipeId?: string; // undefined = create mode
  onSaved: (recipeId: string) => void;
  onCancel: () => void;
  allTags: string[]; // passed from RecipesPage
  tagsLoading: boolean; // passed from RecipesPage
}

interface IngredientRow extends Omit<RecipeIngredient, 'quantity'> {
  _id: number;
  quantityStr: string;
}

interface FormErrors {
  name?: string;
  instructions?: string;
  ingredients?: string;
  ingredientRows?: Record<number, { name?: string; quantity?: string; unit?: string }>;
  totalKcal?: string;
  prepTime?: string;
  cookTime?: string;
  portions?: string;
  tags?: string;
}

interface DropdownState {
  visible: boolean;
  items: InventoryItem[];
  focusedIndex: number;
}

let nextId = 0;
const makeRow = (): IngredientRow => ({ _id: ++nextId, name: '', quantityStr: '', unit: '' });

const RecipeEditor: React.FC<RecipeEditorProps> = ({
  recipeId,
  initialDraft,
  onSaved,
  onCancel,
  allTags,
  tagsLoading,
}) => {
  useLanguage();
  const isEdit = recipeId !== undefined;

  const [name, setName] = useState(initialDraft?.name ?? '');
  const [imageId, setImageId] = useState<string | null>(null);
  const [uploads, setUploads] = useState(0);
  const imageBusy = useCallback((busy: boolean) => setUploads((n) => n + (busy ? 1 : -1)), []);
  const [instructions, setInstructions] = useState<InstructionRow[]>(() =>
    initialDraft?.instructions.length
      ? initialDraft.instructions.map(makeInstructionRow)
      : [makeInstructionRow()],
  );
  const [chefNotes, setChefNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState(initialDraft?.sourceUrl ?? '');
  const [ingredients, setIngredients] = useState<IngredientRow[]>(() =>
    initialDraft?.ingredients.length
      ? initialDraft.ingredients.map((item) => ({
          ...makeRow(),
          name: item.name,
          unit: item.unit,
          quantityStr: item.quantity === null ? '' : String(item.quantity),
        }))
      : [makeRow()],
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [tags, setTags] = useState<string[]>([]);

  const [totalKcal, setTotalKcal] = useState<number | undefined>();
  const [prepTime, setPrepTime] = useState(
    initialDraft?.prepTime === undefined ? '' : String(initialDraft.prepTime),
  );
  const [cookTime, setCookTime] = useState(
    initialDraft?.cookTime === undefined ? '' : String(initialDraft.cookTime),
  );
  const [originalPrepTime, setOriginalPrepTime] = useState<number | undefined>(undefined);
  const [originalCookTime, setOriginalCookTime] = useState<number | undefined>(undefined);

  const [portions, setPortions] = useState<string>(
    initialDraft?.portions ? String(initialDraft.portions) : '',
  );

  const [selectedPortions, setSelectedPortions] = useState<number>(1);
  const [originalPortions, setOriginalPortions] = useState<number>(1);

  const [dropdowns, setDropdowns] = useState<Record<number, DropdownState>>({});
  const debounceTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const abortControllers = useRef<Record<number, AbortController>>({});

  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach((c) => c.abort());
      Object.values(debounceTimers.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (!isEdit || !recipeId) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetchRecipeWithAvailability(recipeId)
      .then(({ recipe }) => {
        if (cancelled) return;
        setName(recipe.name);
        setImageId(recipe.imageId ?? null);
        const instructionSteps = Array.isArray(recipe.instructions)
          ? recipe.instructions
          : [recipe.instructions];
        setInstructions(
          instructionSteps.length > 0
            ? instructionSteps.map((step, index) => ({
                ...makeInstructionRow(step),
                imageId: recipe.instructionImageIds?.[index],
              }))
            : [makeInstructionRow()],
        );
        setChefNotes(recipe.chefNotes ?? '');
        setSourceUrl(recipe.sourceUrl ?? '');
        setIngredients(
          recipe.ingredients.length > 0
            ? recipe.ingredients.map((ing) => ({
                ...ing,
                _id: ++nextId,
                quantityStr: ing.quantity === null ? '' : String(ing.quantity),
                unit: resolveUnit(ing.unit),
              }))
            : [makeRow()],
        );
        setPrepTime(recipe.prepTime !== undefined ? String(recipe.prepTime) : '');
        setCookTime(recipe.cookTime !== undefined ? String(recipe.cookTime) : '');
        setTotalKcal(recipe.totalKcal ?? undefined);
        setOriginalPrepTime(recipe.prepTime);
        setOriginalCookTime(recipe.cookTime);
        setSelectedPortions(recipe.portions ?? 1);
        setOriginalPortions(recipe.portions ?? 1);
        setTags(recipe.tags ?? []);
      })
      .catch((err) => {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : 'Failed to load recipe');
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
    (id: number, field: keyof Omit<IngredientRow, '_id'>, value: string) => {
      setIngredients((prev) => prev.map((r) => (r._id === id ? { ...r, [field]: value } : r)));
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

  const handlePortionsIncrement = useCallback(() => {
    setSelectedPortions((p) => p + 1);
  }, []);

  const handlePortionsDecrement = useCallback(() => {
    if (selectedPortions <= 1) return;
    setSelectedPortions((p) => p - 1);
  }, [selectedPortions]);

  const closeDropdown = useCallback((rowId: number) => {
    setDropdowns((prev) => ({ ...prev, [rowId]: { visible: false, items: [], focusedIndex: -1 } }));
  }, []);

  const handleIngredientNameChange = useCallback(
    (rowId: number, value: string) => {
      updateIngredientField(rowId, 'name', value);

      if (debounceTimers.current[rowId]) clearTimeout(debounceTimers.current[rowId]);

      if (value.length < 3) {
        closeDropdown(rowId);
        return;
      }

      debounceTimers.current[rowId] = setTimeout(async () => {
        if (abortControllers.current[rowId]) abortControllers.current[rowId].abort();
        const controller = new AbortController();
        abortControllers.current[rowId] = controller;
        try {
          const [nameRes, barcodeRes, brandRes, categoryRes, whereToBuyRes] = await Promise.all([
            searchInventory('name', value).catch(() => null),
            searchInventory('barcode', value).catch(() => null),
            searchInventory('brand', value).catch(() => null),
            searchInventory('category', value).catch(() => null),
            searchInventory('whereToBuy', value).catch(() => null),
          ]);
          if (controller.signal.aborted) return;

          const seen = new Set<string>();
          const merged: InventoryItem[] = [];
          for (const item of [
            ...(nameRes?.items ?? []),
            ...(barcodeRes?.items ?? []),
            ...(brandRes?.items ?? []),
            ...(categoryRes?.items ?? []),
            ...(whereToBuyRes?.items ?? []),
          ] as InventoryItem[]) {
            if (!seen.has(item.itemId)) {
              seen.add(item.itemId);
              merged.push(item);
            }
          }

          setDropdowns((prev) => ({
            ...prev,
            [rowId]: {
              visible: merged.length > 0,
              items: merged,
              focusedIndex: -1,
            },
          }));
        } catch {
          if (!controller.signal.aborted) closeDropdown(rowId);
        }
      }, 300);
    },
    [updateIngredientField, closeDropdown],
  );

  const handleIngredientSelect = useCallback(
    (rowId: number, index: number) => {
      const item = dropdowns[rowId]?.items[index];
      if (!item) return;
      setIngredients((prev) =>
        prev.map((r) =>
          r._id === rowId
            ? {
                ...r,
                name: item.name,
                unit: resolveUnit((item as InventoryItem & { unit?: string }).unit ?? r.unit),
              }
            : r,
        ),
      );
      closeDropdown(rowId);
    },
    [dropdowns, closeDropdown],
  );

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!validKcal(totalKcal)) errs.totalKcal = 'Calories must be finite and non-negative';
    if (!name.trim()) errs.name = 'Recipe name is required.';
    if (instructions.every((step) => !step.value.trim())) {
      errs.instructions = 'Instructions are required.';
    }
    if (ingredients.length === 0) errs.ingredients = 'At least one ingredient is required.';

    const rowErrors: Record<number, { name?: string; quantity?: string; unit?: string }> = {};
    ingredients.forEach((row) => {
      const rowErr: { name?: string; quantity?: string; unit?: string } = {};
      if (!row.name.trim()) rowErr.name = 'Name is required.';
      const parsedQty = parseFractionalQuantity(row.quantityStr);
      if (row.unit !== 'handful' && (!parsedQty || parsedQty <= 0)) {
        rowErr.quantity = 'Enter a valid quantity (e.g. 1, 1/2, 1 1/4).';
      }
      if (!row.unit.trim()) rowErr.unit = 'Unit is required.';
      if (Object.keys(rowErr).length > 0) rowErrors[row._id] = rowErr;
    });
    if (Object.keys(rowErrors).length > 0) errs.ingredientRows = rowErrors;

    const prepTimeErr = validateTimeField(prepTime, 'Prep time');
    if (prepTimeErr) errs.prepTime = prepTimeErr;
    const cookTimeErr = validateTimeField(cookTime, 'Cook time');
    if (cookTimeErr) errs.cookTime = cookTimeErr;

    if (!isEdit) {
      const portionsErr = validatePortionsField(portions);
      if (portionsErr) errs.portions = portionsErr;
    }

    if (tags.length === 0) errs.tags = 'At least one tag is required.';

    return errs;
  }, [name, instructions, ingredients, prepTime, cookTime, portions, isEdit, tags, totalKcal]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (uploads > 0) return;
      const errs = validate();
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }
      setErrors({});
      setSubmitError(null);
      setSubmitting(true);

      const normalizedIngredients: RecipeIngredient[] = ingredients.map(
        ({ name: ingredientName, quantityStr, unit, section }) => ({
          name: ingredientName.trim(),
          quantity:
            unit === 'handful' && quantityStr.trim() === ''
              ? null
              : parseFractionalQuantity(quantityStr)!,
          unit,
          ...(section?.trim() ? { section: section.trim() } : {}),
        }),
      );
      let ingredientsToSave = normalizedIngredients;
      if (isEdit && selectedPortions !== originalPortions) {
        const scaledQuantities = scaleIngredients(
          normalizedIngredients,
          originalPortions,
          selectedPortions,
        );
        ingredientsToSave = normalizedIngredients.map((ingredient, index) => ({
          ...ingredient,
          quantity: scaledQuantities[index],
        }));
      }

      const baseData = {
        totalKcal,
        imageId: imageId ?? undefined,
        instructionImageIds: instructions
          .filter((step) => step.value.trim())
          .map((step) => step.imageId ?? null),
        name: name.trim(),
        instructions: instructions.map((step) => step.value.trim()).filter(Boolean),
        chefNotes: chefNotes.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        ingredients: ingredientsToSave,
      };

      const timeFields: { prepTime?: number | null; cookTime?: number | null } = {};
      if (isEdit) {
        if (prepTime !== '') {
          timeFields.prepTime = Number(prepTime);
        } else if (originalPrepTime !== undefined) {
          timeFields.prepTime = null;
        }
        if (cookTime !== '') {
          timeFields.cookTime = Number(cookTime);
        } else if (originalCookTime !== undefined) {
          timeFields.cookTime = null;
        }
      } else {
        if (prepTime !== '') timeFields.prepTime = Number(prepTime);
        if (cookTime !== '') timeFields.cookTime = Number(cookTime);
      }

      try {
        if (isEdit && recipeId) {
          await updateRecipe(recipeId, {
            ...baseData,
            ...timeFields,
            totalKcal: totalKcal ?? null,
            chefNotes: chefNotes.trim() || null,
            imageId,
            portions: selectedPortions,
            tags,
          });
          onSaved(recipeId);
        } else {
          const createTimeFields: { prepTime?: number; cookTime?: number } = {};
          if (timeFields.prepTime != null)
            createTimeFields.prepTime = timeFields.prepTime as number;
          if (timeFields.cookTime != null)
            createTimeFields.cookTime = timeFields.cookTime as number;
          const recipe = await createRecipe({
            ...baseData,
            ...createTimeFields,
            portions: Number(portions),
            tags,
          });
          onSaved(recipe.recipeId);
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to save recipe');
      } finally {
        setSubmitting(false);
      }
    },
    [
      validate,
      name,
      imageId,
      uploads,
      instructions,
      chefNotes,
      sourceUrl,
      ingredients,
      isEdit,
      recipeId,
      onSaved,
      prepTime,
      cookTime,
      totalKcal,
      originalPrepTime,
      originalCookTime,
      portions,
      selectedPortions,
      originalPortions,
      tags,
    ],
  );

  if (loading) {
    return (
      <div style={styles.centered} role="status" aria-label={t('Loading recipe')}>
        <p style={styles.statusText}>{t('Loading…')}</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={styles.centered} role="alert">
        <p style={styles.errorText}>{translateMessage(fetchError)}</p>
        <button onClick={onCancel} style={styles.cancelButton} type="button">
          {t('Back')}{' '}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <button
          onClick={onCancel}
          style={styles.backButton}
          type="button"
          aria-label={t('Go back')}
        >
          {t('← Back')}{' '}
        </button>
        <h2 style={styles.pageTitle}>{isEdit ? t('Edit Recipe') : t('New Recipe')}</h2>
      </div>

      {initialDraft && (
        <ImportReview draft={initialDraft} onImage={setImageId} onBusy={imageBusy} />
      )}
      {submitError && (
        <div style={styles.errorBanner} role="alert">
          {translateMessage(submitError)}
        </div>
      )}

      <form id="recipe-editor-form" onSubmit={handleSubmit} noValidate style={styles.form}>
        <RecipeCalories
          total={totalKcal}
          portions={isEdit ? selectedPortions : Number(portions) || 1}
          onChange={setTotalKcal}
        />
        {errors.totalKcal && <p role="alert">{translateMessage(errors.totalKcal)}</p>}
        <RecipeNameField
          value={name}
          error={errors.name}
          onChange={(value) => {
            setName(value);
            setErrors((previous) => ({ ...previous, name: undefined }));
          }}
        />
        <RecipePhotoField
          label={t('Recipe image')}
          imageId={imageId}
          onChange={setImageId}
          onBusy={imageBusy}
          disabled={submitting || uploads > 0}
        />

        {/* Tags */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            {t('Tags')} <span aria-hidden="true">*</span>
          </label>
          <TagInput
            tags={tags}
            onChange={(newTags) => {
              setTags(newTags);
              setErrors((prev) => ({ ...prev, tags: undefined }));
            }}
            allTags={allTags}
            tagsLoading={tagsLoading}
            error={errors.tags}
          />
        </div>

        <RecipeInstructionsEditor
          instructions={instructions}
          setInstructions={setInstructions}
          error={errors.instructions}
          onClearError={() => setErrors((prev) => ({ ...prev, instructions: undefined }))}
          onBusy={imageBusy}
          disabled={submitting || uploads > 0}
        />

        <div style={styles.fieldGroup}>
          <label htmlFor="recipe-chef-notes" style={styles.label}>
            {t("Chef's notes")}{' '}
          </label>
          <textarea
            id="recipe-chef-notes"
            value={chefNotes}
            onChange={(e) => setChefNotes(e.target.value)}
            style={styles.textarea}
            rows={3}
          />
        </div>

        {/* Source URL */}
        <div style={styles.fieldGroup}>
          <label htmlFor="recipe-source-url" style={styles.label}>
            {t('Source URL')}{' '}
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

        {/* Time fields */}
        <div style={styles.timeFieldsRow}>
          <div style={styles.fieldGroup}>
            <label htmlFor="recipe-prep-time" style={styles.label}>
              {t('Prep time (min)')}{' '}
            </label>
            <input
              id="recipe-prep-time"
              type="number"
              min="0"
              step="1"
              value={prepTime}
              onChange={(e) => {
                setPrepTime(e.target.value);
                setErrors((prev) => ({ ...prev, prepTime: undefined }));
              }}
              style={styles.input}
              aria-label={t('Prep time (min)')}
              aria-invalid={!!errors.prepTime}
              placeholder="e.g. 15"
            />
            {errors.prepTime && (
              <span style={styles.fieldError} role="alert">
                {translateMessage(errors.prepTime)}
              </span>
            )}
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="recipe-cook-time" style={styles.label}>
              {t('Cook time (min)')}{' '}
            </label>
            <input
              id="recipe-cook-time"
              type="number"
              min="0"
              step="1"
              value={cookTime}
              onChange={(e) => {
                setCookTime(e.target.value);
                setErrors((prev) => ({ ...prev, cookTime: undefined }));
              }}
              style={styles.input}
              aria-label={t('Cook time (min)')}
              aria-invalid={!!errors.cookTime}
              placeholder="e.g. 30"
            />
            {errors.cookTime && (
              <span style={styles.fieldError} role="alert">
                {translateMessage(errors.cookTime)}
              </span>
            )}
          </div>
        </div>

        {/* Portions (create mode only) */}
        {!isEdit && (
          <div style={styles.fieldGroup}>
            <label htmlFor="recipe-portions" style={styles.label}>
              {t('Portions')} <span aria-hidden="true">*</span>
            </label>
            <input
              id="recipe-portions"
              type="number"
              min="1"
              step="1"
              value={portions}
              onChange={(e) => {
                setPortions(e.target.value);
                setErrors((prev) => ({ ...prev, portions: undefined }));
              }}
              style={styles.input}
              aria-required="true"
              aria-invalid={!!errors.portions}
              placeholder="e.g. 4"
            />
            {errors.portions && (
              <span style={styles.fieldError} role="alert">
                {translateMessage(errors.portions)}
              </span>
            )}
          </div>
        )}

        {/* Portions scaler (edit mode only) */}
        {isEdit && (
          <div style={styles.fieldGroup}>
            <span style={styles.label}>{t('Portions')}</span>
            <div style={styles.portionsScalerRow}>
              <button
                type="button"
                onClick={handlePortionsDecrement}
                disabled={selectedPortions === 1}
                aria-label={t('Decrease portions')}
                style={styles.portionsScalerButton}
              >
                –
              </button>
              <span style={styles.portionsScalerValue}>
                {selectedPortions} {t('portions')}
              </span>
              <button
                type="button"
                onClick={handlePortionsIncrement}
                aria-label={t('Increase portions')}
                style={styles.portionsScalerButton}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Ingredients */}
        <div style={styles.fieldGroup}>
          <div style={styles.ingredientsHeader}>
            <span style={styles.label}>
              {t('Ingredients')} <span aria-hidden="true">*</span>
            </span>
          </div>
          {errors.ingredients && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(errors.ingredients)}
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
                      <label htmlFor={`ing-name-${row._id}`} style={styles.smallLabel}>
                        {t('Name')}{' '}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          id={`ing-name-${row._id}`}
                          type="text"
                          value={row.name}
                          onChange={(e) => handleIngredientNameChange(row._id, e.target.value)}
                          style={styles.input}
                          aria-label={t('Ingredient {0} name', index + 1)}
                          aria-invalid={!!rowErr?.name}
                          aria-autocomplete={dropdowns[row._id]?.visible ? 'list' : undefined}
                          aria-expanded={dropdowns[row._id]?.visible ?? false}
                          aria-controls={
                            dropdowns[row._id]?.visible ? `ing-dropdown-${row._id}` : undefined
                          }
                        />
                        <AutocompleteDropdown
                          isVisible={dropdowns[row._id]?.visible ?? false}
                          items={dropdowns[row._id]?.items ?? []}
                          focusedIndex={dropdowns[row._id]?.focusedIndex ?? -1}
                          onSelect={(i) => handleIngredientSelect(row._id, i)}
                          onClose={() => closeDropdown(row._id)}
                          onFocusChange={(i) =>
                            setDropdowns((prev) => ({
                              ...prev,
                              [row._id]: { ...prev[row._id], focusedIndex: i },
                            }))
                          }
                          inputId={`ing-name-${row._id}`}
                          dropdownId={`ing-dropdown-${row._id}`}
                          renderItem={(item) => (
                            <div>
                              <div style={{ fontWeight: 600 }}>{item.name}</div>
                              <div
                                style={{ fontSize: '0.875rem', color: 'var(--color-secondary)' }}
                              >
                                {item.category}
                                {item.brand ? ` • ${item.brand}` : ''}
                                {(item as InventoryItem & { unit?: string }).unit
                                  ? ` • ${getUnitLabel((item as InventoryItem & { unit?: string }).unit!, 2)}`
                                  : ''}
                                {item.barcode ? ` • ${item.barcode}` : ''}
                              </div>
                            </div>
                          )}
                          ariaLabel="Ingredient name suggestions"
                        />
                      </div>
                      {rowErr?.name && (
                        <span style={styles.fieldError} role="alert">
                          {translateMessage(rowErr.name)}
                        </span>
                      )}
                    </div>

                    <div style={styles.ingredientNameGroup}>
                      <label htmlFor={`ing-section-${row._id}`} style={styles.smallLabel}>
                        {t('Section')}{' '}
                      </label>
                      <input
                        id={`ing-section-${row._id}`}
                        type="text"
                        value={row.section ?? ''}
                        onChange={(e) => updateIngredientField(row._id, 'section', e.target.value)}
                        style={styles.input}
                        aria-label={t('Ingredient {0} section', index + 1)}
                        placeholder={t('e.g. For the sauce')}
                      />
                    </div>

                    <IngredientMeasurements
                      row={row}
                      rowErr={rowErr}
                      index={index}
                      onValue={(value) => updateIngredientField(row._id, 'quantityStr', value)}
                      onUnit={(unit) =>
                        setIngredients((prev) =>
                          prev.map((r) =>
                            r._id === row._id
                              ? {
                                  ...r,
                                  unit,
                                  quantityStr: changeMeasureUnit(r.quantityStr, r.unit, unit),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                    <MoveRowButtons
                      index={index}
                      count={ingredients.length}
                      label={t('ingredient {0}', index + 1)}
                      disabled={submitting}
                      onMove={(direction) =>
                        setIngredients((current) => moveRow(current, index, direction))
                      }
                    />
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeIngredient(row._id)}
                    style={styles.removeButton}
                    disabled={ingredients.length <= 1}
                    aria-label={t('Remove ingredient {0}', index + 1)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={addIngredient} style={styles.addIngredientButton}>
            {t('+ Add Ingredient')}{' '}
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
          disabled={submitting || uploads > 0}
        >
          {t('Cancel')}{' '}
        </button>
        <button
          type="submit"
          form="recipe-editor-form"
          style={styles.submitButton}
          disabled={submitting || uploads > 0}
        >
          {submitting ? t('Saving…') : isEdit ? t('Save Changes') : t('Create Recipe')}
        </button>
      </div>
    </div>
  );
};

export default RecipeEditor;
