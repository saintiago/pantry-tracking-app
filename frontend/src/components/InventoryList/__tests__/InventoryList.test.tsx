import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import InventoryList, {
  InventoryItem,
  LowStockBadge,
  InAppNotification,
  formatQuantityByUnit,
  groupItemsByCategory,
} from '../InventoryList';
import type { StorageLocation } from '../../../api/locations';

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
  makeItem({ itemId: '1', name: 'Milk', category: 'Dairy', location: 'loc-2', quantity: 2, unit: 'l' }),
  makeItem({ itemId: '2', name: 'Rice', category: 'Grains', location: 'loc-1', quantity: 10, unit: 'kg' }),
  makeItem({ itemId: '3', name: 'Cheese', category: 'Dairy', location: 'loc-2', isLowStock: true, quantity: 1, unit: 'piece' }),
  makeItem({ itemId: '4', name: 'Bread', category: 'Bakery', location: 'loc-1', isLowStock: true, quantity: 1, unit: 'slice' }),
];

/** Helper: drill into a category from the category-summary view */
async function drillIntoCategory(user: ReturnType<typeof userEvent.setup>, category: string) {
  const card = screen.getByTestId(`category-card-${category}`);
  await user.click(card);
}

describe('InventoryList', () => {
  it('renders category cards by default (not individual items)', () => {
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    // Should show category cards, not individual items
    expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
    expect(screen.getByTestId('category-card-Grains')).toBeInTheDocument();
    expect(screen.getByTestId('category-card-Bakery')).toBeInTheDocument();
    expect(screen.queryByText('Milk')).not.toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
  });

  it('shows empty message when no items match', () => {
    render(<InventoryList items={[]} locations={locations} removeMode={false} />);
    expect(screen.getByText('No items match the current filters.')).toBeInTheDocument();
  });

  it('renders all items after drilling into a category', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await drillIntoCategory(user, 'Dairy');
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Cheese')).toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
  });

  it('filters by text (case-insensitive) in item-list view', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await drillIntoCategory(user, 'Dairy');
    const input = screen.getByLabelText('Filter by product name');
    await user.type(input, 'mil');

    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.queryByText('Cheese')).not.toBeInTheDocument();
  });

  it('filters by location in item-list view', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await drillIntoCategory(user, 'Dairy');
    const select = screen.getByLabelText('Filter by location');
    await user.selectOptions(select, 'loc-2');

    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Cheese')).toBeInTheDocument();
  });

  it('displays LowStockBadge on low-stock items in item-list view', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await drillIntoCategory(user, 'Dairy');
    const badges = screen.getAllByLabelText('Low stock');
    expect(badges).toHaveLength(1); // Only Cheese is low stock in Dairy
  });

  it('toggles low-stock-only view in category-summary', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const toggle = screen.getByLabelText('Show low stock items only');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Only categories with low-stock items visible
    expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
    expect(screen.getByTestId('category-card-Bakery')).toBeInTheDocument();
    expect(screen.queryByTestId('category-card-Grains')).not.toBeInTheDocument();

    // Toggle off
    await user.click(toggle);
    expect(screen.getByTestId('category-card-Grains')).toBeInTheDocument();
  });

  it('shows remove button on cards in remove mode after drilling into category', async () => {
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

    await drillIntoCategory(user, 'Dairy');
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

    await drillIntoCategory(user, 'Dairy');
    await user.click(screen.getByLabelText('Remove Milk'));
    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('does not show remove buttons when removeMode is false', async () => {
    const user = userEvent.setup();
    render(
      <InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />,
    );

    await drillIntoCategory(user, 'Dairy');
    expect(screen.queryByLabelText('Remove Milk')).not.toBeInTheDocument();
  });

  it('displays location name badge on item card', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />);

    await drillIntoCategory(user, 'Dairy');
    // "Fridge" appears in both the location filter dropdown and the card badge
    const fridgeElements = screen.getAllByText('Fridge');
    expect(fridgeElements.length).toBeGreaterThanOrEqual(2); // dropdown option + card badge
  });

  it('displays quantity and unit', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />);

    await drillIntoCategory(user, 'Dairy');
    expect(screen.getByText('2 liters')).toBeInTheDocument();
  });

  it('displays expiration date', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />);

    await drillIntoCategory(user, 'Dairy');
    expect(screen.getByText('Exp: 2025-03-01')).toBeInTheDocument();
  });

  it('displays category badge on item card', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={[sampleItems[0]]} locations={locations} removeMode={false} />);

    await drillIntoCategory(user, 'Dairy');
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

