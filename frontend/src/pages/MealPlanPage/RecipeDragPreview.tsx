import React from 'react';
import type { Drag } from './useRecipeDrag';
import { rowStyle, nameStyle, chip } from './recipeLibraryStyles';

/** Keep the original grab point under the pointer, including when dragging by touch. */
export default function RecipeDragPreview({ drag }: { drag: Drag }) {
  return (
    <div
      data-testid="recipe-drag-preview"
      aria-hidden="true"
      style={{
        ...rowStyle,
        position: 'fixed',
        left: drag.x - drag.offsetX,
        top: drag.y - drag.offsetY,
        width: drag.width,
        height: drag.height,
        boxSizing: 'border-box',
        margin: 0,
        zIndex: 2000,
        pointerEvents: 'none',
        boxShadow: '0 8px 24px #0003, 0 2px 6px #0002',
      }}
    >
      <button type="button" tabIndex={-1} style={nameStyle}>
        {drag.name}
      </button>
      <button type="button" tabIndex={-1} style={{ ...chip(drag.selected), minWidth: 44 }}>
        ⠿
      </button>
    </div>
  );
}
