import React, { useEffect, useRef, useState } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  allTags: string[];
  tagsLoading: boolean;
  error?: string;
}

const TagInput: React.FC<TagInputProps> = ({ tags, onChange, allTags, tagsLoading, error }) => {
  const [inputValue, setInputValue] = useState('');
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownId = 'tag-input-dropdown';
  const optionId = (index: number) => `tag-input-option-${index}`;

  const getSuggestions = (value: string): string[] => {
    if (tagsLoading) return [];
    const lower = value.toLowerCase();
    return allTags
      .filter((t) => !tags.includes(t))
      .filter((t) => (value === '' ? true : t.toLowerCase().includes(lower)))
      .slice(0, 10);
  };

  const suggestions = getSuggestions(inputValue);

  const commitTag = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return;
    if (tags.includes(normalized)) {
      // silent dedup — still clear the input so the user can keep typing
      setInputValue('');
      setAutocompleteOpen(false);
      setHighlightedIndex(-1);
      return;
    }
    onChange([...tags, normalized]);
    setInputValue('');
    setAutocompleteOpen(false);
    setHighlightedIndex(-1);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // ArrowDown — open dropdown if closed; move highlight forward (wraps)
    if (e.key === 'ArrowDown') {
      if (tagsLoading || suggestions.length === 0) return;
      e.preventDefault();
      if (!autocompleteOpen) {
        setAutocompleteOpen(true);
        setHighlightedIndex(0);
        return;
      }
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    // ArrowUp — move highlight backward (wraps; -1 wraps to last)
    if (e.key === 'ArrowUp') {
      if (tagsLoading || suggestions.length === 0) return;
      e.preventDefault();
      if (!autocompleteOpen) {
        setAutocompleteOpen(true);
        setHighlightedIndex(suggestions.length - 1);
        return;
      }
      setHighlightedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }

    // Tab — autocomplete shortcut: commit highlighted or first suggestion when dropdown is open
    if (e.key === 'Tab') {
      if (autocompleteOpen && !tagsLoading && suggestions.length > 0) {
        e.preventDefault();
        const indexToCommit = highlightedIndex >= 0 ? highlightedIndex : 0;
        commitTag(suggestions[indexToCommit]);
      }
      // else: allow default Tab focus shift, do not commit inputValue
      return;
    }

    // Enter — commits highlighted suggestion only if user actively highlighted one;
    // otherwise commits the raw inputValue (just like the other delimiter keys).
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions.length > 0) {
        commitTag(suggestions[highlightedIndex]);
      } else {
        commitTag(inputValue);
      }
      return;
    }

    // Other delimiter keys — always commit the raw inputValue
    if (e.key === ',' || e.key === ';' || e.key === '.') {
      e.preventDefault();
      commitTag(inputValue);
      return;
    }

    if (e.key === 'Escape') {
      setAutocompleteOpen(false);
      setHighlightedIndex(-1);
      return;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    // Reset highlight on input change so a subsequent Enter commits the user's typed text
    // rather than a stale highlighted suggestion.
    setHighlightedIndex(-1);
    if (!tagsLoading) {
      setAutocompleteOpen(true);
    }
  };

  const handleFocus = () => {
    if (!tagsLoading) {
      setAutocompleteOpen(true);
    }
  };

  const handleSuggestionMouseDown = (tag: string) => {
    commitTag(tag);
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!autocompleteOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAutocompleteOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [autocompleteOpen]);

  const showDropdown = autocompleteOpen && !tagsLoading && suggestions.length > 0;
  const activeDescendant =
    showDropdown && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined;

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Chips row */}
      {tags.length > 0 && (
        <div style={styles.chipsRow}>
          {tags.map((tag) => (
            <span key={tag} style={styles.chip}>
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                style={styles.removeButton}
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input wrapper */}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={tagsLoading ? 'Loading tags…' : 'Add a tag…'}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls={showDropdown ? dropdownId : undefined}
          aria-activedescendant={activeDescendant}
          aria-haspopup="listbox"
          style={styles.input}
        />

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <ul id={dropdownId} role="listbox" style={styles.dropdown}>
            {suggestions.map((tag, index) => {
              const isHighlighted = index === highlightedIndex;
              return (
                <li
                  key={tag}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSuggestionMouseDown(tag);
                  }}
                  style={isHighlighted ? styles.dropdownItemHighlighted : styles.dropdownItem}
                >
                  {tag}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Error message */}
      {error && (
        <span style={styles.errorText} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default TagInput;

const dropdownItemBase: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  fontSize: '0.9375rem',
  color: '#374151',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    borderRadius: 16,
    fontWeight: 600,
    fontSize: '0.875rem',
    padding: '0.2rem 0.5rem',
  },
  removeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#1e40af',
    fontSize: '1rem',
    lineHeight: 1,
    padding: '0 0.1rem',
    display: 'flex',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    maxHeight: 200,
    overflowY: 'auto',
    zIndex: 1000,
    marginTop: 4,
    listStyle: 'none',
    padding: 0,
  },
  dropdownItem: dropdownItemBase,
  dropdownItemHighlighted: {
    ...dropdownItemBase,
    backgroundColor: '#e0e7ff',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.875rem',
  },
};
