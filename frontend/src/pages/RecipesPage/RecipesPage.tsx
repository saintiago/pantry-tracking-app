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

  // Fetch all tags on mount in parallel with recipe list fetch (non-blocking).
  useEffect(() => {
    let cancelled = false;
    fetchRecipeTags()
      .then((tags) => {
        if (!cancelled) setAllTags(tags);
      })
      .catch(() => {
        // silent fail — autocomplete just won't have suggestions
      })
      .finally(() => {
        if (!cancelled) setTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        onSaved={(id) => setView({ mode: 'detail', recipeId: id })}
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
      onSaved={(id) => setView({ mode: 'detail', recipeId: id })}
      onCancel={() => setView({ mode: 'detail', recipeId: view.recipeId })}
      allTags={allTags}
      tagsLoading={tagsLoading}
    />
  );
};

export default RecipesPage;
