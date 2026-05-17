import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import RecipeFilterPanel, {
  EMPTY_PANEL_VALUE,
  RecipeFilterPanelValue,
} from '../RecipeFilterPanel';
import { validateMaxTimeInput } from '../../../api/recipes/filter';

function renderPanel(
  overrides: Partial<RecipeFilterPanelValue> = {},
  props: {
    isAllInactive?: boolean;
    onClear?: () => void;
    onChange?: (next: RecipeFilterPanelValue) => void;
    inventoryLoading?: boolean;
  } = {},
) {
  const value: RecipeFilterPanelValue = { ...EMPTY_PANEL_VALUE, ...overrides };
  const onChange = props.onChange ?? jest.fn();
  const onClear = props.onClear ?? jest.fn();
  const isAllInactive = props.isAllInactive ?? true;

  render(
    <RecipeFilterPanel
      value={value}
      onChange={onChange}
      isAllInactive={isAllInactive}
      onClear={onClear}
      inventoryLoading={props.inventoryLoading}
    />,
  );

  return { onChange, onClear };
}

describe('RecipeFilterPanel — rendering', () => {
  it('renders the four labelled controls and the "Clear filters" button (Requirements 1.2-1.6)', () => {
    renderPanel();

    expect(screen.getByLabelText(/max prep time \(min\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max cook time \(min\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max total time \(min\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/only recipes i can make now/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('renders the panel inside a region with aria-label "Recipe filters"', () => {
    renderPanel();
    expect(screen.getByRole('region', { name: /recipe filters/i })).toBeInTheDocument();
  });
});

describe('RecipeFilterPanel — numeric inputs', () => {
  it('typing a valid value calls onChange with the new raw input preserved', async () => {
    const user = userEvent.setup();

    // Use a controlled wrapper so the input value accumulates correctly
    let currentValue: RecipeFilterPanelValue = { ...EMPTY_PANEL_VALUE };
    const onChange = jest.fn((next: RecipeFilterPanelValue) => {
      currentValue = next;
    });

    const { rerender } = render(
      <RecipeFilterPanel
        value={currentValue}
        onChange={onChange}
        isAllInactive={true}
        onClear={jest.fn()}
      />,
    );

    const input = screen.getByLabelText(/max prep time \(min\)/i);

    // Type '1' — onChange fires, rerender with new value
    await user.type(input, '1');
    rerender(
      <RecipeFilterPanel
        value={currentValue}
        onChange={onChange}
        isAllInactive={false}
        onClear={jest.fn()}
      />,
    );

    // Type '5' — onChange fires again
    await user.type(input, '5');

    // The last onChange call should carry '15' as the raw input
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RecipeFilterPanelValue;
    expect(lastCall.maxPrepTimeInput).toBe('15');
  });

  it('typing "-1" shows the inline error message (Requirement 2.3)', () => {
    renderPanel({ maxPrepTimeInput: '-1' }, { isAllInactive: false });

    // Error should be visible
    expect(screen.getByText(/enter a non-negative whole number/i)).toBeInTheDocument();
  });

  it('validateMaxTimeInput("-1") returns { value: undefined, error }', () => {
    const result = validateMaxTimeInput('-1');
    expect(result.value).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it('typing "1.5" shows the inline error message (Requirements 2.3, 3.3, 4.3)', async () => {
    renderPanel({ maxCookTimeInput: '1.5' }, { isAllInactive: false });
    expect(screen.getByText(/enter a non-negative whole number/i)).toBeInTheDocument();
  });

  it('typing "abc" shows the inline error message (Requirements 2.3, 3.3, 4.3)', async () => {
    renderPanel({ maxTotalTimeInput: 'abc' }, { isAllInactive: false });
    expect(screen.getByText(/enter a non-negative whole number/i)).toBeInTheDocument();
  });

  it('shows no error when input is empty', () => {
    renderPanel({}, { isAllInactive: true });
    expect(screen.queryByText(/enter a non-negative whole number/i)).not.toBeInTheDocument();
  });

  it('shows no error when input is a valid non-negative integer', () => {
    renderPanel({ maxPrepTimeInput: '30' }, { isAllInactive: false });
    expect(screen.queryByText(/enter a non-negative whole number/i)).not.toBeInTheDocument();
  });
});

describe('RecipeFilterPanel — checkbox toggle', () => {
  it('toggling "Only recipes I can make now" calls onChange with onlyAllAvailable: true', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderPanel({}, { onChange, isAllInactive: true });

    await user.click(screen.getByLabelText(/only recipes i can make now/i));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ onlyAllAvailable: true }),
    );
  });

  it('toggling an active checkbox calls onChange with onlyAllAvailable: false', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderPanel({ onlyAllAvailable: true }, { onChange, isAllInactive: false });

    await user.click(screen.getByLabelText(/only recipes i can make now/i));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ onlyAllAvailable: false }),
    );
  });
});

describe('RecipeFilterPanel — Clear filters button', () => {
  it('clicking "Clear filters" calls onClear', async () => {
    const user = userEvent.setup();
    const onClear = jest.fn();
    renderPanel({ maxPrepTimeInput: '10' }, { onClear, isAllInactive: false });

    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('"Clear filters" is disabled when isAllInactive === true (Requirement 8.2)', () => {
    renderPanel({}, { isAllInactive: true });
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeDisabled();
  });

  it('"Clear filters" is enabled when isAllInactive === false (Requirement 8.2)', () => {
    renderPanel({ maxPrepTimeInput: '5' }, { isAllInactive: false });
    expect(screen.getByRole('button', { name: /clear filters/i })).not.toBeDisabled();
  });
});

describe('RecipeFilterPanel — inventory loading hint', () => {
  it('renders "Loading inventory…" hint when inventoryLoading === true', () => {
    renderPanel({}, { inventoryLoading: true });
    expect(screen.getByText(/loading inventory…/i)).toBeInTheDocument();
  });

  it('does not render "Loading inventory…" hint when inventoryLoading === false', () => {
    renderPanel({}, { inventoryLoading: false });
    expect(screen.queryByText(/loading inventory…/i)).not.toBeInTheDocument();
  });

  it('does not render "Loading inventory…" hint when inventoryLoading is not provided', () => {
    renderPanel({});
    expect(screen.queryByText(/loading inventory…/i)).not.toBeInTheDocument();
  });
});
