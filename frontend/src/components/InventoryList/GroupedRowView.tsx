import React, { useState } from 'react';
import MeasurementInput, { changeMeasureUnit } from '../../preferences/MeasurementInput';
import { displayUnit } from '../../preferences/measurements';
import Emoji from '../../preferences/Emoji';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import { formatMeasurement, getUnitLabel, resolveUnit } from '../../types/units';
import { useHoverState, useInteractionFeedback } from '../../hooks/useInventoryAnimations';
import { thresholdUnits } from '../../types/thresholdUnits';
import type { InventoryItem } from '../../domain/inventory/types';
import type { GroupedRow } from '../../domain/inventory/grouping';
import { InventoryItemCard } from './InventoryItemCard';
import LocationTag from './LocationTag';
import { LowStockBadge } from './LowStockBadge';
import { styles } from './styles';
import { suggestedProductIcon } from './icons';

export interface GroupedRowProps {
  group: GroupedRow;
  expanded: boolean;
  onToggle: () => void;
  locationMap: Record<string, string>;
  locationColorMap?: Record<string, string>;
  removeMode: boolean;
  onRemoveItem?: (itemId: string) => void;
  selectedItemIds?: Set<string>;
  onToggleSelected?: (itemId: string) => void;
  onItemClick?: (item: InventoryItem) => void;
  onUpdateThreshold?: (
    groupId: string,
    threshold: number | null,
    thresholdUnit?: string,
  ) => Promise<void>;
}

