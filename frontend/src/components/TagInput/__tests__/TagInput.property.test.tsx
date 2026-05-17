import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fc from 'fast-check';
import TagInput from '../TagInput';

describe('TagInput — property tests', () => {
  // Property 7: Committed tags are always lowercase
  // Validates: Requirements 2.2
  it('Property 7: committed tags are always trimmed+lowercased', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          const onChange = jest.fn();
          const { unmount } = render(
            <TagInput tags={[]} onChange={onChange} allTags={[]} tagsLoading={false} />,
          );
          const inputEl = screen.getByRole('combobox');
          fireEvent.change(inputEl, { target: { value: input } });
          fireEvent.keyDown(inputEl, { key: 'Enter' });

          if (onChange.mock.calls.length > 0) {
            const committed = onChange.mock.calls[0][0][0];
            expect(committed).toBe(input.trim().toLowerCase());
          }
          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 8: Deduplication prevents duplicate chips
  // Validates: Requirements 2.4
  it('Property 8: duplicate input leaves tags array unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          { minLength: 1, maxLength: 5 },
        ),
        (existingTags) => {
          const normalizedTags = [...new Set(existingTags.map((t) => t.trim().toLowerCase()))];
          if (normalizedTags.length === 0) return;
          const duplicateInput = normalizedTags[0];

          const onChange = jest.fn();
          const { unmount } = render(
            <TagInput tags={normalizedTags} onChange={onChange} allTags={[]} tagsLoading={false} />,
          );
          const inputEl = screen.getByRole('combobox');
          fireEvent.change(inputEl, { target: { value: duplicateInput } });
          fireEvent.keyDown(inputEl, { key: 'Enter' });

          // onChange should NOT have been called (duplicate discarded)
          expect(onChange).not.toHaveBeenCalled();
          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 9: Autocomplete suggestions are bounded and filtered
  // Validates: Requirements 4.1, 4.4, 4.6
  it('Property 9: autocomplete suggestions are bounded, filtered, and exclude current tags', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          { maxLength: 20 },
        ),
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          { maxLength: 5 },
        ),
        fc.string({ maxLength: 10 }),
        (allTagsRaw, currentTagsRaw, inputValue) => {
          const allTags = [...new Set(allTagsRaw.map((t) => t.trim().toLowerCase()))];
          const currentTags = [...new Set(currentTagsRaw.map((t) => t.trim().toLowerCase()))].filter(
            (t) => allTags.includes(t),
          );

          const { unmount } = render(
            <TagInput
              tags={currentTags}
              onChange={jest.fn()}
              allTags={allTags}
              tagsLoading={false}
            />,
          );
          const inputEl = screen.getByRole('combobox');
          fireEvent.change(inputEl, { target: { value: inputValue } });

          const options = screen.queryAllByRole('option');

          // Bounded to 10
          expect(options.length).toBeLessThanOrEqual(10);

          // Each suggestion contains inputValue as substring (case-insensitive)
          if (inputValue.trim().length > 0) {
            options.forEach((opt) => {
              expect(opt.textContent?.toLowerCase()).toContain(inputValue.toLowerCase());
            });
          }

          // No suggestion is already in currentTags
          options.forEach((opt) => {
            expect(currentTags).not.toContain(opt.textContent);
          });

          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 11: Keyboard highlight stays in bounds
  // Validates: Requirements 4a.1, 4a.2
  it('Property 11: ArrowDown/ArrowUp keep highlightedIndex within [0, n-1]', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 10 })
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s.length > 0),
          { minLength: 1, maxLength: 10 },
        ),
        fc.array(fc.constantFrom<'ArrowDown' | 'ArrowUp'>('ArrowDown', 'ArrowUp'), {
          minLength: 1,
          maxLength: 30,
        }),
        (allTagsRaw, keys) => {
          const allTags = [...new Set(allTagsRaw)];
          if (allTags.length === 0) return;

          const { unmount } = render(
            <TagInput tags={[]} onChange={jest.fn()} allTags={allTags} tagsLoading={false} />,
          );
          const inputEl = screen.getByRole('combobox');
          fireEvent.focus(inputEl);

          for (const key of keys) {
            fireEvent.keyDown(inputEl, { key });
          }

          // After at least one Arrow key on a non-empty list, exactly one option is selected
          const selected = screen
            .queryAllByRole('option')
            .filter((opt) => opt.getAttribute('aria-selected') === 'true');
          expect(selected.length).toBe(1);
          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 12 (Tab branch): Tab commits suggestion[highlighted ?? 0] when dropdown is open with suggestions
  // Validates: Requirements 4a.4
  it('Property 12 (Tab): Tab commits highlighted suggestion (or first if none) when suggestions exist', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 10 })
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s.length > 0),
          { minLength: 1, maxLength: 5 },
        ),
        fc.integer({ min: -1, max: 4 }),
        (allTagsRaw, arrowDownCount) => {
          const allTags = [...new Set(allTagsRaw)];
          if (allTags.length === 0) return;
          const onChange = jest.fn();

          const { unmount } = render(
            <TagInput tags={[]} onChange={onChange} allTags={allTags} tagsLoading={false} />,
          );
          const inputEl = screen.getByRole('combobox');
          fireEvent.focus(inputEl);

          // Press ArrowDown N times (N from -1 to 4); -1 means "do not press"
          for (let i = 0; i < arrowDownCount; i++) {
            fireEvent.keyDown(inputEl, { key: 'ArrowDown' });
          }

          fireEvent.keyDown(inputEl, { key: 'Tab' });

          // Tab should commit a suggestion: either suggestions[highlightedIndex] or suggestions[0]
          if (arrowDownCount <= 0) {
            // No arrow press → highlightedIndex = -1 → commit first
            expect(onChange).toHaveBeenCalledWith([allTags[0]]);
          } else {
            const expectedIndex = ((arrowDownCount - 1) % allTags.length + allTags.length) %
              allTags.length;
            expect(onChange).toHaveBeenCalledWith([allTags[expectedIndex]]);
          }
          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 12 (Enter branch): Enter commits typed inputValue when nothing highlighted, suggestion when highlighted
  // Validates: Requirements 4a.6, 4a.7
  it('Property 12 (Enter): Enter commits typed text when nothing highlighted, highlighted suggestion otherwise', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 10 })
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s.length > 0),
          { minLength: 2, maxLength: 5 },
        ),
        fc.boolean(),
        (allTagsRaw, useArrow) => {
          const allTags = [...new Set(allTagsRaw)];
          if (allTags.length < 2) return;

          // Pick a typed value that is NOT in allTags so we can distinguish "typed" vs "suggestion"
          const typed = 'zzz_unique_typed_value';
          const onChange = jest.fn();

          const { unmount } = render(
            <TagInput tags={[]} onChange={onChange} allTags={allTags} tagsLoading={false} />,
          );
          const inputEl = screen.getByRole('combobox');
          fireEvent.focus(inputEl);
          fireEvent.change(inputEl, { target: { value: typed } });

          if (useArrow) {
            // Highlight the first available suggestion (filtered by `typed`, which is not a substring
            // of any allTag → suggestions list is empty → ArrowDown is a no-op).
            // To ensure suggestions exist, clear the typed value first.
            fireEvent.change(inputEl, { target: { value: '' } });
            fireEvent.keyDown(inputEl, { key: 'ArrowDown' });
            fireEvent.keyDown(inputEl, { key: 'Enter' });
            // Expect the highlighted suggestion (first) to be committed
            expect(onChange).toHaveBeenCalledWith([allTags[0]]);
          } else {
            fireEvent.keyDown(inputEl, { key: 'Enter' });
            // Expect the typed value to be committed (no highlight)
            expect(onChange).toHaveBeenCalledWith([typed]);
          }
          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });
});
