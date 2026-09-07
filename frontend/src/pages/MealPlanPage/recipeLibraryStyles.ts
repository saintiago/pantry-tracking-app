import type React from 'react';
export const rowStyle: React.CSSProperties = {
  display: 'flex',
  marginBottom: 6,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
};
export const nameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  textAlign: 'left',
  padding: 10,
  border: 0,
  background: 'transparent',
  color: 'var(--color-text)',
  overflowWrap: 'anywhere',
  cursor: 'pointer',
};
export function chip(selected: boolean): React.CSSProperties {
  return {
    minHeight: 36,
    padding: '6px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    color: 'var(--color-text)',
    background: selected ? 'var(--color-mint)' : 'var(--color-surface)',
    cursor: 'pointer',
  };
}
