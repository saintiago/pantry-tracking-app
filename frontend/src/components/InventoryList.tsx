import React, { useMemo, useState } from 'react';
import type { StorageLocation } from '../api/locations';

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
  lowStockCount: number;
}

export function groupItemsByCategory(items: InventoryItem[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>();

  for (const item of items) {
    const existing = map.get(item.category);
    if (existing) {
      existing.itemCount += 1;
      existing.totalQuantity += item.quantity;
      if (item.isLowStock) existing.lowStockCount += 1;
    } else {
      map.set(item.category, {
        category: item.category,
        itemCount: 1,
        totalQuantity: item.quantity,
        lowStockCount: item.isLowStock ? 1 : 0,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category));
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
    <div style={styles.notification} role="alert">
      <span>{message}</span>
      <button onClick={onDismiss} style={styles.notificationClose} aria-label="Dismiss notification">
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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`${summary.category}, ${summary.itemCount} items, ${summary.totalQuantity} total`}
      style={styles.categoryCard}
      data-testid={`category-card-${summary.category}`}
    >
      <div style={styles.categoryCardHeader}>
        <span style={styles.categoryCardName}>{summary.category}</span>
        {summary.lowStockCount > 0 && (
          <span style={styles.categoryLowStockBadge} aria-label={`${summary.lowStockCount} low stock`}>
            ⚠️ {summary.lowStockCount} low stock
          </span>
        )}
      </div>
      <div style={styles.categoryCardStats}>
        <span>{summary.itemCount} items</span>
        <span style={styles.categoryCardDot}>·</span>
        <span>{summary.totalQuantity} total</span>
      </div>
    </div>
  );
};

/* ── BackButton ─────────────────────────────────────────────────── */

interface BackButtonProps {
  onClick: () => void;
}

export const BackButton: React.FC<BackButtonProps> = ({ onClick }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <button
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label="Back to categories"
      style={styles.backButton}
    >
      ← Back to categories
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

  return (
  <div
    style={{
      ...styles.card,
      ...(removeMode ? styles.cardRemoveMode : {}),
      ...(isClickable ? { cursor: 'pointer' } : {}),
    }}
    data-testid={`item-card-${item.itemId}`}
    onClick={isClickable ? onClick : undefined}
    onKeyDown={
      isClickable
        ? (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    role={isClickable ? 'button' : undefined}
    tabIndex={isClickable ? 0 : undefined}
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
          {item.quantity} {item.unit}
        </span>
        <span style={styles.expiration}>Exp: {item.expirationDate}</span>
      </div>
    </div>

    {removeMode && onRemove && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.itemId);
        }}
        style={styles.removeItemButton}
        aria-label={`Remove ${item.name}`}
      >
        ✕
      </button>
    )}
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

  const categorySummaries = useMemo(
    () => groupItemsByCategory(filteredItems),
    [filteredItems],
  );

  const categoryFilteredItems = useMemo(() => {
    if (viewMode !== 'item-list' || selectedCategory === null) return filteredItems;
    return filteredItems.filter((i) => i.category === selectedCategory);
  }, [filteredItems, viewMode, selectedCategory]);

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
          <CategorySelector categories={categories} value={categoryFilter} onChange={setCategoryFilter} />
        )}
        <LocationFilter locations={locations} value={locationFilter} onChange={setLocationFilter} />
      </div>

      {/* Low-stock toggle */}
      <div style={styles.toggleRow}>
        <button
          onClick={() => setShowLowStockOnly((prev) => !prev)}
          style={{
            ...styles.lowStockToggle,
            ...(showLowStockOnly ? styles.lowStockToggleActive : {}),
          }}
          aria-pressed={showLowStockOnly}
          aria-label="Show low stock items only"
        >
          ⚠️ Low Stock
        </button>
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
          {categoryFilteredItems.length === 0 ? (
            <p style={styles.emptyText}>No items match the current filters.</p>
          ) : (
            <div style={styles.itemsList}>
              {categoryFilteredItems.map((item) => (
                <InventoryItemCard
                  key={item.itemId}
                  item={item}
                  locationName={locationMap[item.location] ?? item.location}
                  removeMode={removeMode}
                  onRemove={onRemoveItem}
                  onClick={() => onItemClick?.(item)}
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
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  filterSelect: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    backgroundColor: '#ffffff',
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
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#fbbf24',
    borderRadius: 20,
    cursor: 'pointer',
  },
  lowStockToggleActive: {
    backgroundColor: '#f59e0b',
    color: '#ffffff',
    borderColor: '#d97706',
  },
  emptyText: {
    textAlign: 'center' as const,
    color: '#6b7280',
    padding: '2rem 0',
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  cardRemoveMode: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  thumbnail: {
    width: 48,
    height: 48,
    minWidth: 48,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
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
    borderRadius: 12,
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
  },
  locationBadge: {
    fontSize: '0.75rem',
    padding: '2px 8px',
    borderRadius: 12,
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  cardDetails: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.8125rem',
    color: '#4b5563',
  },
  expiration: {
    color: '#6b7280',
  },
  lowStockBadge: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    color: '#92400e',
    whiteSpace: 'nowrap' as const,
  },
  removeItemButton: {
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.125rem',
    color: '#dc2626',
    backgroundColor: 'transparent',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    cursor: 'pointer',
  },
  notification: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    backgroundColor: '#fef3c7',
    border: '1px solid #fbbf24',
    borderRadius: 8,
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
    color: '#92400e',
  },
  categoryCard: {
    minHeight: 44,
    padding: '0.875rem 1rem',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    backgroundColor: '#ffffff',
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
  },
  categoryLowStockBadge: {
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  categoryCardStats: {
    display: 'flex',
    gap: '0.375rem',
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  categoryCardDot: {
    color: '#d1d5db',
  },
  categoryGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  backButton: {
    minHeight: 44,
    minWidth: 44,
    padding: '0.5rem 1rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
  },
};
