import React, { useEffect, useState } from 'react';
import { fetchRecipes } from '../../api/recipes/recipes';
import type { Recipe } from '../../api/recipes/recipes';

interface RecipeListProps {
  onSelect: (recipeId: string) => void;
  onNew: () => void;
}

const RecipeList: React.FC<RecipeListProps> = ({ onSelect, onNew }) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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

  const filtered = recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

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

      {filtered.length === 0 ? (
        <div style={styles.emptyState} role="status">
          {recipes.length === 0 ? (
            <p style={styles.statusText}>No recipes yet. Tap "New Recipe" to add one.</p>
          ) : (
            <p style={styles.statusText}>No recipes match your search.</p>
          )}
        </div>
      ) : (
        <ul style={styles.list} role="list">
          {filtered.map((recipe) => {
            const missingCount = (recipe as Recipe & { missingCount?: number }).missingCount;
            return (
              <li key={recipe.recipeId} style={styles.listItem}>
                <button
                  onClick={() => onSelect(recipe.recipeId)}
                  style={styles.rowButton}
                  type="button"
                  aria-label={`View ${recipe.name}`}
                >
                  <span style={styles.recipeName}>{recipe.name}</span>
                  {missingCount != null && missingCount > 0 && (
                    <span style={styles.missingBadge} aria-label={`${missingCount} ingredient(s) missing`}>
                      {missingCount} missing
                    </span>
                  )}
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
  recipeName: {
    flex: 1,
    fontWeight: 500,
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
