import React, { useEffect, useRef } from 'react';
export default function DialogShell({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      ref={root}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: '#0006',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'Tab') {
          const nodes = [
            ...(root.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), textarea, select:not(:disabled), [href]',
            ) ?? []),
          ].filter((node) => node.offsetParent !== null);
          const first = nodes[0],
            last = nodes.at(-1);
          if (!first) {
            event.preventDefault();
            return;
          }
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === root.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === root.current)
          ) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <section
        style={{
          background: 'var(--color-surface)',
          borderRadius: 12,
          padding: 20,
          width: 'min(100%, 600px)',
          maxHeight: '85vh',
          overflow: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </section>
    </div>
  );
}
