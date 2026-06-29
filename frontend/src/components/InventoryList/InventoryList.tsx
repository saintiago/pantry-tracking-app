import React, { useMemo, useState } from 'react';
import type { StorageLocation } from '../../api/locations/locations';
import { getUnitLabel, resolveUnit } from '../../types/units';
import { formatQuantity } from '../../utils/quantity';
import { useHoverState, useInteractionFeedback } from '../../hooks/useInventoryAnimations';
import Tooltip from '../Tooltip/Tooltip';

export interface InventoryItem {
  itemId: string;
  name: string;
  category: string;
  expirationDate: string;
  location: string; // locationId
  quantity: number;
  unit: string;
  isLowStock: boolean;
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureUrl?: string;
  threshold?: number;
  createdAt: string;
  updatedAt: string;
}

/* ── CategorySummary type and groupItemsByCategory ──────────────── */

export interface CategorySummary {
  category: string;
  itemCount: number;
  totalQuantity: number;
  quantityByUnit: Record<string, number>;
  lowStockCount: number;
}

export function formatQuantityByUnit(quantityByUnit: Record<string, number>): string {
  const entries = Object.entries(quantityByUnit);
  if (entries.length === 1) {
    const [unit, qty] = entries[0];
    return `${formatQuantity(qty)} ${getUnitLabel(unit, qty)}`;
  }
  return 'mixed units';
}