describe('InventoryList — category view interactions', () => {
  it('empty items array shows empty message in category-summary view', () => {
    render(<InventoryList items={[]} locations={locations} removeMode={false} />);
    expect(screen.getByText('No items match the current filters.')).toBeInTheDocument();
  });

  it('keyboard Enter on CategoryCard triggers drill-down', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const card = screen.getByTestId('category-card-Dairy');
    card.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Cheese')).toBeInTheDocument();
  });

  it('keyboard Space on CategoryCard triggers drill-down', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const card = screen.getByTestId('category-card-Dairy');
    card.focus();
    await user.keyboard(' ');

    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('keyboard Enter on BackButton returns to category summary', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await user.click(screen.getByTestId('category-card-Dairy'));
    const backBtn = screen.getByLabelText('Back to categories');
    backBtn.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
    expect(screen.queryByText('Milk')).not.toBeInTheDocument();
  });

  it('keyboard Space on BackButton returns to category summary', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await user.click(screen.getByTestId('category-card-Dairy'));
    const backBtn = screen.getByLabelText('Back to categories');
    backBtn.focus();
    await user.keyboard(' ');

    expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
  });

  it('BackButton has aria-label="Back to categories"', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await user.click(screen.getByTestId('category-card-Dairy'));
    expect(screen.getByLabelText('Back to categories')).toBeInTheDocument();
  });

  it('CategoryCard has role="button" and tabIndex={0}', () => {
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const card = screen.getByTestId('category-card-Dairy');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('CategoryCard has minimum 44x44px touch target via inline styles', () => {
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    const card = screen.getByTestId('category-card-Dairy');
    expect(card).toHaveStyle({ minHeight: '44px' });
  });

  it('BackButton has minimum 44x44px touch target', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await user.click(screen.getByTestId('category-card-Dairy'));
    const backBtn = screen.getByLabelText('Back to categories');
    expect(backBtn).toHaveStyle({ minHeight: '44px' });
  });

  it('remove mode + click category card drills into item list with remove buttons', async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(
      <InventoryList
        items={sampleItems}
        locations={locations}
        removeMode={true}
        onRemoveItem={onRemove}
      />,
    );

    await user.click(screen.getByTestId('category-card-Dairy'));
    expect(screen.getByLabelText('Remove Milk')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove Cheese')).toBeInTheDocument();
  });

  it('filters are preserved when navigating back from item-list to category-summary', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    // Apply text filter first
    await user.type(screen.getByLabelText('Filter by product name'), 'mil');

    // Drill into Dairy (only Milk matches "mil" in Dairy)
    await user.click(screen.getByTestId('category-card-Dairy'));
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.queryByText('Cheese')).not.toBeInTheDocument();

    // Go back
    await user.click(screen.getByLabelText('Back to categories'));

    // Text filter still active — Grains (Rice) and Bakery (Bread) don't match "mil"
    expect(screen.queryByTestId('category-card-Grains')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-card-Bakery')).not.toBeInTheDocument();
    // Dairy still shows because Milk matches
    expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
  });

  it('back button is visible in item-list view and hidden in category-summary view', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    // In category-summary: no back button
    expect(screen.queryByLabelText('Back to categories')).not.toBeInTheDocument();

    // Drill in: back button appears
    await user.click(screen.getByTestId('category-card-Dairy'));
    expect(screen.getByLabelText('Back to categories')).toBeInTheDocument();

    // Go back: back button gone again
    await user.click(screen.getByLabelText('Back to categories'));
    expect(screen.queryByLabelText('Back to categories')).not.toBeInTheDocument();
  });

  it('category filter dropdown is hidden in category-summary view', () => {
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);
    expect(screen.queryByLabelText('Filter by category')).not.toBeInTheDocument();
  });

  it('category filter dropdown is visible in item-list view', async () => {
    const user = userEvent.setup();
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    await user.click(screen.getByTestId('category-card-Dairy'));
    expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
  });

  it('low-stock indicator shown on category card when category has low-stock items', () => {
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    // Dairy has Cheese (isLowStock: true), Bakery has Bread (isLowStock: true)
    const badges = screen.getAllByLabelText(/low stock/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
    // Specifically Dairy card should have a low-stock badge
    const dairyCard = screen.getByTestId('category-card-Dairy');
    expect(dairyCard.querySelector('[aria-label*="low stock"]')).not.toBeNull();
  });

  it('low-stock indicator hidden when category has no low-stock items', () => {
    render(<InventoryList items={sampleItems} locations={locations} removeMode={false} />);

    // Grains has no low-stock items — its card should not have a low-stock badge
    const grainsCard = screen.getByTestId('category-card-Grains');
    expect(grainsCard.querySelector('[aria-label*="low stock"]')).toBeNull();
  });
});

