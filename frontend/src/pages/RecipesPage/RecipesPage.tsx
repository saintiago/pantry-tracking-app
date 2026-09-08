import RecipeImporter from './RecipeImporter';
import type { RecipeImportDraft } from '@pantry/domain';
import type { InventoryItem } from '../../domain/inventory/types';
import { useLanguage } from '../../i18n/i18n';
import React, { useEffect, useState } from 'react';
import RecipeList from './RecipeList';
import RecipeDetail from './RecipeDetail';
import RecipeEditor from './RecipeEditor';
import { fetchRecipeTags } from '../../api/recipes/recipes';
import { fetchInventory } from '../../api/inventory/inventory';
import { buildInventoryIndex } from '../../api/recipes/availability';
import type { InventoryIndex } from '../../api/recipes/availability';
import type { CookingSession } from '../CookingPage/CookingPage';

interface RecipesPageProps {
  activeCookingSession?: CookingSession | null;
  onStartCooking?: (recipeId: string, recipeName: string) => void;
}

type RecipeView =
  | { mode: 'list' }
  | { mode: 'detail'; recipeId: string }
  | { mode: 'editor-new'; draft?: RecipeImportDraft }
  | { mode: 'import'; source: 'photo' | 'link' }
  | { mode: 'editor-edit'; recipeId: string };

const RecipesPage: React.FC<RecipesPageProps> = ({ activeCookingSession, onStartCooking }) => {
  useLanguage();
  const [view, setView] = useState<RecipeView>({ mode: 'list' });
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [inventoryIndex, setInventoryIndex] = useState<InventoryIndex>(new Map());
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryError, setInventoryError] = useState(false);
  const [inventoryAttempt, setInventoryAttempt] = useState(0);

  // Re-fetch all tags from the API and update allTags state.
  // Called on mount and after any recipe save so newly added tags are reflected immediately.
  const refreshTags = React.useCallback(() => {
    setTagsLoading(true);
    fetchRecipeTags()
      .then(setAllTags)
      .catch(() => {
        // silent fail — autocomplete just won't have suggestions
      })
      .finally(() => setTagsLoading(false));
  }, []);

  // Fetch all tags on mount in parallel with recipe list fetch (non-blocking).
  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  // Fetch inventory on mount in parallel with tags/recipes (non-blocking).
  useEffect(() => {
    let cancelled = false;
    setInventoryLoading(true);
    setInventoryError(false);
    fetchInventory()
      .then((res) => {
        if (!cancelled) {
          setInventoryIndex(buildInventoryIndex(res.items));
          setInventoryItems(res.items);
        }
      })
      .catch(() => {
        if (!cancelled) setInventoryError(true);
      })
      .finally(() => {
        if (!cancelled) setInventoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inventoryAttempt]);

  if (view.mode === 'list') {
    return (
      <RecipeList
        onSelect={(id) => setView({ mode: 'detail', recipeId: id })}
        onNew={(source) =>
          setView(source === 'manual' ? { mode: 'editor-new' } : { mode: 'import', source })
        }
        allTags={allTags}
        tagsLoading={tagsLoading}
        inventoryIndex={inventoryIndex}
        inventoryLoading={inventoryLoading}
        inventoryItems={inventoryItems}
        inventoryError={inventoryError}
        onRetryInventory={() => setInventoryAttempt((n) => n + 1)}
        activeCookingSession={activeCookingSession}
      />
    );
  }

  if (view.mode === 'import')
    return (
      <RecipeImporter
        mode={view.source}
        onReview={(draft) => setView({ mode: 'editor-new', draft })}
        onCancel={() => setView({ mode: 'list' })}
      />
    );

  if (view.mode === 'detail') {
    return (
      <RecipeDetail
        recipeId={view.recipeId}
        onEdit={() => setView({ mode: 'editor-edit', recipeId: view.recipeId })}
        onBack={() => setView({ mode: 'list' })}
        onDeleted={() => setView({ mode: 'list' })}
        activeCookingSession={activeCookingSession}
        onStartCooking={onStartCooking}
      />
    );
  }

  if (view.mode === 'editor-new') {
    return (
      <RecipeEditor
        initialDraft={view.draft}
        onSaved={(id) => {
          refreshTags();
          setView({ mode: 'detail', recipeId: id });
        }}
        onCancel={() => setView({ mode: 'list' })}
        allTags={allTags}
        tagsLoading={tagsLoading}
      />
    );
  }

  // editor-edit
  return (
    <RecipeEditor
      recipeId={view.recipeId}
      onSaved={(id) => {
        refreshTags();
        setView({ mode: 'detail', recipeId: id });
      }}
      onCancel={() => setView({ mode: 'detail', recipeId: view.recipeId })}
      allTags={allTags}
      tagsLoading={tagsLoading}
    />
  );
};

export default RecipesPage;
