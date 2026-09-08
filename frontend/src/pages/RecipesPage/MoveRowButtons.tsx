import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';
export function moveRow<T>(rows: T[], index: number, direction: number): T[] {
  const next = [...rows];
  const target = index + direction;
  if (target < 0 || target >= rows.length) return rows;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export default function MoveRowButtons({
  index,
  count,
  label,
  onMove,
  disabled = false,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (direction: number) => void;
  disabled?: boolean;
}) {
  useLanguage();
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[-1, 1].map((direction) => (
        <button
          key={direction}
          type="button"
          style={{
            minWidth: 44,
            minHeight: 44,
            border: 0,
            borderRadius: 6,
            background: 'var(--color-sky)',
          }}
          disabled={disabled || index + direction < 0 || index + direction >= count}
          aria-label={t(direction < 0 ? 'Move {0} up' : 'Move {0} down', label)}
          onClick={() => onMove(direction)}
        >
          {direction < 0 ? '↑' : '↓'}
        </button>
      ))}
    </span>
  );
}
