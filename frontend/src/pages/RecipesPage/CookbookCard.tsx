import React, { useEffect, useRef, useState } from 'react';
import type { Cookbook } from '@pantry/domain';
import LibraryCover from './LibraryCover';
import { t, useLanguage } from '../../i18n/i18n';
export function CookbookActions({
  book,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}: {
  book: Cookbook;
  onEdit: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  useLanguage();
  return (
    <div className="cookbook-actions">
      {onMoveUp && (
        <button
          type="button"
          aria-label={t('Move cookbook {0} up', book.name)}
          title={t('Move cookbook up')}
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          ↑
        </button>
      )}
      {onMoveDown && (
        <button
          type="button"
          aria-label={t('Move cookbook {0} down', book.name)}
          title={t('Move cookbook down')}
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          ↓
        </button>
      )}
      <button
        type="button"
        aria-label={t('Edit cookbook {0}', book.name)}
        title={t('Edit cookbook')}
        onClick={onEdit}
      >
        ✎
      </button>
      <button
        type="button"
        aria-label={t('Remove cookbook {0}', book.name)}
        title={t('Remove cookbook')}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
export default function CookbookCard({
  book,
  count,
  onOpen,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  book: Cookbook;
  count: number;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  useLanguage();
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const origin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <article
      className="cookbook-card"
      data-held={held || undefined}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false);
      }}
    >
      <button
        type="button"
        className="cookbook-open"
        aria-label={t('Open cookbook {0}', book.name)}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          stop();
          suppressClick.current = false;
          origin.current = { x: e.clientX, y: e.clientY };
          timer.current = setTimeout(() => {
            suppressClick.current = true;
            setHeld(true);
          }, 500);
        }}
        onPointerMove={(e) => {
          if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) stop();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onContextMenu={(e) => {
          e.preventDefault();
          setHeld(true);
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onOpen();
        }}
      >
        <span className="cookbook-heading">
          <strong>{book.name}</strong>
          <small>{t('{0} recipes', count)}</small>
        </span>
        <LibraryCover imageId={book.imageId} name={book.name} />
      </button>
      {book.description && <p className="cookbook-description">{book.description}</p>}
      <CookbookActions
        book={book}
        onEdit={onEdit}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
      />
    </article>
  );
}
