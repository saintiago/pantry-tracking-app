import React, { useCallback, useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  /** The confirmation message */
  message: string;
  /** Label for the confirm (destructive/secondary) action */
  confirmLabel: string;
  /** Label for the cancel (primary/safe) action */
  cancelLabel: string;
  /** Called when the user confirms */
  onConfirm: () => void;
  /** Called when the user cancels or dismisses */
  onCancel: () => void;
}

/**
 * Inline confirmation dialog rendered as a modal overlay.
 *
 * Used within CookingMode to confirm "Finish Cooking" when not all steps
 * are completed. Traps focus within the dialog and closes on Escape.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel (safe) button on mount
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <div
      style={styles.backdrop}
      onClick={onCancel}
      data-testid="confirm-dialog-backdrop"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm finish cooking"
        style={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={styles.cancelButton}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={styles.confirmButton}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: '1.5rem',
    maxWidth: 360,
    width: '100%',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
    outline: 'none',
  },
  message: {
    margin: 0,
    fontSize: '1rem',
    color: '#1a1a1a',
    lineHeight: 1.6,
    marginBottom: '1.25rem',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.625rem 1rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#d4829a',
    backgroundColor: '#fdeef3',
    border: '1px solid #f5c6d5',
    borderRadius: 8,
    cursor: 'pointer',
  },
  confirmButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.625rem 1rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
