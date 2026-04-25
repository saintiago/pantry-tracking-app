import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AutocompleteDropdown, { InventoryItem } from './AutocompleteDropdown';

const mockItems: InventoryItem[] = [
  { itemId: '1', name: 'Apple', category: 'Fruit', brand: 'Organic Co', barcode: '123' },
  { itemId: '2', name: 'Banana', category: 'Fruit', brand: 'Fresh Farm' },
  { itemId: '3', name: 'Carrot', category: 'Vegetable', barcode: '456' },
];

const mockValues = ['Category A', 'Category B', 'Category C'];

describe('AutocompleteDropdown', () => {
  const defaultProps = {
    isVisible: true,
    focusedIndex: -1,
    onSelect: jest.fn(),
    onClose: jest.fn(),
    onFocusChange: jest.fn(),
    inputId: 'test-input',
    dropdownId: 'test-dropdown',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visibility', () => {
    it('should not render when isVisible is false', () => {
      render(<AutocompleteDropdown {...defaultProps} isVisible={false} items={mockItems} />);
      expect(screen.queryByTestId('autocomplete-dropdown')).not.toBeInTheDocument();
    });

    it('should render when isVisible is true and has items', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} />);
      expect(screen.getByTestId('autocomplete-dropdown')).toBeInTheDocument();
    });

    it('should not render when isVisible is true but no items or values', () => {
      render(<AutocompleteDropdown {...defaultProps} />);
      expect(screen.queryByTestId('autocomplete-dropdown')).not.toBeInTheDocument();
    });
  });

  describe('Item Rendering', () => {
    it('should render items with default rendering', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} />);
      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
      expect(screen.getByText('Carrot')).toBeInTheDocument();
    });

    it('should render values with default rendering', () => {
      render(<AutocompleteDropdown {...defaultProps} values={mockValues} />);
      expect(screen.getByText('Category A')).toBeInTheDocument();
      expect(screen.getByText('Category B')).toBeInTheDocument();
      expect(screen.getByText('Category C')).toBeInTheDocument();
    });

    it('should use custom renderItem function', () => {
      const renderItem = (item: InventoryItem) => (
        <div>
          <strong>{item.name}</strong> - {item.category}
        </div>
      );
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} renderItem={renderItem} />);
      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Carrot')).toBeInTheDocument();
      // Check that custom rendering is applied
      const items = screen.getAllByRole('option');
      expect(items[0].textContent).toContain('Apple');
      expect(items[0].textContent).toContain('Fruit');
    });

    it('should use custom renderValue function', () => {
      const renderValue = (value: string) => <div>Category: {value}</div>;
      render(
        <AutocompleteDropdown {...defaultProps} values={mockValues} renderValue={renderValue} />,
      );
      expect(screen.getByText('Category: Category A')).toBeInTheDocument();
    });

    it('should limit display to maximum 10 items', () => {
      const manyItems: InventoryItem[] = Array.from({ length: 20 }, (_, i) => ({
        itemId: `${i}`,
        name: `Item ${i}`,
        category: 'Test',
      }));
      render(<AutocompleteDropdown {...defaultProps} items={manyItems} />);
      
      // Should only render first 10
      expect(screen.getByText('Item 0')).toBeInTheDocument();
      expect(screen.getByText('Item 9')).toBeInTheDocument();
      expect(screen.queryByText('Item 10')).not.toBeInTheDocument();
    });
  });

  describe('Mouse Interaction', () => {
    it('should call onSelect when item is clicked', () => {
      const onSelect = jest.fn();
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} onSelect={onSelect} />);
      
      fireEvent.mouseDown(screen.getByText('Banana'));
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it('should call onFocusChange when mouse enters item', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.mouseEnter(screen.getByText('Carrot'));
      expect(onFocusChange).toHaveBeenCalledWith(2);
    });

    it('should apply focused styling to focused item', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} focusedIndex={1} />);
      
      const bananaItem = screen.getByTestId('dropdown-item-1');
      expect(bananaItem).toHaveStyle({ backgroundColor: '#f3f4f6' });
    });
  });

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      // Create and add input element to document
      const input = document.createElement('input');
      input.id = 'test-input';
      document.body.appendChild(input);
      input.focus();
    });

    afterEach(() => {
      const input = document.getElementById('test-input');
      if (input) {
        document.body.removeChild(input);
      }
    });

    it('should move focus down with ArrowDown key', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={0}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'ArrowDown' });
      expect(onFocusChange).toHaveBeenCalledWith(1);
    });

    it('should wrap to first item when ArrowDown at end', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={2}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'ArrowDown' });
      expect(onFocusChange).toHaveBeenCalledWith(0);
    });

    it('should move focus up with ArrowUp key', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={2}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'ArrowUp' });
      expect(onFocusChange).toHaveBeenCalledWith(1);
    });

    it('should wrap to last item when ArrowUp at beginning', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={0}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'ArrowUp' });
      expect(onFocusChange).toHaveBeenCalledWith(2);
    });

    it('should move focus forward with Tab key', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={0}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'Tab' });
      expect(onFocusChange).toHaveBeenCalledWith(1);
    });

    it('should wrap to first item when Tab at end', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={2}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'Tab' });
      expect(onFocusChange).toHaveBeenCalledWith(0);
    });

    it('should move focus backward with Shift+Tab key', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={2}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'Tab', shiftKey: true });
      expect(onFocusChange).toHaveBeenCalledWith(1);
    });

    it('should wrap to last item when Shift+Tab at beginning', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={0}
          onFocusChange={onFocusChange}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'Tab', shiftKey: true });
      expect(onFocusChange).toHaveBeenCalledWith(2);
    });

    it('should select item with Enter key', () => {
      const onSelect = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={1}
          onSelect={onSelect}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it('should select item with Space key', () => {
      const onSelect = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          focusedIndex={1}
          onSelect={onSelect}
        />,
      );
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: ' ' });
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it('should close dropdown with Escape key', () => {
      const onClose = jest.fn();
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} onClose={onClose} />);
      
      fireEvent.keyDown(document.getElementById('test-input')!, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('should not handle keyboard events when input is not focused', () => {
      const onFocusChange = jest.fn();
      render(
        <AutocompleteDropdown
          {...defaultProps}
          items={mockItems}
          onFocusChange={onFocusChange}
        />,
      );
      
      // Blur the input
      document.getElementById('test-input')!.blur();
      
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      expect(onFocusChange).not.toHaveBeenCalled();
    });
  });

  describe('Click Outside Behavior', () => {
    beforeEach(() => {
      const input = document.createElement('input');
      input.id = 'test-input';
      document.body.appendChild(input);
    });

    afterEach(() => {
      const input = document.getElementById('test-input');
      if (input) {
        document.body.removeChild(input);
      }
    });

    it('should close dropdown when clicking outside', () => {
      const onClose = jest.fn();
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} onClose={onClose} />);
      
      fireEvent.mouseDown(document.body);
      expect(onClose).toHaveBeenCalled();
    });

    it('should not close dropdown when clicking inside dropdown', () => {
      const onClose = jest.fn();
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} onClose={onClose} />);
      
      const dropdown = screen.getByTestId('autocomplete-dropdown');
      fireEvent.mouseDown(dropdown);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('should not close dropdown when clicking on input', () => {
      const onClose = jest.fn();
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} onClose={onClose} />);
      
      const input = document.getElementById('test-input')!;
      fireEvent.mouseDown(input);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('ARIA Attributes', () => {
    it('should have proper listbox role', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} />);
      const dropdown = screen.getByRole('listbox');
      expect(dropdown).toBeInTheDocument();
    });

    it('should have aria-label', () => {
      render(
        <AutocompleteDropdown {...defaultProps} items={mockItems} ariaLabel="Product suggestions" />,
      );
      expect(screen.getByLabelText('Product suggestions')).toBeInTheDocument();
    });

    it('should use default aria-label when not provided', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} />);
      expect(screen.getByLabelText('Autocomplete suggestions')).toBeInTheDocument();
    });

    it('should have option role for each item', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} />);
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(3);
    });

    it('should set aria-selected on focused item', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} focusedIndex={1} />);
      const options = screen.getAllByRole('option');
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
      expect(options[0]).toHaveAttribute('aria-selected', 'false');
    });

    it('should have unique IDs for each item', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} />);
      const item0 = screen.getByTestId('dropdown-item-0');
      const item1 = screen.getByTestId('dropdown-item-1');
      expect(item0.id).toBe('test-dropdown-item-0');
      expect(item1.id).toBe('test-dropdown-item-1');
    });
  });

  describe('Focus Management', () => {
    it('should scroll focused item into view', async () => {
      const { rerender } = render(
        <AutocompleteDropdown {...defaultProps} items={mockItems} focusedIndex={0} />,
      );
      
      const item2 = screen.getByTestId('dropdown-item-2');
      const scrollIntoViewMock = jest.fn();
      item2.scrollIntoView = scrollIntoViewMock;
      
      rerender(<AutocompleteDropdown {...defaultProps} items={mockItems} focusedIndex={2} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          block: 'nearest',
          behavior: 'smooth',
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty items array', () => {
      render(<AutocompleteDropdown {...defaultProps} items={[]} />);
      expect(screen.queryByTestId('autocomplete-dropdown')).not.toBeInTheDocument();
    });

    it('should handle empty values array', () => {
      render(<AutocompleteDropdown {...defaultProps} values={[]} />);
      expect(screen.queryByTestId('autocomplete-dropdown')).not.toBeInTheDocument();
    });

    it('should handle focusedIndex of -1', () => {
      render(<AutocompleteDropdown {...defaultProps} items={mockItems} focusedIndex={-1} />);
      const options = screen.getAllByRole('option');
      options.forEach((option) => {
        expect(option).toHaveAttribute('aria-selected', 'false');
      });
    });

    it('should handle items without optional fields', () => {
      const minimalItems: InventoryItem[] = [
        { itemId: '1', name: 'Item 1', category: 'Cat 1' },
        { itemId: '2', name: 'Item 2', category: 'Cat 2' },
      ];
      render(<AutocompleteDropdown {...defaultProps} items={minimalItems} />);
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });
  });
});
