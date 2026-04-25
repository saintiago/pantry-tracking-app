import React, { useState } from 'react';
import RecipeList from './RecipeList';
import RecipeDetail from './RecipeDetail';
import RecipeEditor from './RecipeEditor';

type RecipeView =
  | { mode: 'list' }
  | { mode: 'detail'; recipeId: string }
  | { mode: 'editor-new' }
  | { mode: 'editor-edit'; recipeId: string };

const RecipesPage: React.FC = () => {
  const [view, setView] = useState<RecipeView>({ mode: 'list' });

  if (view.mode === 'list') {
    return (
      <RecipeList
        onSelect={(id) => setView({ mode: 'detail', recipeId: id })}
        onNew={() => setView({ mode: 'editor-new' })}
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
      />
    );
  }

  // editor-edit
  return (
    <RecipeEditor
      recipeId={view.recipeId}
      onSaved={(id) => setView({ mode: 'detail', recipeId: id })}
      onCancel={() => setView({ mode: 'detail', recipeId: view.recipeId })}
    />
  );
};

export default RecipesPage;
