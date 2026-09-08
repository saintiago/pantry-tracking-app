import MoveRowButtons, { moveRow } from './MoveRowButtons';
import React from 'react';
import { styles } from './styles';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import RecipePhotoField from '../../components/RecipePhoto/RecipePhotoField';
export interface InstructionRow {
  _id: number;
  value: string;
  imageId?: string | null;
}
let nextId = 0;
export const makeInstructionRow = (value = ''): InstructionRow => ({ _id: ++nextId, value });
export default function RecipeInstructionsEditor({
  instructions,
  setInstructions,
  error,
  onClearError,
  onBusy,
  disabled,
}: {
  instructions: InstructionRow[];
  setInstructions: React.Dispatch<React.SetStateAction<InstructionRow[]>>;
  error?: string;
  onClearError: () => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  useLanguage();
  return (
    <>
      {' '}
      {/* Instructions */}
      <div style={styles.fieldGroup}>
        <span style={styles.label}>
          {t('Instructions')} <span aria-hidden="true">*</span>
        </span>
        {instructions.map((step, index) => (
          <div key={step._id}>
            <div style={styles.instructionRow}>
              <span style={styles.stepNumber}>{index + 1}.</span>
              <textarea
                value={step.value}
                onChange={(e) => {
                  const value = e.target.value;
                  setInstructions((current) =>
                    current.map((item) => (item._id === step._id ? { ...item, value } : item)),
                  );
                  onClearError();
                }}
                style={styles.textarea}
                rows={2}
                aria-label={index === 0 ? t('Instructions') : t('Instruction step {0}', index + 1)}
                aria-required="true"
                aria-invalid={!!error}
              />
              <button
                type="button"
                onClick={() =>
                  setInstructions((current) =>
                    current.length > 1 ? current.filter((item) => item._id !== step._id) : current,
                  )
                }
                disabled={disabled || instructions.length === 1}
                aria-label={t('Remove instruction step {0}', index + 1)}
                style={styles.removeButton}
              >
                ×
              </button>
            </div>
            <MoveRowButtons
              index={index}
              count={instructions.length}
              label={t('instruction step {0}', index + 1)}
              disabled={disabled}
              onMove={(direction) =>
                setInstructions((current) => moveRow(current, index, direction))
              }
            />
            <RecipePhotoField
              label={t('Image for step {0}', index + 1)}
              imageId={step.imageId}
              onBusy={onBusy}
              disabled={disabled}
              onChange={(imageId) =>
                setInstructions((current) =>
                  current.map((item) => (item._id === step._id ? { ...item, imageId } : item)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setInstructions((current) => [...current, makeInstructionRow()])}
          disabled={disabled}
          style={styles.addIngredientButton}
        >
          {t('+ Add Step')}{' '}
        </button>
        {error && (
          <span style={styles.fieldError} role="alert">
            {translateMessage(error)}
          </span>
        )}
      </div>
    </>
  );
}