export const GroupedRowView: React.FC<GroupedRowProps> = ({
  group,
  expanded,
  onToggle,
  locationMap,
  locationColorMap = {},
  removeMode,
  onRemoveItem,
  selectedItemIds = new Set<string>(),
  onToggleSelected,
  onItemClick,
  onUpdateThreshold,
}) => {
  useLanguage();
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdValue, setThresholdValue] = useState(
    group.threshold === undefined ? '' : String(group.threshold),
  );
  const [thresholdUnit, setThresholdUnit] = useState(
    resolveUnit(group.thresholdUnit ?? group.unit),
  );
  const [thresholdError, setThresholdError] = useState('');
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const reactId = React.useId();
  const childRegionId = `grouped-row-children-${reactId}`;
  const { isHovered, hoverProps } = useHoverState();
  const { feedbackClass, triggerSuccess } = useInteractionFeedback();

  const handleToggle = () => {
    triggerSuccess();
    onToggle();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  const quantityText = group.hasIncompatibleUnits
    ? t('mixed units')
    : formatMeasurement(group.totalQuantity, group.unit);
  const countText = `${group.childCount} ${group.childCount === 1 ? 'item' : 'items'}`;
  const groupIcon = suggestedProductIcon(
    group.name,
    group.category,
    group.childItems.find((item) => item.icon)?.icon,
  );

  return (
    <div style={styles.groupedRowWrapper} data-testid={`grouped-row-wrapper-${group.groupingKey}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={childRegionId}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-label={`${group.name}, ${translateMessage(countText)}, ${quantityText}${
          group.hasLowStock ? ', contains low stock' : ''
        }, ${expanded ? 'expanded' : 'collapsed'}`}
        className={feedbackClass}
        style={{
          ...styles.groupedRow,
          boxShadow: isHovered ? 'var(--inv-shadow-md)' : 'var(--inv-shadow-sm)',
          transform: isHovered ? 'scale(1.01)' : 'scale(1)',
          transition:
            'transform 0.2s var(--inv-spring, cubic-bezier(0.34,1.56,0.64,1)), box-shadow 0.2s ease',
        }}
        data-testid={`grouped-row-${group.groupingKey}`}
        {...hoverProps}
      >
        <span style={styles.groupedRowChevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <div style={styles.groupedRowBody}>
          <div style={styles.groupedRowHeader}>
            <span style={styles.groupedRowName}>
              <Emoji>{groupIcon}</Emoji> {group.name}
            </span>
            {group.hasLowStock && <LowStockBadge />}
            {onUpdateThreshold && (
              <button
                type="button"
                aria-label={t('Edit low-stock threshold for {0}', group.name)}
                style={styles.thresholdButton}
                onClick={(event) => {
                  event.stopPropagation();
                  setThresholdValue(group.threshold === undefined ? '' : String(group.threshold));
                  setThresholdUnit(resolveUnit(group.thresholdUnit ?? group.unit));
                  setThresholdError('');
                  setEditingThreshold((value) => !value);
                }}
              >
                {t('⚙ Threshold')}{' '}
                {group.threshold === undefined
                  ? ''
                  : `: ${formatMeasurement(group.threshold, group.thresholdUnit ?? group.unit)}`}
              </button>
            )}
          </div>
          <div style={styles.groupedRowStats}>
            <span>{quantityText}</span>
            <LocationTag
              ids={group.childItems.map((item) => item.location)}
              names={locationMap}
              colors={locationColorMap}
            />
            <span style={styles.categoryCardDot}>·</span>
            <span>{translateMessage(countText)}</span>
          </div>
        </div>
      </div>

      {editingThreshold && (
        <form
          style={styles.thresholdEditor}
          onSubmit={async (event) => {
            event.preventDefault();
            const threshold = thresholdValue === '' ? null : Number(thresholdValue);
            if (thresholdSaving) return;
            setThresholdSaving(true);
            setThresholdError('');
            try {
              await onUpdateThreshold?.(group.groupId, threshold, thresholdUnit);
              setEditingThreshold(false);
            } catch (err) {
              setThresholdError(err instanceof Error ? err.message : 'Could not save threshold');
            } finally {
              setThresholdSaving(false);
            }
          }}
        >
          <label htmlFor={`threshold-${group.groupId}`}>{t('Low-stock threshold')}</label>
          <MeasurementInput
            unit={thresholdUnit}
            id={`threshold-${group.groupId}`}
            type="number"
            min="0"
            step="any"
            value={thresholdValue}
            onValue={setThresholdValue}
            style={styles.thresholdInput}
          />
          <label htmlFor={`threshold-unit-${group.groupId}`}>{t('Threshold unit')}</label>
          <select
            id={`threshold-unit-${group.groupId}`}
            value={displayUnit(thresholdUnit)}
            onChange={(event) => {
              const unit = resolveUnit(event.target.value);
              setThresholdValue(changeMeasureUnit(thresholdValue, thresholdUnit, unit));
              setThresholdUnit(unit);
            }}
          >
            {thresholdUnits(group.unit, displayUnit(thresholdUnit)).map((unit) => (
              <option key={unit} value={unit}>
                {getUnitLabel(unit, 1)}
              </option>
            ))}
          </select>
          {thresholdError && <span role="alert">{translateMessage(thresholdError)}</span>}
          <button type="submit" disabled={thresholdSaving} style={styles.thresholdSaveButton}>
            {t('Save')}{' '}
          </button>
          <button
            type="button"
            onClick={() => setEditingThreshold(false)}
            style={styles.thresholdCancelButton}
          >
            {t('Cancel')}{' '}
          </button>
        </form>
      )}

      <div id={childRegionId} role="region" aria-label={t('{0} items', group.name)}>
        {expanded && (
          <div style={styles.groupedChildren}>
            {group.childItems.map((item) => (
              <div key={item.itemId} style={styles.groupedChildRow}>
                <span style={styles.groupedChildConnector} aria-hidden="true" />
                <div style={styles.groupedChildCard}>
                  <InventoryItemCard
                    item={item}
                    locationName={locationMap[item.location] ?? item.location}
                    locationColor={locationColorMap[item.location]}
                    removeMode={removeMode}
                    onRemove={onRemoveItem}
                    selected={selectedItemIds.has(item.itemId)}
                    onToggleSelected={onToggleSelected}
                    onClick={() => onItemClick?.(item)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
