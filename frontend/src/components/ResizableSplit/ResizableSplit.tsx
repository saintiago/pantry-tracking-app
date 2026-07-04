import React, { useCallback, useRef, useState } from 'react';

interface ResizableSplitProps {
  /** Content rendered in the top panel */
  top: React.ReactNode;
  /** Content rendered in the bottom panel */
  bottom: React.ReactNode;
  /** Fraction of container height for the top panel (0–1). Default 0.6 */
  defaultRatio?: number;
  /** Minimum fraction for the top panel. Default 0.15 */
  minRatio?: number;
  /** Maximum fraction for the top panel. Default 0.85 */
  maxRatio?: number;
}

const HANDLE_HEIGHT = 44;

/**
 * A touch-friendly vertical split panel with a draggable divider.
 *
 * Uses the Pointer Events API for unified mouse + touch handling.
 * Live dragging updates the DOM directly via refs for 60 fps smoothness;
 * React state is only updated on pointer-up to persist the final ratio.
 */
const ResizableSplit: React.FC<ResizableSplitProps> = ({
  top,
  bottom,
  defaultRatio = 0.6,
  minRatio = 0.15,
  maxRatio = 0.85,
}) => {
  const [ratio, setRatio] = useState(defaultRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const topPanelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const ratioRef = useRef(defaultRatio);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingRef.current = true;
      (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !containerRef.current || !topPanelRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const rawRatio = (e.clientY - rect.top) / rect.height;
    const clamped = Math.max(minRatio, Math.min(maxRatio, rawRatio));

    // Direct DOM update for smooth 60 fps — no React re-render during drag
    topPanelRef.current.style.flex = String(clamped);
    ratioRef.current = clamped;
  }, [minRatio, maxRatio]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    (e.target as HTMLDivElement).releasePointerCapture(e.pointerId);
    // Persist final ratio to React state
    setRatio(ratioRef.current);
  }, []);

  return (
    <div
      ref={containerRef}
      style={styles.container}
      data-testid="resizable-split"
    >
      <div
        ref={topPanelRef}
        style={{ ...styles.panel, flex: ratio }}
        data-testid="resizable-split-top"
      >
        {top}
      </div>

      <div
        style={styles.handle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-testid="resizable-split-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(minRatio * 100)}
        aria-valuemax={Math.round(maxRatio * 100)}
        aria-label="Drag to resize panels"
        tabIndex={0}
      >
        <div style={styles.gripIcon} aria-hidden="true">
          <span style={styles.gripLine} />
          <span style={styles.gripLine} />
          <span style={styles.gripLine} />
        </div>
      </div>

      <div
        style={{ ...styles.panel, flex: 1 - ratio }}
        data-testid="resizable-split-bottom"
      >
        {bottom}
      </div>
    </div>
  );
};

export default ResizableSplit;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    userSelect: 'none',
  },
  panel: {
    overflowY: 'auto',
    minHeight: 0,
    boxSizing: 'border-box',
  },
  handle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: HANDLE_HEIGHT,
    minHeight: HANDLE_HEIGHT,
    flexShrink: 0,
    cursor: 'row-resize',
    backgroundColor: '#f3f4f6',
    borderTop: '1px solid #e5e7eb',
    borderBottom: '1px solid #e5e7eb',
    touchAction: 'none',
    userSelect: 'none',
  },
  gripIcon: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
  },
  gripLine: {
    display: 'block',
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
};
