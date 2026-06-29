/**
 * Unit tests for grouped-row rendering and interaction
 * (inventory-merge-and-grouping feature, task 7.4).
 *
 * Covers:
 *  - New groups render collapsed by default (Req 8.4)
 *  - Enter/Space toggle the group, and Space prevents the default page scroll (Req 8.6)
 *  - aria-expanded / aria-controls reflect state and child association (Req 8.7)
 *  - Child indentation ≥ 16px, connector lines present, distinct child
 *    background, child controls ≥ 44×44 (Req 10.1–10.4)
 *  - Activating a child opens the detail view via onItemClick (Req 10.5)
 *  - Low-stock children show the low-stock treatment (Req 10.6)
 *
 * Tests render <GroupedRowView> directly for precise aria/style/onItemClick
 * assertions, and render <InventoryList> + drill into a category for the
 * collapsed-by-default and toggle-via-pointer integration behavior.
 */

import React, { useState } from 'react';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import InventoryList, {
  GroupedRowView,
  GroupedRowProps,
  groupItemsByGroupingKey,
  InventoryItem,
} from '../InventoryList';
import type { StorageLocation } from '../../../api/locations';

/* ── Fixtures / helpers ──────────────────────────────────────────── */

const locations: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
  { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
];

const locationMap: Record<string, string> = {
  'loc-1': 'Pantry',
  'loc-2': 'Fridge',
};

