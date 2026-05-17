// Feature: recipe-search-filter

import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fc from 'fast-check';
import RecipeFilterPanel, {
  EMPTY_PANEL_VALUE,
  RecipeFilterPanelValue,
  isAllInactive,
} from '../RecipeFilterPanel';

// ---------------------------------------------------------------------------
// Arbitrary for RecipeFilterPanelValue
// ---------------------------------------------------------------------------

const panelValueArb: fc.Arbitrary<RecipeFilterPanelValue> = fc.record({
  maxPrepTimeInput: fc.oneof(
    fc.constant(''),
    fc.integer({ min: 0, max: 300 }).map(String),
    fc.integer({ min: -100, max: -1 }).map(String),
    fc.constant('1.5'),
    fc.constant('abc'),
  ),
  maxCookTimeInput: fc.oneof(
    fc.constant(''),
    fc.integer({ min: 0, max: 300 }).map(String),
    fc.integer({ min: -100, max: -1 }).map(String),
    fc.constant('2.7'),
  ),
  maxTotalTimeInput: fc.oneof(
    fc.constant(''),
    fc.integer({ min: 0, max: 600 }).map(String),
    fc.constant('xyz'),
  ),
  onlyAllAvailable: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Wrapper component that captures onChange calls via useState
// ---------------------------------------------------------------------------

interface WrapperProps {
  initialValue: RecipeFilterPanelValue;
  onValueChange?: (v: RecipeFilterPanelValue) => void;
}

function Wrapper({ initialValue, onValueChange }: WrapperProps) {
  const [value, setValue] = useState<RecipeFilterPanelValue>(initialValue);

  const handleChange = (next: RecipeFilterPanelValue) => {
    setValue(next);
    onValueChange?.(next);
  };

  const handleClear = () => {
    setValue(EMPTY_PANEL_VALUE);
    onValueChange?.(EMPTY_PANEL_VALUE);
  };

  return (
    <RecipeFilterPanel
      value={value}
      onChange={handleChange}
      isAllInactive={isAllInactive(value)}
      onClear={handleClear}
    />
  );
}

// ---------------------------------------------------------------------------
// Arbitrary for RecipeFilterPanelValue that is NOT all-inactive
// (so the Clear button is always enabled for Property 9)
// ---------------------------------------------------------------------------

const nonEmptyPanelValueArb: fc.Arbitrary<RecipeFilterPanelValue> = panelValueArb.filter(
  (v) => !isAllInactive(v),
);

// ---------------------------------------------------------------------------
// Property 9: Clear filters resets the panel
// Feature: recipe-search-filter, Property 9: Clear filters resets the panel
// Validates: Requirements 1.6, 8.1
// ---------------------------------------------------------------------------

describe('Property 9: Clear filters resets the panel', () => {
  it('clicking "Clear filters" produces a panel value equal to EMPTY_PANEL_VALUE', () => {
    fc.assert(
      fc.property(nonEmptyPanelValueArb, (v) => {
        let capturedValue: RecipeFilterPanelValue | undefined;

        const { unmount } = render(
          <Wrapper
            initialValue={v}
            onValueChange={(next) => {
              capturedValue = next;
            }}
          />,
        );

        const clearButton = screen.getByRole('button', { name: /clear filters/i });

        // Button must be enabled (v is non-empty)
        expect(clearButton).not.toBeDisabled();

        act(() => {
          clearButton.click();
        });

        expect(capturedValue).toEqual(EMPTY_PANEL_VALUE);

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Clear filters disabled iff all controls inactive
// Feature: recipe-search-filter, Property 10: Clear filters disabled iff all controls inactive
// Validates: Requirement 8.2
// ---------------------------------------------------------------------------

describe('Property 10: Clear filters disabled iff all controls inactive', () => {
  it('the "Clear filters" button disabled attribute equals isAllInactive(v)', () => {
    fc.assert(
      fc.property(panelValueArb, (v) => {
        const { unmount } = render(
          <Wrapper initialValue={v} />,
        );

        const clearButton = screen.getByRole('button', { name: /clear filters/i });
        const expectedDisabled = isAllInactive(v);

        expect(clearButton).toHaveProperty('disabled', expectedDisabled);

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
