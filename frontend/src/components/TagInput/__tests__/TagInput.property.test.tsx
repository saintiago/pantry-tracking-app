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
});
