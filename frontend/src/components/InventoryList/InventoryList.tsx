import Tooltip from '../Tooltip/Tooltip';
import { InventoryItemCard } from './InventoryItemCard';
export { InventoryItemCard } from './InventoryItemCard';
import { LowStockBadge } from './LowStockBadge';
export { LowStockBadge } from './LowStockBadge';
import LocationTag from './LocationTag';
import { styles } from './styles';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import { departmentFor, departmentColor } from './departments';
import React, { useMemo, useState } from 'react';
import type { StorageLocation } from '../../api/locations/locations';
import { getUnitLabel, resolveUnit } from '../../types/units';
import { formatQuantity } from '../../utils/quantity';
import { useHoverState, useInteractionFeedback } from '../../hooks/useInventoryAnimations';
import { thresholdUnits } from '../../types/thresholdUnits';

import type { InventoryItem, InventoryGroup } from '../../domain/inventory/types';
import {
  groupItemsByCategory,
  groupItemsByGroupingKey,
  type GroupedRow,
  type CategorySummary,
} from '../../domain/inventory/grouping';
export type { InventoryItem, InventoryGroup } from '../../domain/inventory/types';
export {
  groupItemsByCategory,
  groupItemsByGroupingKey,
  normalizeGroupName,
} from '../../domain/inventory/grouping';
export type { GroupedRow, CategorySummary } from '../../domain/inventory/grouping';

export function formatQuantityByUnit(quantityByUnit: Record<string, number>): string {
  const entries = Object.entries(quantityByUnit);
  if (entries.length === 1) {
    const [unit, qty] = entries[0];
    return `${formatQuantity(qty)} ${getUnitLabel(unit, qty)}`;
  }
  return t('mixed units');
}

/* ── Sub-components ─────────────────────────────────────────────── */

export interface InAppNotificationProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
}

export const InAppNotification: React.FC<InAppNotificationProps> = ({
  message,
  visible,
  onDismiss,
}) => {
  useLanguage();
  if (!visible) return null;
  return (
    <div style={styles.notification} role="alert" className="inv-fade-slide-in">
      <span>{translateMessage(message)}</span>
      <button
        onClick={onDismiss}
        style={styles.notificationClose}
        aria-label={t('Dismiss notification')}
      >
        ✕
      </button>
    </div>
  );
};

/* ── QuickFilterInput ───────────────────────────────────────────── */

interface QuickFilterInputProps {
  value: string;
  onChange: (value: string) => void;
}

export const QuickFilterInput: React.FC<QuickFilterInputProps> = ({ value, onChange }) => {
  useLanguage();
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('Search by name…')}
      aria-label={t('Filter by product name')}
      className="inv-input"
      style={styles.filterInput}
    />
  );
};

/* ── CategorySelector ───────────────────────────────────────────── */

interface CategorySelectorProps {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  value,
  onChange,
}) => {
  useLanguage();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('Filter by category')}
      className="inv-select"
      style={styles.filterSelect}
    >
      <option value="All">{t('All Categories')}</option>
      {categories.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
    </select>
  );
};

/* ── LocationFilter ─────────────────────────────────────────────── */

interface LocationFilterProps {
  locations: StorageLocation[];
  value: string;
  onChange: (value: string) => void;
}

export const LocationFilter: React.FC<LocationFilterProps> = ({ locations, value, onChange }) => {
  useLanguage();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('Filter by location')}
      className="inv-select"
      style={styles.filterSelect}
    >
      <option value="All">{t('All Locations')}</option>
      {locations.map((loc) => (
        <option key={loc.locationId} value={loc.locationId}>
          {loc.name}
        </option>
      ))}
    </select>
  );
};

/* ── CategoryCard ───────────────────────────────────────────────── */

