import React, { useCallback, useEffect, useRef, useState } from 'react';

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
 *
 * pointermove/pointerup use native DOM listeners on the handle element
 * (not React synthetic events) because React's event delegation can fail
 * to dispatch captured pointer events to the correct fiber after
 * setPointerCapture, especially on touch devices.
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
  const bottomPanelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const ratioRef = useRef(defaultRatio);
  // Stable refs for min/max so native listeners can read current values
  const minRatioRef = useRef(minRatio);
  const maxRatioRef = useRef(maxRatio);
  minRatioRef.current = minRatio;
  maxRatioRef.current = maxRatio;

  // Attach native pointermove/pointerup listeners on the handle element.
  // These must be native (not React synthetic) because React's root-level
  // event delegation does not reliably dispatch captured pointer events.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current || !topPanelRef.current || !bottomPanelRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const rawRatio = (e.clientY - rect.top) / rect.height;
      const clamped = Math.max(minRatioRef.current, Math.min(maxRatioRef.current, rawRatio));

      // Direct DOM update for smooth 60 fps — no React re-render during drag.
      // Both panels must be updated so flex proportions stay consistent.
      topPanelRef.current.style.flex = String(clamped);
      bottomPanelRef.current.style.flex = String(1 - clamped);
      ratioRef.current = clamped;
    };

    const onPointerUp = (e: PointerEvent) => {
      draggingRef.current = false;
      handle.releasePointerCapture(e.pointerId);
      // Persist final ratio to React state
      setRatio(ratioRef.current);
    };

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);

    return () => {
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerUp);
    };
  }, []); // stable — min/max read from refs

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Do NOT call e.preventDefault() — touchAction: 'none' on the
      // handle already tells the browser not to start scroll/zoom gestures.
      // preventDefault() on pointerdown can suppress subsequent
      // pointermove events on some mobile browsers.
      draggingRef.current = true;
      handleRef.current?.setPointerCapture(e.pointerId);
    },
    [],
  );

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
        ref={handleRef}
        style={styles.handle}
        onPointerDown={handlePointerDown}
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
        ref={bottomPanelRef}
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
    flex: 1,
    minHeight: 0,
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
    pointerEvents: 'none',
  },
  gripLine: {
    display: 'block',
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    pointerEvents: 'none',
  },
};
