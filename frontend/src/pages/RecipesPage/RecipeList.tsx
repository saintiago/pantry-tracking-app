import React, { useEffect, useMemo, useState } from 'react';
import { fetchRecipes, computeTotalTime } from '../../api/recipes/recipes';
import type { Recipe } from '../../api/recipes/recipes';
import RecipeFilterPanel, {
  EMPTY_PANEL_VALUE,
  RecipeFilterPanelValue,
  isAllInactive,
} from './RecipeFilterPanel';
import { filterRecipes, validateMaxTimeInput, RecipeFilters } from '../../api/recipes/filter';
import type { InventoryIndex } from '../../api/recipes/availability';

interface RecipeListProps {
  onSelect: (recipeId: string) => void;
  onNew: () => void;
  allTags: string[];
  tagsLoading: boolean;
  inventoryIndex: InventoryIndex;
  inventoryLoading: boolean;
}

const RecipeList: React.FC<RecipeListProps> = ({
  onSelect,
  onNew,
  allTags,
  tagsLoading,
  inventoryIndex,
  inventoryLoading,
}) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [panel, setPanel] = useState<RecipeFilterPanelValue>(EMPTY_PANEL_VALUE);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRecipes()
      .then((data) => {
        if (!cancelled) setRecipes(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load recipes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const resolvedFilters: RecipeFilters = {
      nameQuery: search,
      activeTags: activeTagFilters,
      maxPrepTime: validateMaxTimeInput(panel.maxPrepTimeInput).value,
      maxCookTime: validateMaxTimeInput(panel.maxCookTimeInput).value,
      maxTotalTime: validateMaxTimeInput(panel.maxTotalTimeInput).value,
      onlyAllAvailable: panel.onlyAllAvailable,
    };
    return filterRecipes(recipes, resolvedFilters, inventoryIndex);
  }, [recipes, search, activeTagFilters, panel, inventoryIndex]);

  const isAnyFilterActive =
    search.trim() !== '' ||
    activeTagFilters.length > 0 ||
    panel.maxPrepTimeInput !== '' ||
    panel.maxCookTimeInput !== '' ||
    panel.maxTotalTimeInput !== '' ||
    panel.onlyAllAvailable;

  if (loading) {
    return (
      <div style={styles.centered} role="status" aria-label="Loading recipes">
        <p style={styles.statusText}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centered} role="alert">
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Recipes</h2>
        <button onClick={onNew} style={styles.newButton} type="button">
          + New Recipe
        </button>
      </div>

      <input
        type="search"
        placeholder="Search recipes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={styles.searchInput}
        aria-label="Search recipes"
      />

      {/* Tag cloud filter */}
      {tagsLoading ? (
        <div style={styles.tagCloudSpinner} role="status" aria-label="Loading tags…">
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading tags…</span>
        </div>
      ) : allTags.length > 0 ? (
        <div style={styles.tagCloud} role="group" aria-label="Filter by tag">
          {allTags.map((tag) => {
            const isActive = activeTagFilters.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setActiveTagFilters((prev) =>
                    isActive ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
                style={isActive ? styles.tagCloudButtonActive : styles.tagCloudButtonInactive}
                aria-pressed={isActive}
              >
                {tag}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Recipe filter panel */}
      <RecipeFilterPanel
        value={panel}
        onChange={setPanel}
        isAllInactive={isAllInactive(panel)}
        onClear={() => setPanel(EMPTY_PANEL_VALUE)}
        inventoryLoading={inventoryLoading}
      />

      {filtered.length === 0 ? (
        <div style={styles.emptyState} role="status">
          {recipes.length === 0 ? (
            <p style={styles.statusText}>No recipes yet. Tap &quot;New Recipe&quot; to add one.</p>
          ) : isAnyFilterActive ? (
            <p style={styles.statusText}>No recipes match the selected filters.</p>
          ) : (
            <p style={styles.statusText}>No recipes match your search.</p>
          )}
        </div>
      ) : (
        <ul style={styles.list} role="list">
          {filtered.map((recipe) => {
            const missingCount = (recipe as Recipe & { missingCount?: number }).missingCount;
            const totalTime = computeTotalTime(recipe.prepTime, recipe.cookTime);
            const recipeTags = recipe.tags ?? [];
            return (
              <li key={recipe.recipeId} style={styles.listItem}>
                <button
                  onClick={() => onSelect(recipe.recipeId)}
                  style={styles.rowButton}
                  type="button"
                  aria-label={`View ${recipe.name}`}
                >
                  <div style={styles.rowContent}>
                    <span style={styles.recipeName}>{recipe.name}</span>
                    {recipeTags.length > 0 && (
                      <div style={styles.tagChipRow}>
                        {recipeTags.map((tag) => (
                          <span key={tag} style={styles.tagChip}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span style={styles.badgeGroup}>
                    {totalTime !== undefined && (
                      <span style={styles.timeBadge} aria-label={`${totalTime} minutes total`}>
                        {totalTime} min
                      </span>
                    )}
                    {missingCount != null && missingCount > 0 && (
                      <span
                        style={styles.missingBadge}
                        aria-label={`${missingCount} ingredient(s) missing`}
                      >
                        {missingCount} missing
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RecipeList;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: 0,
  },
  newButton: {
    minHeight: 44,
    minWidth: 44,
    padding: '0.5rem 1rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  searchInput: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  tagCloud: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
  },
  tagCloudButtonInactive: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    border: 'none',
    borderRadius: 16,
    padding: '0.25rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 32,
  },
  tagCloudButtonActive: {
    backgroundColor: '#1e40af',
    color: '#ffffff',
    border: 'none',
    borderRadius: 16,
    padding: '0.25rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 32,
  },
  tagCloudSpinner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  listItem: {
    display: 'flex',
  },
  rowButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: 52,
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left',
    gap: '0.5rem',
  },
  rowContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    minWidth: 0,
  },
  recipeName: {
    fontWeight: 500,
  },
  tagChipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.3rem',
  },
  tagChip: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    borderRadius: 16,
    fontWeight: 600,
    fontSize: '0.75rem',
    padding: '0.15rem 0.5rem',
  },
  missingBadge: {
    flexShrink: 0,
    padding: '0.2rem 0.6rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#dc2626',
    borderRadius: 12,
  },
  badgeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flexShrink: 0,
  },
  timeBadge: {
    flexShrink: 0,
    padding: '0.2rem 0.6rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
  },
  emptyState: {
    padding: '2rem 0',
    textAlign: 'center',
  },
  statusText: {
    color: '#6b7280',
    fontSize: '0.9375rem',
    margin: 0,
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.9375rem',
    margin: 0,
  },
};
