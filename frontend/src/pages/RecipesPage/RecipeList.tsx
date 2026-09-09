import RecipeCards, { RecipeViewPicker, type LibraryView } from './RecipeCards';
import Cookbooks from './Cookbooks';
import RecipeCreateMenu from './RecipeCreateMenu';
import { prioritizeExpiringRecipes } from '../../domain/recipes/expiration';
import type { InventoryItem } from '../../domain/inventory/types';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { fetchRecipes } from '../../api/recipes/recipes';
import type { Recipe } from '../../api/recipes/recipes';
import RecipeFilterPanel, {
  EMPTY_PANEL_VALUE,
  RecipeFilterPanelValue,
  isAllInactive,
} from './RecipeFilterPanel';
import { filterRecipes, validateMaxTimeInput, RecipeFilters } from '../../api/recipes/filter';
import type { InventoryIndex } from '../../api/recipes/availability';
import type { CookingSession } from '../CookingPage/CookingPage';

interface RecipeListProps {
  refreshToken?: number;
  onSelect: (recipeId: string) => void;
  onNew: (mode: 'manual' | 'photo' | 'link') => void;
  allTags: string[];
  tagsLoading: boolean;
  inventoryIndex: InventoryIndex;
  inventoryLoading: boolean;
  inventoryItems?: InventoryItem[];
  inventoryError?: boolean;
  onRetryInventory?: () => void;
  activeCookingSession?: CookingSession | null;
}

const RecipeList: React.FC<RecipeListProps> = ({
  refreshToken = 0,
  onSelect,
  onNew,
  allTags,
  tagsLoading,
  inventoryIndex,
  inventoryLoading,
  inventoryItems = [],
  inventoryError = false,
  onRetryInventory,
  activeCookingSession,
}) => {
  useLanguage();
  const [cookbookIds, setCookbookIds] = useState<string[] | null | undefined>(null);
  const [createRequest, setCreateRequest] = useState(0);
  const [allView, setAllView] = useState<LibraryView>('list');
  const [bookView, setBookView] = useState<LibraryView>('icons');
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
  }, [refreshToken]);

  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const filtered = useMemo(() => {
    const resolvedFilters: RecipeFilters = {
      nameQuery: search,
      activeTags: activeTagFilters,
      maxPrepTime: validateMaxTimeInput(panel.maxPrepTimeInput).value,
      maxCookTime: validateMaxTimeInput(panel.maxCookTimeInput).value,
      maxTotalTime: validateMaxTimeInput(panel.maxTotalTimeInput).value,
      onlyAllAvailable: panel.onlyAllAvailable,
    };
    return prioritizeExpiringRecipes(
      filterRecipes(
        cookbookIds ? recipes.filter((r) => cookbookIds.includes(r.recipeId)) : recipes,
        resolvedFilters,
        inventoryIndex,
      ),
      inventoryItems,
      today,
      panel.expiringWithinDays ?? 0,
    );
  }, [
    recipes,
    cookbookIds,
    search,
    activeTagFilters,
    panel,
    inventoryIndex,
    inventoryItems,
    today,
  ]);

  const isAnyFilterActive =
    search.trim() !== '' ||
    activeTagFilters.length > 0 ||
    panel.maxPrepTimeInput !== '' ||
    panel.maxCookTimeInput !== '' ||
    panel.maxTotalTimeInput !== '' ||
    panel.onlyAllAvailable ||
    !!panel.expiringWithinDays;

  if (loading && refreshToken === 0) {
    return (
      <div style={styles.centered} role="status" aria-label={t('Loading recipes')}>
        <p style={styles.statusText}>{t('Loading…')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centered} role="alert">
        <p style={styles.errorText}>{translateMessage(error)}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ minWidth: 0 }}>
          <h2 style={styles.title}>{t('Recipes')}</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-secondary)', fontSize: '.875rem' }}>
            {t('From inventory to your recipes')}
          </p>
        </div>
        <RecipeCreateMenu onSelect={onNew} onNewCookbook={() => setCreateRequest((n) => n + 1)} />
      </div>

      <Cookbooks
        recipes={recipes}
        createRequest={createRequest}
        onSelect={(ids) => {
          setCookbookIds(ids);
          setPanel(EMPTY_PANEL_VALUE);
        }}
      />
      <div hidden={cookbookIds === undefined}>
        {/* Recipe filter panel */}
        <RecipeFilterPanel
          recipes={cookbookIds ? recipes.filter((r) => cookbookIds.includes(r.recipeId)) : recipes}
          value={panel}
          onChange={setPanel}
          isAllInactive={isAllInactive(panel)}
          onClear={() => setPanel(EMPTY_PANEL_VALUE)}
          inventoryLoading={inventoryLoading}
          inventoryUnavailable={inventoryError}
        />

        <input
          type="search"
          placeholder={t('Search recipes…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
          aria-label={t('Search recipes')}
        />

        {/* Tag cloud filter */}
        {tagsLoading ? (
          <div style={styles.tagCloudSpinner} role="status" aria-label={t('Loading tags…')}>
            <span style={{ color: 'var(--color-secondary)', fontSize: '0.875rem' }}>
              {t('Loading tags…')}{' '}
            </span>
          </div>
        ) : allTags.length > 0 ? (
          <div style={styles.tagCloud} role="group" aria-label={t('Filter by tag')}>
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

        {inventoryError && (
          <p role="alert">
            {t('Inventory filters unavailable. Retry inventory.')}{' '}
            <button onClick={onRetryInventory}>{t('Retry inventory')}</button>
          </p>
        )}
        <RecipeViewPicker
          value={cookbookIds ? bookView : allView}
          onChange={cookbookIds ? setBookView : setAllView}
        />
        {filtered.length === 0 ? (
          <div style={styles.emptyState} role="status">
            {recipes.length === 0 ? (
              <p style={styles.statusText}>{t('No recipes yet. Tap "New Recipe" to add one.')}</p>
            ) : isAnyFilterActive ? (
              <p style={styles.statusText}>{t('No recipes match the selected filters.')}</p>
            ) : (
              <p style={styles.statusText}>{t('No recipes match your search.')}</p>
            )}
          </div>
        ) : (
          <RecipeCards
            recipes={filtered}
            view={cookbookIds ? bookView : allView}
            onSelect={onSelect}
            cookingId={activeCookingSession?.recipeId}
            inventoryItems={inventoryItems}
            today={today}
            expiringWithinDays={panel.expiringWithinDays}
          />
        )}
      </div>
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
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-mint)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  searchInput: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid var(--color-border)',
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
    backgroundColor: 'var(--color-sky)',
    color: 'var(--color-action)',
    border: 'none',
    borderRadius: 16,
    padding: '0.25rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 32,
  },
  tagCloudButtonActive: {
    backgroundColor: 'var(--color-mint)',
    color: 'var(--color-text)',
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
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
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
  cookingIndicator: {
    fontSize: '0.875rem',
  },
  tagChipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.3rem',
  },
  tagChip: {
    backgroundColor: 'var(--color-sky)',
    color: 'var(--color-action)',
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
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-danger)',
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
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-border)',
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
    color: 'var(--color-secondary)',
    fontSize: '0.9375rem',
    margin: 0,
  },
  errorText: {
    color: 'var(--color-danger-text)',
    fontSize: '0.9375rem',
    margin: 0,
  },
};
