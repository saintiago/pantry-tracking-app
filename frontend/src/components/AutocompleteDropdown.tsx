import React, { useEffect, useRef } from 'react';

export interface InventoryItem {
  itemId: string;
  name: string;
  category: string;
  brand?: string;
  barcode?: string;
}

export interface AutocompleteDropdownProps {
  isVisible: boolean;
  items?: InventoryItem[];
  values?: string[];
  focusedIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  onFocusChange: (index: number) => void;
  inputId: string;
  dropdownId: string;
  renderItem?: (item: InventoryItem) => React.ReactNode;
  renderValue?: (value: string) => React.ReactNode;
  ariaLabel?: string;
}

const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  isVisible,
  items,
  values,
  focusedIndex,
  onSelect,
  onClose,
  onFocusChange,
  inputId,
  dropdownId,
  renderItem,
  renderValue,
  ariaLabel,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const displayItems = items || [];
  const displayValues = values || [];
  const totalCount = displayItems.length || displayValues.length;
  const maxDisplay = Math.min(totalCount, 10);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < itemRefs.current.length) {
      const element = itemRefs.current[focusedIndex];
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [focusedIndex]);

  // Handle click outside
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inputElement = document.getElementById(inputId);
      
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputElement &&
        !inputElement.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onClose, inputId]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const inputElement = document.getElementById(inputId);
      if (document.activeElement !== inputElement) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (focusedIndex < maxDisplay - 1) {
            onFocusChange(focusedIndex + 1);
          } else {
            onFocusChange(0); // Wrap to first
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (focusedIndex > 0) {
            onFocusChange(focusedIndex - 1);
          } else {
            onFocusChange(maxDisplay - 1); // Wrap to last
          }
          break;

        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Tab: previous item with wrapping
            if (focusedIndex > 0) {
              onFocusChange(focusedIndex - 1);
            } else {
              onFocusChange(maxDisplay - 1);
            }
          } else {
            // Tab: next item with wrapping
            if (focusedIndex < maxDisplay - 1) {
              onFocusChange(focusedIndex + 1);
            } else {
              onFocusChange(0);
            }
          }
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < maxDisplay) {
            onSelect(focusedIndex);
          }
          break;

        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, focusedIndex, maxDisplay, onFocusChange, onSelect, onClose, inputId]);

  if (!isVisible || maxDisplay === 0) {
    return null;
  }

  const getItemId = (index: number) => `${dropdownId}-item-${index}`;

  return (
    <div
      ref={dropdownRef}
      id={dropdownId}
      role="listbox"
      aria-label={ariaLabel || 'Autocomplete suggestions'}
      style={styles.dropdown}
      data-testid="autocomplete-dropdown"
    >
      {displayItems.length > 0 &&
        displayItems.slice(0, 10).map((item, index) => (
          <div
            key={item.itemId}
            ref={(el) => (itemRefs.current[index] = el)}
            id={getItemId(index)}
            role="option"
            aria-selected={index === focusedIndex}
            onClick={() => onSelect(index)}
            onMouseEnter={() => onFocusChange(index)}
            style={{
              ...styles.dropdownItem,
              ...(index === focusedIndex ? styles.dropdownItemFocused : {}),
            }}
            data-testid={`dropdown-item-${index}`}
          >
            {renderItem ? renderItem(item) : <span>{item.name}</span>}
          </div>
        ))}

      {displayValues.length > 0 &&
        displayValues.slice(0, 10).map((value, index) => (
          <div
            key={value}
            ref={(el) => (itemRefs.current[index] = el)}
            id={getItemId(index)}
            role="option"
            aria-selected={index === focusedIndex}
            onClick={() => onSelect(index)}
            onMouseEnter={() => onFocusChange(index)}
            style={{
              ...styles.dropdownItem,
              ...(index === focusedIndex ? styles.dropdownItemFocused : {}),
            }}
            data-testid={`dropdown-value-${index}`}
          >
            {renderValue ? renderValue(value) : <span>{value}</span>}
          </div>
        ))}
    </div>
  );
};

export default AutocompleteDropdown;

const styles: Record<string, React.CSSProperties> = {
  dropdown: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    maxHeight: 200,
    overflowY: 'auto',
    zIndex: 1000,
    width: '100%',
    marginTop: 4,
  },
  dropdownItem: {
    padding: '0.5rem 0.75rem',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
  },
  dropdownItemFocused: {
    backgroundColor: '#f3f4f6',
  },
};
