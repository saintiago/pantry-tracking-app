import { QuickFilterInput, LocationFilter, CategorySelector } from './InventoryFilters';
export { QuickFilterInput, LocationFilter, CategorySelector } from './InventoryFilters';
import Emoji from '../../preferences/Emoji';
import Tooltip from '../Tooltip/Tooltip';
export { InventoryItemCard } from './InventoryItemCard';
export { LowStockBadge } from './LowStockBadge';
import { GroupedRowView } from './GroupedRowView';
export { GroupedRowView } from './GroupedRowView';
export type { GroupedRowProps } from './GroupedRowView';
import LocationTag from './LocationTag';
import { styles } from './styles';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import { departmentFor, departmentColor } from './departments';
import React, { useMemo, useState } from 'react';
import type { StorageLocation } from '../../api/locations/locations';
import { formatMeasurement } from '../../types/units';
import { useHoverState, useInteractionFeedback } from '../../hooks/useInventoryAnimations';
import { suggestedCategoryIcon } from './icons';

import type { InventoryItem, InventoryGroup } from '../../domain/inventory/types';
import {
  groupItemsByCategory,
  groupItemsByGroupingKey,
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
    return formatMeasurement(qty, unit);
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

/* ── CategoryCard ───────────────────────────────────────────────── */

interface CategoryCardProps {
  summary: CategorySummary;
  onClick: () => void;
  locationIds?: string[];
  locationMap?: Record<string, string>;
  locationColorMap?: Record<string, string>;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  summary,
  onClick,
  locationIds = [],
  locationMap = {},
  locationColorMap = {},
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
        <span aria-hidden="true">
          <Emoji>{suggestedCategoryIcon(summary.category)}</Emoji>
        </span>
        {summary.lowStockCount > 0 && (
          <span
            style={styles.categoryLowStockBadge}
            aria-label={t('{0} low stock', summary.lowStockCount)}
          >
            <Emoji>⚠️</Emoji> {summary.lowStockCount} {t('low stock')}{' '}
          </span>
        )}
      </div>
      <div style={styles.categoryCardStats}>
        <LocationTag ids={locationIds} names={locationMap} colors={locationColorMap} />
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

/* ── InventoryList (main component) ─────────────────────────────── */

export interface InventoryListProps {
  items: InventoryItem[];
  groups?: InventoryGroup[];
  locations: StorageLocation[];
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

const InventoryList: React.FC<InventoryListProps> = ({
  items,
  groups = [],
  locations,
  removeMode,
  onRemoveItem,
  selectedItemIds,
  onToggleSelected,
  onItemClick,
  onUpdateThreshold,
}) => {
  useLanguage();
  const [textFilter, setTextFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [showExpiringSoonOnly, setShowExpiringSoonOnly] = useState(false);
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

  const locationColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    locations.forEach((location, index) => {
      map[location.locationId] =
        location.color ?? ['#E3F0D5', '#E1F1FA', '#FFF2CE', '#F8DEDC'][index % 4];
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

    if (showExpiringSoonOnly) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const limit = today + 14 * 24 * 60 * 60 * 1000;
      result = result.filter((item) => {
        if (!item.expirationDate) return false;
        const expiry = new Date(`${item.expirationDate}T00:00:00`).getTime();
        return Number.isFinite(expiry) && expiry >= today && expiry <= limit;
      });
    }

    if (textFilter.trim()) {
      const lower = textFilter.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(lower));
    }

    if (locationFilter !== 'All') {
      result = result.filter((i) => i.location === locationFilter);
    }

    return result;
  }, [effectiveItems, textFilter, locationFilter, showLowStockOnly, showExpiringSoonOnly]);

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
    setCategoryFilter(category);
    setViewMode('item-list');
  };

  const handleBackClick = () => {
    setSelectedCategory(null);
    setCategoryFilter('All');
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
            onChange={(value) => {
              setCategoryFilter(value);
              setSelectedCategory(value === 'All' ? null : value);
            }}
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
        <Tooltip content="Show items expiring in the next two weeks">
          <button
            onClick={() => {
              setShowExpiringSoonOnly((prev) => !prev);
              triggerToggleSuccess();
            }}
            className={toggleFeedbackClass}
            style={{
              ...styles.expiringToggle,
              ...(showExpiringSoonOnly ? styles.expiringToggleActive : {}),
            }}
            aria-pressed={showExpiringSoonOnly}
            aria-label={t('Show expiring soon items only')}
          >
            {t('Expiring Soon')}{' '}
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
                  locationColorMap={locationColorMap}
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
                  locationColorMap={locationColorMap}
                  removeMode={removeMode}
                  onRemoveItem={onRemoveItem}
                  selectedItemIds={selectedItemIds}
                  onToggleSelected={onToggleSelected}
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