export function groupItemsByCategory(items: InventoryItem[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>();

  for (const item of items) {
    const existing = map.get(item.category);
    if (existing) {
      existing.itemCount += 1;
      existing.totalQuantity += item.quantity;
      existing.quantityByUnit[item.unit] =
        (existing.quantityByUnit[item.unit] ?? 0) + item.quantity;
      if (item.isLowStock) existing.lowStockCount += 1;
    } else {
      map.set(item.category, {
        category: item.category,
        itemCount: 1,
        totalQuantity: item.quantity,
        quantityByUnit: { [item.unit]: item.quantity },
        lowStockCount: item.isLowStock ? 1 : 0,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category));
}

/* ── GroupedRow type and groupItemsByGroupingKey ────────────────── */

/**
 * A client-side-only parent row in the category view representing all items
 * that share a Grouping_Key (name + category + unit). Never persisted or sent
 * to any API; derived purely from the provided InventoryItem list.
 */
export interface GroupedRow {
  groupingKey: string; // canonical composite key
  name: string; // display name (first child's original name)
  unit: string; // canonical unit key
  category: string; // display category (first child's original category)
  childItems: InventoryItem[]; // sorted by expirationDate, then createdAt, then itemId
  totalQuantity: number;
  childCount: number;
  hasLowStock: boolean;
}

/**
 * Normalizes a name for grouping: trims leading/trailing whitespace, collapses
 * internal whitespace runs to a single space, and lowercases.
 */
export function normalizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Normalizes a category for grouping: trims and lowercases so case-only
 * differences group together.
 */
function normalizeGroupCategory(category: string): string {
  return category.trim().toLowerCase();
}

/**
 * Groups items into Grouped_Rows keyed by (normalized name, normalized
 * category, canonical unit key). Within each group, child items are sorted by
 * expirationDate asc, then createdAt asc, then itemId asc. Groups are ordered
 * by normalized name asc, tie-broken by canonical unit key asc.
 *
 * Pure UI construct: no database records are created or modified.
 */
export function groupItemsByGroupingKey(items: InventoryItem[]): GroupedRow[] {
  const map = new Map<string, GroupedRow>();

  for (const item of items) {
    const canonicalUnit = resolveUnit(item.unit);
    const groupingKey = `${normalizeGroupName(item.name)}|${normalizeGroupCategory(
      item.category,
    )}|${canonicalUnit}`;

    const existing = map.get(groupingKey);
    if (existing) {
      existing.childItems.push(item);
      existing.totalQuantity += item.quantity;
      existing.childCount += 1;
      if (item.isLowStock) existing.hasLowStock = true;
    } else {
      map.set(groupingKey, {
        groupingKey,
        name: item.name,
        unit: canonicalUnit,
        category: item.category,
        childItems: [item],
        totalQuantity: item.quantity,
        childCount: 1,
        hasLowStock: item.isLowStock,
      });
    }
  }

  const groups = Array.from(map.values());

  // Sort child items within each group: expirationDate asc, createdAt asc, itemId asc.
  for (const group of groups) {
    group.childItems.sort((a, b) => {
      if (a.expirationDate !== b.expirationDate) {
        return a.expirationDate < b.expirationDate ? -1 : 1;
      }
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? -1 : 1;
      }
      if (a.itemId !== b.itemId) {
        return a.itemId < b.itemId ? -1 : 1;
      }
      return 0;
    });
  }

  // Order groups by normalized name asc, tie-broken by canonical unit key asc.
  groups.sort((a, b) => {
    const nameCompare = normalizeGroupName(a.name).localeCompare(normalizeGroupName(b.name));
    if (nameCompare !== 0) return nameCompare;
    return a.unit.localeCompare(b.unit);
  });

  return groups;
}

/* ── Sub-components ─────────────────────────────────────────────── */

export const LowStockBadge: React.FC = () => (
  <span style={styles.lowStockBadge} aria-label="Low stock">
    Low Stock
  </span>
);

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
  if (!visible) return null;
  return (
    <div style={styles.notification} role="alert" className="inv-fade-slide-in">
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={styles.notificationClose}
        aria-label="Dismiss notification"
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

export const QuickFilterInput: React.FC<QuickFilterInputProps> = ({ value, onChange }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="Search by name…"
    aria-label="Filter by product name"
    className="inv-input"
    style={styles.filterInput}
  />
);

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
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    aria-label="Filter by category"
    className="inv-select"
    style={styles.filterSelect}
  >
    <option value="All">All Categories</option>
    {categories.map((cat) => (
      <option key={cat} value={cat}>
        {cat}
      </option>
    ))}
  </select>
);

/* ── LocationFilter ─────────────────────────────────────────────── */

interface LocationFilterProps {
  locations: StorageLocation[];
  value: string;
  onChange: (value: string) => void;
}

export const LocationFilter: React.FC<LocationFilterProps> = ({ locations, value, onChange }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    aria-label="Filter by location"
    className="inv-select"
    style={styles.filterSelect}
  >
    <option value="All">All Locations</option>
    {locations.map((loc) => (
      <option key={loc.locationId} value={loc.locationId}>
        {loc.name}
      </option>
    ))}
  </select>
);

/* ── CategoryCard ───────────────────────────────────────────────── */

interface CategoryCardProps {
  summary: CategorySummary;
  onClick: () => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({ summary, onClick }) => {
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
      aria-label={`${summary.category}, ${summary.itemCount} items, ${formatQuantityByUnit(summary.quantityByUnit)}`}
      className={feedbackClass}
      style={{
        ...styles.categoryCard,
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
            aria-label={`${summary.lowStockCount} low stock`}
          >
            ⚠️ {summary.lowStockCount} low stock
          </span>
        )}
      </div>
      <div style={styles.categoryCardStats}>
        <span>{summary.itemCount} items</span>
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
      aria-label="Back to categories"
      className={feedbackClass}
      style={{
        ...styles.backButton,
        backgroundColor: isHovered ? 'var(--inv-lavender)' : 'var(--inv-lavender-light)',
        color: isHovered ? '#ffffff' : '#6b50a0',
        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
        transition:
          'transform 0.18s var(--inv-spring, cubic-bezier(0.34,1.56,0.64,1)), background-color 0.15s ease, color 0.15s ease',
      }}
      {...hoverProps}
    >
      ‹ Back
    </button>
  );
};

/* ── InventoryItemCard ──────────────────────────────────────────── */

interface InventoryItemCardProps {
  item: InventoryItem;
  locationName: string;
  removeMode: boolean;
  onRemove?: (itemId: string) => void;
  onClick?: () => void;
}

export const InventoryItemCard: React.FC<InventoryItemCardProps> = ({
  item,
  locationName,
  removeMode,
  onRemove,
  onClick,
}) => {
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
      <div style={styles.thumbnail} aria-label="Item picture">
        {item.pictureUrl ? (
          <img src={item.pictureUrl} alt={item.name} style={styles.thumbnailImg} />
        ) : (
          <span style={styles.thumbnailPlaceholder} aria-hidden="true">
            📦
          </span>
        )}
      </div>

      <div style={styles.cardBody}>
        <div style={styles.cardHeader}>
          <span style={styles.itemName}>{item.name}</span>
          {item.isLowStock && <LowStockBadge />}
        </div>

        <div style={styles.cardMeta}>
          <span style={styles.categoryBadge}>{item.category}</span>
          <span style={styles.locationBadge}>{locationName}</span>
        </div>

        <div style={styles.cardDetails}>
          <span>
            {formatQuantity(item.quantity)} {getUnitLabel(item.unit, item.quantity)}
          </span>
          <span style={styles.expiration}>Exp: {item.expirationDate}</span>
        </div>
      </div>

      {removeMode && onRemove && (
        <Tooltip content={`Remove ${item.name}`}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.itemId);
            }}
            style={{
              ...styles.removeItemButton,
              backgroundColor: isRemoveHovered ? 'var(--inv-primary-bg)' : 'transparent',
              transition: 'background-color 0.15s ease',
            }}
            aria-label={`Remove ${item.name}`}
            {...removeHoverProps}
          >
            ✕
          </button>
        </Tooltip>
      )}
    </div>
  );
};

