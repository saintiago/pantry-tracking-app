import type React from 'react';
import { action as button } from './ShoppingRows';
export const input: React.CSSProperties = { ...button, width: '100%', boxSizing: 'border-box' };
export const filterStyle = (selected: boolean): React.CSSProperties => ({
  ...button,
  minWidth: 0,
  padding: '10px 6px',
  overflowWrap: 'anywhere',
  background: selected ? 'var(--color-mint)' : 'var(--color-surface)',
});

export const weekNavigation: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '44px minmax(0, 1fr) 44px',
  alignItems: 'end',
  gap: 8,
  marginTop: 12,
};
