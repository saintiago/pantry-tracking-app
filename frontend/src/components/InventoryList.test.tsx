import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import InventoryList, {
  InventoryItem,
  LowStockBadge,
  InAppNotification,
} from './InventoryList';
import type { StorageLocation } from '../api/locations';

const locations: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
  { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
];

function makeItem(overrides: Partial<InventoryItem> & { itemId: string; name: string }): InventoryItem {
  return {
    category: 'Dairy',
    expirationDate: '2025-03-01',
    location: 'loc-1',
    quantity: 5,
    unit: 'pcs',
    isLowStock: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const sampleItems: InventoryItem[] = [
  makeItem({ itemId: '1', name: 'Milk', category: 'Dairy', location: 'loc-2', quantity: 2, unit: 'liters' }),
  makeItem({ itemId: '2', name: 'Rice', category: 'Grains', location: 'loc-1', quantity: 10, unit: 'kg' }),
  makeItem({ itemId: '3', name: 'Cheese', category: 'Dairy', location: 'loc-2', isLowStock: true, quantity: 1, unit: 'pcs' }),
  makeItem({ itemId: '4', name: 'Bread', category: 'Bakery', location: 'loc-1', isLowStock: true, quantity: 1, unit: 'loaf' }),
];

describe('InventoryList', () => {
  it('renders all items', () => {
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Rice')).toBeInTheDocument();
    expect(screen.getByText('Cheese')).toBeInTheDocument();
    expect(screen.getByText('Bread')).toBeInTheDocument();
  });

  it('shows empty message when no items match', () => {
    render(<InventoryList items={[]} locations={locations} removeMode={false} />);
    expect(screen.getByText('No items match the current filters.')).toBeInTheDocument();
  });

  it('filters by text (case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const input = screen.getByLabelText('Filter by product name');
    await user.type(input, 'mil');

    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
    expect(screen.queryByText('Cheese')).not.toBeInTheDocument();
    expect(screen.queryByText('Bread')).not.toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const select = screen.getByLabelText('Filter by category');
    await user.selectOptions(select, 'Dairy');

    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Cheese')).toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bread')).not.toBeInTheDocument();
  });

  it('filters by location', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const select = screen.getByLabelText('Filter by location');
    await user.selectOptions(select, 'loc-2');

    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Cheese')).toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bread')).not.toBeInTheDocument();
  });

  it('combines all three filters simultaneously', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    // Text filter: "c" matches Cheese and Rice (Rice has no 'c'... actually "Rice" has no 'c')
    // Let's use "ee" which matches Cheese only
    await user.type(screen.getByLabelText('Filter by product name'), 'ee');
    await user.selectOptions(screen.getByLabelText('Filter by category'), 'Dairy');
    await user.selectOptions(screen.getByLabelText('Filter by location'), 'loc-2');

    expect(screen.getByText('Cheese')).toBeInTheDocument();
    expect(screen.queryByText('Milk')).not.toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bread')).not.toBeInTheDocument();
  });

  it('displays LowStockBadge on low-stock items', () => {
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const badges = screen.getAllByLabelText('Low stock');
    expect(badges).toHaveLength(2); // Cheese and Bread
  });

  it('toggles low-stock-only view', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const toggle = screen.getByLabelText('Show low stock items only');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Only low-stock items visible
    expect(screen.getByText('Cheese')).toBeInTheDocument();
    expect(screen.getByText('Bread')).toBeInTheDocument();
    expect(screen.queryByText('Milk')).not.toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();

    // Toggle off
    await user.click(toggle);
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Rice')).toBeInTheDocument();
  });

  it('shows remove button on cards in remove mode', () => {
    const onRemove = jest.fn();
    render(
      <InventoryList
        items={[sampleItems[0]]}
        locations={locations}
        removeMode={true}
        onRemoveItem={onRemove}
      />,
    );

    const removeBtn = screen.getByLabelText('Remove Milk');
    expect(removeBtn).toBeInTheDocument();
  });

  it('calls onRemoveItem when remove button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(
      <InventoryList
        items={[sampleItems[0]]}
        locations={locations}
        removeMode={true}
        onRemoveItem={onRemove}
      />,
    );

    await user.click(screen.getByLabelText('Remove Milk'));
    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('does not show remove buttons when removeMode is false', () => {
    render(
      <InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />,
    );

    expect(screen.queryByLabelText('Remove Milk')).not.toBeInTheDocument();
  });

  it('displays location name badge on item card', () => {
    render(<InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />);
    // "Fridge" appears in both the location filter dropdown and the card badge
    const fridgeElements = screen.getAllByText('Fridge');
    expect(fridgeElements.length).toBeGreaterThanOrEqual(2); // dropdown option + card badge
  });

  it('displays quantity and unit', () => {
    render(<InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />);
    expect(screen.getByText('2 liters')).toBeInTheDocument();
  });

  it('displays expiration date', () => {
    render(<InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />);
    expect(screen.getByText('Exp: 2025-03-01')).toBeInTheDocument();
  });

  it('displays category badge on item card', () => {
    render(<InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />);
    // "Dairy" appears in both the category filter dropdown and the card badge
    const dairyElements = screen.getAllByText('Dairy');
    expect(dairyElements.length).toBeGreaterThanOrEqual(2); // dropdown option + card badge
  });
});

describe('LowStockBadge', () => {
  it('renders with correct label', () => {
    render(<LowStockBadge />);
    expect(screen.getByLabelText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('Low Stock')).toBeInTheDocument();
  });
});

describe('InAppNotification', () => {
  it('renders message when visible', () => {
    render(<InAppNotification message="Cheese is low!" visible={true} onDismiss={jest.fn()} />);
    expect(screen.getByText('Cheese is low!')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    render(<InAppNotification message="Cheese is low!" visible={false} onDismiss={jest.fn()} />);
    expect(screen.queryByText('Cheese is low!')).not.toBeInTheDocument();
  });

  it('calls onDismiss when close button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    render(<InAppNotification message="Cheese is low!" visible={true} onDismiss={onDismiss} />);

    await user.click(screen.getByLabelText('Dismiss notification'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
