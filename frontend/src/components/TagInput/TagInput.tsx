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
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownId = 'tag-input-dropdown';

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
    if (tags.includes(normalized)) return; // silent dedup
    onChange([...tags, normalized]);
    setInputValue('');
    setAutocompleteOpen(false);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === '.') {
      e.preventDefault();
      commitTag(inputValue);
    } else if (e.key === 'Escape') {
      setAutocompleteOpen(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
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
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [autocompleteOpen]);

  const showDropdown = autocompleteOpen && !tagsLoading && suggestions.length > 0;

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
          aria-haspopup="listbox"
          style={styles.input}
        />

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <ul id={dropdownId} role="listbox" style={styles.dropdown}>
            {suggestions.map((tag) => (
              <li
                key={tag}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSuggestionMouseDown(tag);
                }}
                style={styles.dropdownItem}
              >
                {tag}
              </li>
            ))}
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
    margin: 0,
    padding: 0,
  },
  dropdownItem: {
    padding: '0.5rem 0.75rem',
    cursor: 'pointer',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.9375rem',
    color: '#374151',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.875rem',
  },
};
