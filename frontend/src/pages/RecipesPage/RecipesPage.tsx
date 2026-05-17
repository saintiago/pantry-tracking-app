import React, { useEffect, useState } from 'react';
import RecipeList from './RecipeList';
import RecipeDetail from './RecipeDetail';
import RecipeEditor from './RecipeEditor';
import { fetchRecipeTags } from '../../api/recipes/recipes';

type RecipeView =
  | { mode: 'list' }
  | { mode: 'detail'; recipeId: string }
  | { mode: 'editor-new' }
  | { mode: 'editor-edit'; recipeId: string };

const RecipesPage: React.FC = () => {
  const [view, setView] = useState<RecipeView>({ mode: 'list' });
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);

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

  if (view.mode === 'list') {
    return (
      <RecipeList
        onSelect={(id) => setView({ mode: 'detail', recipeId: id })}
        onNew={() => setView({ mode: 'editor-new' })}
        allTags={allTags}
        tagsLoading={tagsLoading}
      />
    );
  }

  if (view.mode === 'detail') {
    return (
      <RecipeDetail
        recipeId={view.recipeId}
        onEdit={() => setView({ mode: 'editor-edit', recipeId: view.recipeId })}
        onBack={() => setView({ mode: 'list' })}
        onDeleted={() => setView({ mode: 'list' })}
      />
    );
  }

  if (view.mode === 'editor-new') {
    return (
      <RecipeEditor
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