describe('formatQuantityByUnit', () => {
  it('returns quantity with unit when all items share the same unit', () => {
    expect(formatQuantityByUnit({ piece: 7 })).toBe('7 pieces');
  });

  it('returns "mixed units" when multiple units are present', () => {
    expect(formatQuantityByUnit({ g: 500, piece: 3 })).toBe('mixed units');
  });

  it('handles a single unit with zero quantity', () => {
    expect(formatQuantityByUnit({ l: 0 })).toBe('0 liters');
  });
});

describe('groupItemsByCategory – quantityByUnit', () => {
  it('groups quantities by unit within a category', () => {
    const items = [
      makeItem({ itemId: '1', name: 'Milk', category: 'Dairy', quantity: 2, unit: 'l' }),
      makeItem({ itemId: '2', name: 'Cheese', category: 'Dairy', quantity: 3, unit: 'piece' }),
    ];
    const groups = groupItemsByCategory(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].quantityByUnit).toEqual({ l: 2, piece: 3 });
  });

  it('sums quantities for the same unit within a category', () => {
    const items = [
      makeItem({ itemId: '1', name: 'Milk', category: 'Dairy', quantity: 2, unit: 'l' }),
      makeItem({ itemId: '2', name: 'Juice', category: 'Dairy', quantity: 5, unit: 'l' }),
    ];
    const groups = groupItemsByCategory(items);
    expect(groups[0].quantityByUnit).toEqual({ l: 7 });
  });

  it('keeps separate quantityByUnit per category', () => {
    const items = [
      makeItem({ itemId: '1', name: 'Milk', category: 'Dairy', quantity: 2, unit: 'l' }),
      makeItem({ itemId: '2', name: 'Rice', category: 'Grains', quantity: 1, unit: 'kg' }),
    ];
    const groups = groupItemsByCategory(items);
    const dairy = groups.find((g) => g.category === 'Dairy');
    const grains = groups.find((g) => g.category === 'Grains');
    expect(dairy?.quantityByUnit).toEqual({ l: 2 });
    expect(grains?.quantityByUnit).toEqual({ kg: 1 });
  });
});

describe('CategoryCard – quantity display', () => {
  it('shows formatted quantity when all items share the same unit', () => {
    const items = [
      makeItem({ itemId: '1', name: 'Milk', category: 'Dairy', quantity: 3, unit: 'l' }),
      makeItem({ itemId: '2', name: 'Juice', category: 'Dairy', quantity: 4, unit: 'l' }),
    ];
    render(<InventoryList items={items} locations={locations} removeMode={false} />);
    expect(screen.getByText('7 liters')).toBeInTheDocument();
  });

  it('shows "mixed units" when items have different units', () => {
    const items = [
      makeItem({ itemId: '1', name: 'Milk', category: 'Dairy', quantity: 2, unit: 'l' }),
      makeItem({ itemId: '2', name: 'Cheese', category: 'Dairy', quantity: 3, unit: 'piece' }),
    ];
    render(<InventoryList items={items} locations={locations} removeMode={false} />);
    expect(screen.getByText('mixed units')).toBeInTheDocument();
  });
});