interface CategoryCardProps {
  summary: CategorySummary;
  onClick: () => void;
  locationIds?: string[];
  locationMap?: Record<string, string>;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  summary,
  onClick,
  locationIds = [],
  locationMap = {},
}) => {
  useLanguage();
  const itemCount = t(summary.itemCount === 1 ? '{0} item' : '{0} items', summary.itemCount);
  const { isHovered, hoverProps } = useHoverState();
  const { feedbackClass, triggerSuccess } = useInteractionFeedback();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerSuccess();
      onClick();
    }
  };

  const handleClick = () => {
    triggerSuccess();
    onClick();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${summary.category}, ${itemCount}, ${formatQuantityByUnit(summary.quantityByUnit)}`}
      className={feedbackClass}
      style={{
        ...styles.categoryCard,
        backgroundColor: departmentColor(departmentFor(summary.category, summary.category)),
        boxShadow: isHovered ? 'var(--inv-shadow-md)' : 'var(--inv-shadow-sm)',
        transform: isHovered ? 'scale(1.025)' : 'scale(1)',
        transition:
          'transform 0.2s var(--inv-spring, cubic-bezier(0.34,1.56,0.64,1)), box-shadow 0.2s ease',
      }}
      data-testid={`category-card-${summary.category}`}
      {...hoverProps}
    >
      <div style={styles.categoryCardHeader}>
        <span style={styles.categoryCardName}>{summary.category}</span>
        {summary.lowStockCount > 0 && (
          <span
            style={styles.categoryLowStockBadge}
            aria-label={t('{0} low stock', summary.lowStockCount)}
          >
            ⚠️ {summary.lowStockCount} {t('low stock')}{' '}
          </span>
        )}
      </div>
      <div style={styles.categoryCardStats}>
        <LocationTag ids={locationIds} names={locationMap} />
        <span>{itemCount}</span>
        <span style={styles.categoryCardDot}>·</span>
        <span>{formatQuantityByUnit(summary.quantityByUnit)}</span>
      </div>
    </div>
  );
};

/* ── BackButton ─────────────────────────────────────────────────── */

interface BackButtonProps {
  onClick: () => void;
}

export const BackButton: React.FC<BackButtonProps> = ({ onClick }) => {
  useLanguage();
  const { isHovered, hoverProps } = useHoverState();
  const { feedbackClass, triggerSuccess } = useInteractionFeedback();

  const handleClick = () => {
    triggerSuccess();
    onClick();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <button
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={t('Back to categories')}
      className={feedbackClass}
      style={{
        ...styles.backButton,
        backgroundColor: isHovered ? 'var(--inv-lavender)' : 'var(--inv-lavender-light)',
        color: isHovered ? 'var(--color-surface)' : 'var(--color-action)',
        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
        transition:
          'transform 0.18s var(--inv-spring, cubic-bezier(0.34,1.56,0.64,1)), background-color 0.15s ease, color 0.15s ease',
      }}
      {...hoverProps}
    >
      {t('‹ Back')}{' '}
    </button>
  );
};

/* ── InventoryItemCard ──────────────────────────────────────────── */

/* ── GroupedRowView ─────────────────────────────────────────────── */

export interface GroupedRowProps {
  group: GroupedRow;
  expanded: boolean;
  onToggle: () => void;
  locationMap: Record<string, string>;
  removeMode: boolean;
  onRemoveItem?: (itemId: string) => void;
  onItemClick?: (item: InventoryItem) => void;
  onUpdateThreshold?: (
    groupId: string,
    threshold: number | null,
    thresholdUnit?: string,
  ) => Promise<void>;
}

/**
 * Renders a single Grouped_Row: a collapsible parent row summarizing all child
 * items that share a Grouping_Key. The parent row behaves as a toggle button
 * (pointer + Enter/Space keyboard activation) and exposes its expanded state
 * and child association to assistive technologies via aria-expanded /
 * aria-controls. Child items are rendered (reusing InventoryItemCard) only
 * while expanded, inside the aria-controls region, with indentation, connector
 * lines, and a distinct background to set them apart from top-level rows.
 *
 */
export const GroupedRowView: React.FC<GroupedRowProps> = ({
  group,
  expanded,
  onToggle,
  locationMap,
  removeMode,
  onRemoveItem,
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
    // Enter/Space toggle identically to pointer activation; preventDefault on
    // Space suppresses the default page-scroll behavior.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  const quantityText = group.hasIncompatibleUnits
    ? t('mixed units')
    : `${formatQuantity(group.totalQuantity)} ${getUnitLabel(group.unit, group.totalQuantity)}`;
  const countText = `${group.childCount} ${group.childCount === 1 ? 'item' : 'items'}`;

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
              {group.childItems.find((item) => item.icon)?.icon} {group.name}
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
                  : `: ${group.threshold} ${getUnitLabel(group.thresholdUnit ?? group.unit, group.threshold)}`}
              </button>
            )}
          </div>
          <div style={styles.groupedRowStats}>
            <span>{quantityText}</span>
            <LocationTag ids={group.childItems.map((item) => item.location)} names={locationMap} />
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
          <input
            id={`threshold-${group.groupId}`}
            type="number"
            min="0"
            step="any"
            value={thresholdValue}
            onChange={(event) => setThresholdValue(event.target.value)}
            style={styles.thresholdInput}
          />
          <label htmlFor={`threshold-unit-${group.groupId}`}>{t('Threshold unit')}</label>
          <select
            id={`threshold-unit-${group.groupId}`}
            value={thresholdUnit}
            onChange={(event) => setThresholdUnit(resolveUnit(event.target.value))}
          >
            {thresholdUnits(group.unit).map((unit) => (
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

      {/* Child region referenced by aria-controls. Rendered (empty) even when
          collapsed so the aria-controls target id always resolves. */}
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
                    removeMode={removeMode}
                    onRemove={onRemoveItem}
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

/* ── InventoryList (main component) ─────────────────────────────── */

export interface InventoryListProps {
  items: InventoryItem[];
  groups?: InventoryGroup[];
  locations: StorageLocation[];
  removeMode: boolean;
  onRemoveItem?: (itemId: string) => void;
  onItemClick?: (item: InventoryItem) => void;
  onUpdateThreshold?: (
    groupId: string,
    threshold: number | null,
    thresholdUnit?: string,
  ) => Promise<void>;
}

const InventoryList: React.FC<InventoryListProps> = ({
  items,
  groups = [],
  locations,
  removeMode,
  onRemoveItem,
  onItemClick,
  onUpdateThreshold,
}) => {
  useLanguage();
  const [textFilter, setTextFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'category-summary' | 'item-list'>('category-summary');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // Expand/collapse state for grouped rows, keyed by groupingKey. A key present
  // in the set means that group is expanded; absent means collapsed (the
  // default). Because the set is keyed by groupingKey, expansion state is
  // naturally preserved across recomputation when a key remains present, and
  // stale keys (groups that disappear) simply become irrelevant.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { feedbackClass: toggleFeedbackClass, triggerSuccess: triggerToggleSuccess } =
    useInteractionFeedback();

  const categories = useMemo(() => {
    const unique = Array.from(new Set(items.map((i) => i.category)));
    unique.sort();
    return unique;
  }, [items]);

  const locationMap = useMemo(() => {
    const map: Record<string, string> = {};
    locations.forEach((l) => {
      map[l.locationId] = l.name;
    });
    return map;
  }, [locations]);

  const groupsById = useMemo(
    () => new Map(groups.map((group) => [group.groupId, group])),
    [groups],
  );

  const effectiveItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        isLowStock: item.groupId
          ? (groupsById.get(item.groupId)?.isLowStock ?? false)
          : item.isLowStock,
      })),
    [items, groupsById],
  );

  const filteredItems = useMemo(() => {
    let result = effectiveItems;

    if (showLowStockOnly) {
      result = result.filter((i) => i.isLowStock);
    }

    if (textFilter.trim()) {
      const lower = textFilter.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(lower));
    }

    if (locationFilter !== 'All') {
      result = result.filter((i) => i.location === locationFilter);
    }

    return result;
  }, [effectiveItems, textFilter, locationFilter, showLowStockOnly]);

  // Auto-reset to category-summary if selectedCategory no longer exists in filtered items
  React.useEffect(() => {
    if (viewMode === 'item-list' && selectedCategory !== null) {
      const stillExists = filteredItems.some((i) => i.category === selectedCategory);
      if (!stillExists) {
        setViewMode('category-summary');
        setSelectedCategory(null);
      }
    }
  }, [filteredItems, viewMode, selectedCategory]);

  const categorySummaries = useMemo(() => groupItemsByCategory(filteredItems), [filteredItems]);

  const categoryFilteredItems = useMemo(() => {
    if (viewMode !== 'item-list' || selectedCategory === null) return filteredItems;
    return filteredItems.filter((i) => i.category === selectedCategory);
  }, [filteredItems, viewMode, selectedCategory]);

  // Recompute grouped rows whenever the displayed (post-filter) items change so
  // every displayed item stays represented in exactly one group.
  const groupedRows = useMemo(
    () => groupItemsByGroupingKey(categoryFilteredItems, groups),
    [categoryFilteredItems, groups],
  );

  const handleToggleGroup = (groupingKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupingKey)) {
        next.delete(groupingKey);
      } else {
        next.add(groupingKey);
      }
      return next;
    });
  };

  const handleCategoryCardClick = (category: string) => {
    setSelectedCategory(category);
    setViewMode('item-list');
  };

  const handleBackClick = () => {
    setSelectedCategory(null);
    setViewMode('category-summary');
  };

  return (
    <section aria-label={t('Inventory list')} style={styles.container}>
      {/* Filters row */}
      <div style={styles.filtersRow}>
        <QuickFilterInput value={textFilter} onChange={setTextFilter} />
        {viewMode === 'item-list' && (
          <CategorySelector
            categories={categories}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
        )}
        <LocationFilter locations={locations} value={locationFilter} onChange={setLocationFilter} />
      </div>

      {/* Low-stock toggle */}
      <div style={styles.toggleRow}>
        <Tooltip content="Show low-stock items only">
          <button
            onClick={() => {
              setShowLowStockOnly((prev) => !prev);
              triggerToggleSuccess();
            }}
            className={toggleFeedbackClass}
            style={{
              ...styles.lowStockToggle,
              ...(showLowStockOnly ? styles.lowStockToggleActive : {}),
            }}
            aria-pressed={showLowStockOnly}
            aria-label={t('Show low stock items only')}
          >
            {t('⚠️ Low Stock')}{' '}
          </button>
        </Tooltip>
      </div>

      {/* Category summary view */}
      {viewMode === 'category-summary' && (
        <>
          {categorySummaries.length === 0 ? (
            <p style={styles.emptyText}>{t('No items match the current filters.')}</p>
          ) : (
            <div style={styles.categoryGrid}>
              {categorySummaries.map((summary) => (
                <CategoryCard
                  key={summary.category}
                  summary={summary}
                  locationIds={filteredItems
                    .filter((item) => item.category === summary.category)
                    .map((item) => item.location)}
                  locationMap={locationMap}
                  onClick={() => handleCategoryCardClick(summary.category)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Item list view */}
      {viewMode === 'item-list' && (
        <>
          <BackButton onClick={handleBackClick} />
          {groupedRows.length === 0 ? (
            <p style={styles.emptyText}>{t('No items match the current filters.')}</p>
          ) : (
            <div style={styles.itemsList}>
              {groupedRows.map((group) => (
                <GroupedRowView
                  key={group.groupingKey}
                  group={group}
                  expanded={expandedGroups.has(group.groupingKey)}
                  onToggle={() => handleToggleGroup(group.groupingKey)}
                  locationMap={locationMap}
                  removeMode={removeMode}
                  onRemoveItem={onRemoveItem}
                  onItemClick={onItemClick}
                  onUpdateThreshold={onUpdateThreshold}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default InventoryList;

/* ── Styles ─────────────────────────────────────────────────────── */
