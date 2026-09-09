import Emoji from '../../preferences/Emoji';
import { departmentColor, departmentFor } from './departments';
import React from 'react';
import { date, t, useLanguage } from '../../i18n/i18n';
import { styles } from './styles';
import { formatMeasurement } from '../../types/units';
import { useHoverState, useInteractionFeedback } from '../../hooks/useInventoryAnimations';
import type { InventoryItem } from '../../domain/inventory/types';
import Tooltip from '../Tooltip/Tooltip';
import { LowStockBadge } from './LowStockBadge';
import { suggestedProductIcon } from './icons';
interface InventoryItemCardProps {
  item: InventoryItem;
  locationName: string;
  locationColor?: string;
  removeMode: boolean;
  onRemove?: (itemId: string) => void;
  selected?: boolean;
  onToggleSelected?: (itemId: string) => void;
  onClick?: () => void;
}

export const InventoryItemCard: React.FC<InventoryItemCardProps> = ({
  item,
  locationName,
  locationColor,
  removeMode,
  onRemove,
  selected = false,
  onToggleSelected,
  onClick,
}) => {
  useLanguage();
  const isClickable = !removeMode && !!onClick;
  const { isHovered: isCardHovered, hoverProps: cardHoverProps } = useHoverState();
  const { isHovered: isRemoveHovered, hoverProps: removeHoverProps } = useHoverState();
  const { feedbackClass, triggerSuccess } = useInteractionFeedback();

  const handleClick = () => {
    if (isClickable) {
      triggerSuccess();
      onClick?.();
    }
  };

  return (
    <div
      style={{
        ...styles.card,
        display: 'grid',
        gridTemplateColumns:
          onRemove || onToggleSelected ? '40px minmax(0, 1fr) 44px' : '40px minmax(0, 1fr)',
        ...(removeMode ? styles.cardRemoveMode : {}),
        ...(isClickable ? { cursor: 'pointer' } : {}),
        boxShadow: isCardHovered && isClickable ? 'var(--inv-shadow-md)' : 'var(--inv-shadow-sm)',
        transform: isCardHovered && isClickable ? 'scale(1.015)' : 'scale(1)',
        transition:
          'transform 0.2s var(--inv-spring, cubic-bezier(0.34,1.56,0.64,1)), box-shadow 0.2s ease',
      }}
      className={feedbackClass}
      data-testid={`item-card-${item.itemId}`}
      onClick={handleClick}
      onKeyDown={
        isClickable
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      {...(isClickable ? cardHoverProps : {})}
    >
      {/* Thumbnail area */}
      <div
        style={{
          ...styles.thumbnail,
          width: 40,
          height: 40,
          minWidth: 40,
          gridRow: 1,
          gridColumn: 1,
        }}
        aria-label={t('Item picture')}
      >
        {item.pictureUrl ? (
          <img src={item.pictureUrl} alt={item.name} style={styles.thumbnailImg} />
        ) : (
          <span style={styles.thumbnailPlaceholder} aria-hidden="true">
            <Emoji>{suggestedProductIcon(item.name, item.category, item.icon)}</Emoji>
          </span>
        )}
      </div>

      <div style={{ display: 'contents' }}>
        <div style={{ ...styles.cardHeader, gridColumn: 2, gridRow: 1 }}>
          <span style={{ ...styles.itemName, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
            {item.name}
          </span>
          {item.isLowStock && <LowStockBadge />}
        </div>

        <div style={{ ...styles.cardMeta, gridColumn: '1 / -1' }}>
          <span
            style={{
              ...styles.categoryBadge,
              backgroundColor: departmentColor(departmentFor(item.category, item.category)),
            }}
          >
            {item.category}
          </span>
        </div>

        <div style={{ ...styles.cardDetails, gridColumn: '1 / -1', gap: '0.5rem' }}>
          <span
            style={{
              ...styles.locationBadge,
              ...(locationColor ? { backgroundColor: locationColor } : {}),
            }}
          >
            {locationName}
          </span>
          <span>{formatMeasurement(item.quantity, item.unit)}</span>
          <span style={styles.expiration}>
            {t('Exp:')}{' '}
            {item.expirationDate === null ? t('Not applicable') : date(item.expirationDate)}
          </span>
        </div>
      </div>

      {removeMode && onToggleSelected && (
        <div style={{ gridColumn: 3, gridRow: 1 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(item.itemId)}
            onClick={(event) => event.stopPropagation()}
            aria-label={t('Select {0} for removal', item.name)}
            style={styles.selectionCheckbox}
          />
        </div>
      )}

      {!removeMode && onRemove && (
        <div style={{ gridColumn: 3, gridRow: 1 }}>
          <Tooltip content={`Remove ${item.name}`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.itemId);
              }}
              style={{
                ...styles.removeItemButton,
                backgroundColor: 'var(--color-danger)',
                opacity: isRemoveHovered ? 0.8 : 1,
                transition: 'background-color 0.15s ease',
              }}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label={t('Remove {0}', item.name)}
              {...removeHoverProps}
            >
              ✕
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};