/* ── GroupedRowView ─────────────────────────────────────────────── */

export interface GroupedRowProps {
  group: GroupedRow;
  expanded: boolean;
  onToggle: () => void;
  locationMap: Record<string, string>;
  removeMode: boolean;
  onRemoveItem?: (itemId: string) => void;
  onItemClick?: (item: InventoryItem) => void;
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
 * Note: the component is named GroupedRowView to avoid colliding with the
 * exported GroupedRow view-model interface defined above.
 */
export const GroupedRowView: React.FC<GroupedRowProps> = ({
  group,
  expanded,
  onToggle,
  locationMap,
  removeMode,
  onRemoveItem,
  onItemClick,
}) => {
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

  const unitLabel = getUnitLabel(group.unit, group.totalQuantity);
  const quantityText = `${formatQuantity(group.totalQuantity)} ${unitLabel}`;
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
        aria-label={`${group.name}, ${countText}, ${quantityText}${
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
            <span style={styles.groupedRowName}>{group.name}</span>
            {group.hasLowStock && <LowStockBadge />}
          </div>
          <div style={styles.groupedRowStats}>
            <span>{quantityText}</span>
            <span style={styles.categoryCardDot}>·</span>
            <span>{countText}</span>
          </div>
        </div>
      </div>

      {/* Child region referenced by aria-controls. Rendered (empty) even when
          collapsed so the aria-controls target id always resolves. */}
      <div id={childRegionId} role="region" aria-label={`${group.name} items`}>
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
  locations: StorageLocation[];
  removeMode: boolean;
  onRemoveItem?: (itemId: string) => void;
  onItemClick?: (item: InventoryItem) => void;
}

const InventoryList: React.FC<InventoryListProps> = ({
  items,
  locations,
  removeMode,
  onRemoveItem,
  onItemClick,
}) => {
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

  const filteredItems = useMemo(() => {
    let result = items;

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
  }, [items, textFilter, locationFilter, showLowStockOnly]);

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
    () => groupItemsByGroupingKey(categoryFilteredItems),
    [categoryFilteredItems],
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
    <section aria-label="Inventory list" style={styles.container}>
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
            aria-label="Show low stock items only"
          >
            ⚠️ Low Stock
          </button>
        </Tooltip>
      </div>

      {/* Category summary view */}
      {viewMode === 'category-summary' && (
        <>
          {categorySummaries.length === 0 ? (
            <p style={styles.emptyText}>No items match the current filters.</p>
          ) : (
            <div style={styles.categoryGrid}>
              {categorySummaries.map((summary) => (
                <CategoryCard
                  key={summary.category}
                  summary={summary}
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
            <p style={styles.emptyText}>No items match the current filters.</p>
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '0.5rem 0',
  },
  filtersRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  filterInput: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1.5px solid var(--inv-border)',
    borderRadius: 'var(--inv-radius-sm)' as unknown as number,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    backgroundColor: 'var(--inv-warm-white)',
    color: 'var(--inv-text)',
  },
  filterSelect: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1.5px solid var(--inv-border)',
    borderRadius: 'var(--inv-radius-sm)' as unknown as number,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    backgroundColor: 'var(--inv-warm-white)',
    color: 'var(--inv-text)',
    appearance: 'none' as const,
    cursor: 'pointer',
  },
  toggleRow: {
    marginBottom: '0.75rem',
  },
  lowStockToggle: {
    minHeight: 44,
    minWidth: 44,
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#b87040',
    backgroundColor: 'var(--inv-amber-light)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#f0c4a0',
    borderRadius: 'var(--inv-radius-full)' as unknown as number,
    cursor: 'pointer',
  },
  lowStockToggleActive: {
    backgroundColor: 'var(--inv-amber)',
    color: '#ffffff',
    borderColor: '#d4905c',
  },
  emptyText: {
    textAlign: 'center' as const,
    color: 'var(--inv-text-muted)',
    padding: '2rem 0',
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem',
    border: '1.5px solid var(--inv-border)',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    backgroundColor: 'var(--inv-warm-white)',
  },
  cardRemoveMode: {
    borderColor: 'var(--inv-primary)',
    backgroundColor: 'var(--inv-primary-bg)',
  },
  thumbnail: {
    width: 48,
    height: 48,
    minWidth: 48,
    borderRadius: 'var(--inv-radius-xs)' as unknown as number,
    backgroundColor: '#f5ede8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  thumbnailPlaceholder: {
    fontSize: '1.25rem',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  itemName: {
    fontWeight: 600,
    fontSize: '1rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    color: 'var(--inv-text)',
  },
  cardMeta: {
    display: 'flex',
    gap: '0.375rem',
    marginBottom: '0.25rem',
    flexWrap: 'wrap' as const,
  },
  categoryBadge: {
    fontSize: '0.75rem',
    padding: '2px 8px',
    borderRadius: 'var(--inv-radius-full)' as unknown as number,
    backgroundColor: 'var(--inv-category-bg)',
    color: 'var(--inv-category-text)',
  },
  locationBadge: {
    fontSize: '0.75rem',
    padding: '2px 8px',
    borderRadius: 'var(--inv-radius-full)' as unknown as number,
    backgroundColor: 'var(--inv-sage-light)',
    color: '#3a7a50',
  },
  cardDetails: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.8125rem',
    color: 'var(--inv-text-muted)',
  },
  expiration: {
    color: 'var(--inv-text-muted)',
  },
  lowStockBadge: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 'var(--inv-radius-full)' as unknown as number,
    backgroundColor: 'var(--inv-primary-bg)',
    color: 'var(--inv-primary-dark)',
    whiteSpace: 'nowrap' as const,
  },
  removeItemButton: {
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.125rem',
    color: 'var(--inv-primary-dark)',
    border: '1px solid var(--inv-primary)',
    borderRadius: 'var(--inv-radius-xs)' as unknown as number,
    cursor: 'pointer',
  },
  notification: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--inv-lavender-light)',
    border: '1px solid #c4b5d4',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    marginBottom: '0.75rem',
  },
  notificationClose: {
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    color: 'var(--inv-lavender)',
  },
  categoryCard: {
    minHeight: 44,
    padding: '0.875rem 1rem',
    border: '1.5px solid var(--inv-border)',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    backgroundColor: 'var(--inv-warm-white)',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  categoryCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  categoryCardName: {
    fontWeight: 600,
    fontSize: '1rem',
    color: 'var(--inv-text)',
  },
  categoryLowStockBadge: {
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 'var(--inv-radius-full)' as unknown as number,
    backgroundColor: 'var(--inv-amber-light)',
    color: '#b87040',
  },
  categoryCardStats: {
    display: 'flex',
    gap: '0.375rem',
    fontSize: '0.875rem',
    color: 'var(--inv-text-muted)',
  },
  categoryCardDot: {
    color: 'var(--inv-border)',
  },
  categoryGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.625rem',
  },
  backButton: {
    minHeight: 44,
    minWidth: 44,
    padding: '0.5rem 1.25rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    boxShadow: 'var(--inv-shadow-sm)',
    cursor: 'pointer',
    marginBottom: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
  },
  groupedRowWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  groupedRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    minHeight: 44,
    padding: '0.875rem 1rem',
    border: '1.5px solid var(--inv-border)',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    backgroundColor: 'var(--inv-warm-white)',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  groupedRowChevron: {
    fontSize: '0.875rem',
    lineHeight: '1.4rem',
    color: 'var(--inv-text-muted)',
    minWidth: 16,
  },
  groupedRowBody: {
    flex: 1,
    minWidth: 0,
  },
  groupedRowHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  groupedRowName: {
    fontWeight: 600,
    fontSize: '1rem',
    color: 'var(--inv-text)',
  },
  groupedRowStats: {
    display: 'flex',
    gap: '0.375rem',
    fontSize: '0.875rem',
    color: 'var(--inv-text-muted)',
  },
  groupedChildren: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    // Indentation (≥ 16px) relative to the parent grouped row, plus a vertical
    // connector line and a distinct background to set child items apart.
    marginLeft: 12,
    paddingLeft: 20,
    paddingTop: '0.5rem',
    paddingBottom: '0.5rem',
    borderLeft: '2px solid var(--inv-border)',
    backgroundColor: 'var(--inv-surface-alt, #f7f2ee)',
    borderBottomLeftRadius: 'var(--inv-radius-md)' as unknown as number,
    borderBottomRightRadius: 'var(--inv-radius-md)' as unknown as number,
  },
  groupedChildRow: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative' as const,
  },
  groupedChildConnector: {
    width: 12,
    minWidth: 12,
    height: 2,
    backgroundColor: 'var(--inv-border)',
    marginRight: 4,
    flexShrink: 0,
  },
  groupedChildCard: {
    flex: 1,
    minWidth: 0,
  },
};