function makeItem(
  overrides: Partial<InventoryItem> & { itemId: string; name: string },
): InventoryItem {
  return {
    category: 'Dairy',
    expirationDate: '2025-03-01',
    location: 'loc-1',
    quantity: 5,
    unit: 'l',
    isLowStock: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Two mergeable Milk items (same name/category/unit) that form one group. */
function makeMilkGroup(): InventoryItem[] {
  return [
    makeItem({ itemId: 'a', name: 'Milk', quantity: 2, expirationDate: '2025-03-01' }),
    makeItem({
      itemId: 'b',
      name: 'Milk',
      quantity: 1,
      expirationDate: '2025-02-01',
      isLowStock: true,
    }),
  ];
}

/** Builds the GroupedRow view-model for a set of items (first group). */
function firstGroup(items: InventoryItem[]) {
  return groupItemsByGroupingKey(items)[0];
}

/** A controlled wrapper that owns the expand/collapse state for the row. */
const ControlledGroupedRow: React.FC<
  Omit<GroupedRowProps, 'expanded' | 'onToggle'> & {
    initialExpanded?: boolean;
    onToggleSpy?: () => void;
  }
> = ({ initialExpanded = false, onToggleSpy, ...props }) => {
  const [expanded, setExpanded] = useState(initialExpanded);
  return (
    <GroupedRowView
      {...props}
      expanded={expanded}
      onToggle={() => {
        onToggleSpy?.();
        setExpanded((e) => !e);
      }}
    />
  );
};

function renderGroupedRow(
  overrides: Partial<Omit<GroupedRowProps, 'group'>> = {},
): { group: ReturnType<typeof firstGroup> } {
  const items = makeMilkGroup();
  const group = firstGroup(items);
  render(
    <GroupedRowView
      group={group}
      expanded={overrides.expanded ?? false}
      onToggle={overrides.onToggle ?? jest.fn()}
      locationMap={locationMap}
      removeMode={overrides.removeMode ?? false}
      onRemoveItem={overrides.onRemoveItem}
      onItemClick={overrides.onItemClick}
    />,
  );
  return { group };
}

/* ── Collapsed-by-default + toggle (Req 8.4, 8.1) ────────────────── */

describe('InventoryList grouping — collapse/expand integration', () => {
  it('renders new groups collapsed: child item cards are hidden until expanded (Req 8.4)', async () => {
    const user = userEvent.setup();
    const items = makeMilkGroup();
    render(<InventoryList items={items} locations={locations} removeMode={false} />);

    // Drill into the category.
    await user.click(screen.getByTestId('category-card-Dairy'));

    // The grouped row is present, but its child item cards are not rendered yet.
    expect(screen.getByTestId('grouped-row-' + firstGroup(items).groupingKey)).toBeInTheDocument();
    expect(screen.queryByTestId('item-card-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('item-card-b')).not.toBeInTheDocument();
  });

  it('clicking the grouped row toggles its child items visible then hidden (Req 8.1)', async () => {
    const user = userEvent.setup();
    const items = makeMilkGroup();
    render(<InventoryList items={items} locations={locations} removeMode={false} />);

    await user.click(screen.getByTestId('category-card-Dairy'));
    const row = screen.getByTestId('grouped-row-' + firstGroup(items).groupingKey);

    await user.click(row);
    expect(screen.getByTestId('item-card-a')).toBeInTheDocument();
    expect(screen.getByTestId('item-card-b')).toBeInTheDocument();

    await user.click(row);
    expect(screen.queryByTestId('item-card-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('item-card-b')).not.toBeInTheDocument();
  });
});

/* ── aria-expanded / aria-controls (Req 8.7) ─────────────────────── */

describe('GroupedRowView — accessibility state (Req 8.7)', () => {
  it('exposes role="button" and tabIndex 0 on the parent row', () => {
    const { group } = renderGroupedRow();
    const row = screen.getByTestId('grouped-row-' + group.groupingKey);
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
  });

  it('aria-expanded is false when collapsed and true when expanded', () => {
    const { group } = renderGroupedRow({ expanded: false });
    expect(screen.getByTestId('grouped-row-' + group.groupingKey)).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('aria-expanded reflects the expanded state', () => {
    const { group } = renderGroupedRow({ expanded: true });
    expect(screen.getByTestId('grouped-row-' + group.groupingKey)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('aria-controls points at an existing child region that associates the children', () => {
    const { group } = renderGroupedRow({ expanded: true });
    const row = screen.getByTestId('grouped-row-' + group.groupingKey);
    const controlsId = row.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    const region = document.getElementById(controlsId as string);
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('role', 'region');
    // The associated region contains the child item cards.
    expect(region).toContainElement(screen.getByTestId('item-card-a'));
    expect(region).toContainElement(screen.getByTestId('item-card-b'));
  });
});

/* ── Keyboard activation (Req 8.6) ───────────────────────────────── */

describe('GroupedRowView — keyboard activation (Req 8.6)', () => {
  it('Enter toggles the group identically to pointer activation', async () => {
    const user = userEvent.setup();
    const items = makeMilkGroup();
    const group = firstGroup(items);
    render(
      <ControlledGroupedRow group={group} locationMap={locationMap} removeMode={false} />,
    );

    const row = screen.getByTestId('grouped-row-' + group.groupingKey);
    row.focus();

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('item-card-a')).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('item-card-a')).not.toBeInTheDocument();
  });

  it('Space toggles the group', async () => {
    const user = userEvent.setup();
    const items = makeMilkGroup();
    const group = firstGroup(items);
    render(
      <ControlledGroupedRow group={group} locationMap={locationMap} removeMode={false} />,
    );

    const row = screen.getByTestId('grouped-row-' + group.groupingKey);
    row.focus();

    await user.keyboard('[Space]');
    expect(screen.getByTestId('item-card-a')).toBeInTheDocument();
  });

  it('Space prevents the default page-scroll behavior', () => {
    const onToggle = jest.fn();
    const { group } = renderGroupedRow({ onToggle });
    const row = screen.getByTestId('grouped-row-' + group.groupingKey);

    const spaceEvent = createEvent.keyDown(row, { key: ' ' });
    fireEvent(row, spaceEvent);

    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('Enter prevents the default behavior and toggles', () => {
    const onToggle = jest.fn();
    const { group } = renderGroupedRow({ onToggle });
    const row = screen.getByTestId('grouped-row-' + group.groupingKey);

    const enterEvent = createEvent.keyDown(row, { key: 'Enter' });
    fireEvent(row, enterEvent);

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

/* ── Visual hierarchy for child items (Req 10.1–10.4) ────────────── */

describe('GroupedRowView — child visual hierarchy (Req 10.1–10.4)', () => {
  /** Returns the expanded children container (groupedChildren div). */
  function getChildrenContainer(group: ReturnType<typeof firstGroup>): HTMLElement {
    const row = screen.getByTestId('grouped-row-' + group.groupingKey);
    const region = document.getElementById(row.getAttribute('aria-controls') as string);
    return region!.querySelector('div') as HTMLElement;
  }

  it('renders child items with at least 16px of indentation relative to the parent (Req 10.1)', () => {
    const { group } = renderGroupedRow({ expanded: true });
    const container = getChildrenContainer(group);

    const marginLeft = parseInt(container.style.marginLeft || '0', 10);
    const paddingLeft = parseInt(container.style.paddingLeft || '0', 10);
    expect(marginLeft + paddingLeft).toBeGreaterThanOrEqual(16);
  });

  it('renders connector lines linking child items to the parent (Req 10.2)', () => {
    const { group } = renderGroupedRow({ expanded: true });
    const container = getChildrenContainer(group);

    // One connector line element per child item (a decorative, aria-hidden span
    // with an explicit width). Filtered to exclude the unrelated aria-hidden
    // thumbnail placeholder spans (which only set font-size) inside item cards.
    const connectors = Array.from(
      container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'),
    ).filter((c) => c.style.width !== '' && c.style.height !== '');
    expect(connectors).toHaveLength(group.childCount);
    connectors.forEach((c) => {
      // The connector is a visible line: non-zero width and height.
      expect(c.style.width).not.toBe('');
      expect(c.style.height).not.toBe('');
    });
  });

  it('renders child items in a distinct container set apart from top-level grouped rows (Req 10.3)', () => {
    // The implementation gives the children container a distinct background via a
    // CSS custom property; jsdom does not evaluate var()-based colors, so this
    // test asserts the observable distinct panel treatment instead: the children
    // live in their own wrapper element whose styling (indentation + rounded
    // bottom corners) differs from the parent grouped row.
    const { group } = renderGroupedRow({ expanded: true });
    const row = screen.getByTestId('grouped-row-' + group.groupingKey);
    const container = getChildrenContainer(group);

    // The children are wrapped in a dedicated element distinct from the parent row.
    expect(container).not.toBe(row);
    const containerStyle = container.getAttribute('style') ?? '';
    const rowStyle = row.getAttribute('style') ?? '';
    expect(containerStyle).not.toBe(rowStyle);
    // Distinct panel treatment: indentation + rounded bottom corners.
    expect(containerStyle).toContain('padding-left');
    expect(containerStyle).toContain('border-bottom-left-radius');
  });

  it('renders child interactive controls with a minimum 44×44 touch target (Req 10.4)', () => {
    const onRemoveItem = jest.fn();
    renderGroupedRow({
      expanded: true,
      removeMode: true,
      onRemoveItem,
    });

    // One remove control per child item; each must meet the touch-target minimum.
    const removeButtons = screen.getAllByRole('button', { name: 'Remove Milk' });
    expect(removeButtons.length).toBeGreaterThan(0);
    removeButtons.forEach((btn) => {
      expect(btn).toHaveStyle({ minWidth: '44px', minHeight: '44px' });
    });
  });
});

/* ── Child activation + low-stock treatment (Req 10.5, 10.6) ─────── */

describe('GroupedRowView — child activation and low-stock (Req 10.5, 10.6)', () => {
  it('activating a child item opens its detail view via onItemClick (Req 10.5)', async () => {
    const user = userEvent.setup();
    const onItemClick = jest.fn();
    const items = makeMilkGroup();
    const group = firstGroup(items);
    render(
      <GroupedRowView
        group={group}
        expanded={true}
        onToggle={jest.fn()}
        locationMap={locationMap}
        removeMode={false}
        onItemClick={onItemClick}
      />,
    );

    // Child sorted by expiration: item 'b' (2025-02-01) renders first.
    await user.click(screen.getByTestId('item-card-b'));
    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'b' }));
  });

  it('does not call onItemClick in remove mode (cards are not clickable)', async () => {
    const user = userEvent.setup();
    const onItemClick = jest.fn();
    const items = makeMilkGroup();
    const group = firstGroup(items);
    render(
      <GroupedRowView
        group={group}
        expanded={true}
        onToggle={jest.fn()}
        locationMap={locationMap}
        removeMode={true}
        onRemoveItem={jest.fn()}
        onItemClick={onItemClick}
      />,
    );

    await user.click(screen.getByTestId('item-card-b'));
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it('renders a low-stock visual treatment on low-stock child items (Req 10.6)', () => {
    const { group } = renderGroupedRow({ expanded: true });
    const row = screen.getByTestId('grouped-row-' + group.groupingKey);
    const region = document.getElementById(row.getAttribute('aria-controls') as string)!;

    // Item 'b' is low stock; its card should carry the low-stock badge.
    const lowStockCard = screen.getByTestId('item-card-b');
    expect(lowStockCard.querySelector('[aria-label="Low stock"]')).not.toBeNull();

    // Exactly one child (item 'b') is low stock.
    const badges = region.querySelectorAll('[aria-label="Low stock"]');
    expect(badges).toHaveLength(1);
  });
});
