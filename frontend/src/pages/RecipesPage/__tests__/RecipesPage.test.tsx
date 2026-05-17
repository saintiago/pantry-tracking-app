import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import RecipesPage from '../RecipesPage';

jest.mock('../../../api/recipes/recipes', () => ({
  ...jest.requireActual('../../../api/recipes/recipes'),
  fetchRecipes: jest.fn(),
  fetchRecipeTags: jest.fn(),
  createRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  fetchRecipeWithAvailability: jest.fn(),
}));
jest.mock('../../../api/inventory/inventory', () => ({
  searchInventory: jest.fn().mockResolvedValue({ field: 'name', query: '', resultType: 'items', items: [], count: 0 }),
  fetchInventory: jest.fn(),
}));

import {
  fetchRecipes,
  fetchRecipeTags,
  createRecipe,
  updateRecipe,
  fetchRecipeWithAvailability,
} from '../../../api/recipes/recipes';
import { fetchInventory } from '../../../api/inventory/inventory';
import type { Recipe, RecipeWithAvailability } from '../../../api/recipes/recipes';

const mockFetchRecipes = fetchRecipes as jest.MockedFunction<typeof fetchRecipes>;
const mockFetchRecipeTags = fetchRecipeTags as jest.MockedFunction<typeof fetchRecipeTags>;
const mockCreateRecipe = createRecipe as jest.MockedFunction<typeof createRecipe>;
const mockUpdateRecipe = updateRecipe as jest.MockedFunction<typeof updateRecipe>;
const mockFetchRecipeWithAvailability = fetchRecipeWithAvailability as jest.MockedFunction<
  typeof fetchRecipeWithAvailability
>;
const mockFetchInventory = fetchInventory as jest.MockedFunction<typeof fetchInventory>;

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    recipeId: 'r1',
    userId: 'user-1',
    name: 'Pasta Carbonara',
    tags: ['italian'],
    instructions: 'Boil pasta.',
    ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
    portions: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncVersion: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchRecipes.mockResolvedValue([]);
  mockFetchRecipeTags.mockResolvedValue(['italian', 'quick']);
  mockFetchInventory.mockResolvedValue({ items: [] });
});

describe('RecipesPage', () => {
  it('calls fetchRecipeTags on mount', async () => {
    render(<RecipesPage />);
    await waitFor(() => expect(mockFetchRecipeTags).toHaveBeenCalled());
  });

  it('passes allTags to RecipeList (tag cloud is rendered with fetched tags)', async () => {
    mockFetchRecipeTags.mockResolvedValue(['italian', 'quick']);
    render(<RecipesPage />);

    // Wait for the tag cloud to be rendered (after both fetches resolve)
    await waitFor(() => {
      const tagCloud = screen.getByRole('group', { name: /filter by tag/i });
      expect(tagCloud).toBeInTheDocument();
      // Tag cloud buttons
      expect(screen.getByRole('button', { name: 'italian' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'quick' })).toBeInTheDocument();
    });
  });

  it('does not crash when fetchRecipeTags fails (silent fail)', async () => {
    mockFetchRecipeTags.mockRejectedValue(new Error('Tags fetch failed'));
    render(<RecipesPage />);

    // Page should still render the RecipeList (with empty allTags)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /recipes/i })).toBeInTheDocument();
    });

    // No tag cloud should be rendered (allTags is empty)
    expect(screen.queryByRole('group', { name: /filter by tag/i })).not.toBeInTheDocument();
  });

  it('re-fetches tags after creating a new recipe', async () => {
    const user = userEvent.setup();
    const newRecipe = makeRecipe({ recipeId: 'r-new', tags: ['italian', 'vegan'] });
    mockCreateRecipe.mockResolvedValue(newRecipe);
    // After save, tags endpoint returns the updated list including the new tag
    mockFetchRecipeTags
      .mockResolvedValueOnce(['italian', 'quick']) // initial mount fetch
      .mockResolvedValueOnce(['italian', 'quick', 'vegan']); // post-save re-fetch
    mockFetchRecipeWithAvailability.mockResolvedValue({
      recipe: newRecipe,
      ingredientAvailability: [],
      missingCount: 0,
    } as RecipeWithAvailability);

    render(<RecipesPage />);

    // Wait for initial mount fetch
    await waitFor(() => expect(mockFetchRecipeTags).toHaveBeenCalledTimes(1));

    // Navigate to new recipe editor
    await user.click(screen.getByRole('button', { name: /new recipe/i }));

    // Fill in required fields
    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Vegan Pasta');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Cook it.');

    // Add a tag
    const tagInput = screen.getByPlaceholderText('Add a tag…');
    await user.type(tagInput, 'vegan');
    await user.keyboard('{Enter}');

    // Fill ingredient row
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Pasta');
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '200');
    const unitSelect = screen.getByLabelText(/ingredient 1 unit/i);
    await user.selectOptions(unitSelect, 'g');

    // Fill portions
    await user.type(screen.getByLabelText(/portions/i), '2');

    // Submit
    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    // fetchRecipeTags should have been called a second time after save
    await waitFor(() => expect(mockFetchRecipeTags).toHaveBeenCalledTimes(2));
  });

  it('re-fetches tags after saving an edited recipe', async () => {
    const user = userEvent.setup();
    const existingRecipe = makeRecipe({ recipeId: 'r1', tags: ['italian'] });
    const updatedRecipe = makeRecipe({ recipeId: 'r1', tags: ['italian', 'dinner'] });

    mockFetchRecipes.mockResolvedValue([existingRecipe]);
    mockFetchRecipeTags
      .mockResolvedValueOnce(['italian']) // initial mount fetch
      .mockResolvedValueOnce(['dinner', 'italian']); // post-save re-fetch
    mockFetchRecipeWithAvailability.mockResolvedValue({
      recipe: existingRecipe,
      ingredientAvailability: [],
      missingCount: 0,
    } as RecipeWithAvailability);

    mockUpdateRecipe.mockResolvedValue(updatedRecipe);

    render(<RecipesPage />);

    // Wait for initial mount fetch
    await waitFor(() => expect(mockFetchRecipeTags).toHaveBeenCalledTimes(1));

    // Navigate to recipe list item and then to editor
    await waitFor(() => screen.getByText('Pasta Carbonara'));
    await user.click(screen.getByText('Pasta Carbonara'));

    // Now in detail view — click Edit
    await waitFor(() => screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /edit/i }));

    // Wait for editor to load
    await waitFor(() => screen.getByRole('heading', { name: /edit recipe/i }));

    // Submit without changes (existing tags already populated)
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // fetchRecipeTags should have been called a second time after save
    await waitFor(() => expect(mockFetchRecipeTags).toHaveBeenCalledTimes(2));
  });

  it('does not re-fetch tags when navigating without saving', async () => {
    const user = userEvent.setup();
    render(<RecipesPage />);

    // Wait for initial mount fetch
    await waitFor(() => expect(mockFetchRecipeTags).toHaveBeenCalledTimes(1));

    // Navigate to editor then cancel
    await user.click(screen.getByRole('button', { name: /new recipe/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // fetchRecipeTags should NOT have been called again
    expect(mockFetchRecipeTags).toHaveBeenCalledTimes(1);
  });

  it('calls fetchInventory in parallel with fetchRecipes and fetchRecipeTags on mount', async () => {
    // Use never-resolving promises so we can verify all three fire before any resolves
    let recipesResolve!: (value: Recipe[]) => void;
    let tagsResolve!: (value: string[]) => void;
    let inventoryResolve!: (value: { items: [] }) => void;

    mockFetchRecipes.mockReturnValue(
      new Promise<Recipe[]>((resolve) => {
        recipesResolve = resolve;
      }),
    );
    mockFetchRecipeTags.mockReturnValue(
      new Promise<string[]>((resolve) => {
        tagsResolve = resolve;
      }),
    );
    mockFetchInventory.mockReturnValue(
      new Promise<{ items: [] }>((resolve) => {
        inventoryResolve = resolve;
      }),
    );

    render(<RecipesPage />);

    // All three should have been called synchronously during mount (before any resolves)
    expect(mockFetchRecipes).toHaveBeenCalledTimes(1);
    expect(mockFetchRecipeTags).toHaveBeenCalledTimes(1);
    expect(mockFetchInventory).toHaveBeenCalledTimes(1);

    // Clean up by resolving all promises so no state updates leak into subsequent tests
    await act(async () => {
      recipesResolve([]);
      tagsResolve([]);
      inventoryResolve({ items: [] });
    });
  });

  it('passes inventoryLoading=true to RecipeList while inventory is loading', async () => {
    // Keep inventory pending so inventoryLoading stays true
    let inventoryResolve!: (value: { items: [] }) => void;
    mockFetchInventory.mockReturnValue(
      new Promise<{ items: [] }>((resolve) => {
        inventoryResolve = resolve;
      }),
    );

    render(<RecipesPage />);

    // While inventory is loading, the "Loading inventory…" hint should appear in the filter panel
    await waitFor(() => {
      expect(screen.getByText('Loading inventory…')).toBeInTheDocument();
    });

    // Resolve inventory fetch
    await act(async () => {
      inventoryResolve({ items: [] });
    });

    // After resolving, the hint should disappear
    await waitFor(() => {
      expect(screen.queryByText('Loading inventory…')).not.toBeInTheDocument();
    });
  });

  it('does not crash when fetchInventory fails — RecipeList receives an empty InventoryIndex', async () => {
    mockFetchInventory.mockRejectedValue(new Error('Inventory fetch failed'));

    render(<RecipesPage />);

    // Page should still render the RecipeList heading
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /recipes/i })).toBeInTheDocument();
    });

    // The filter panel should still be present (RecipeList rendered with empty index)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /recipe filters/i })).toBeInTheDocument();
    });

    // inventoryLoading should have settled to false (no loading hint)
    await waitFor(() => {
      expect(screen.queryByText('Loading inventory…')).not.toBeInTheDocument();
    });
  });

  it('resets filter inputs when navigating to detail then back to list (Requirement 1.7)', async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ recipeId: 'r1', prepTime: 10 });
    mockFetchRecipes.mockResolvedValue([recipe]);
    mockFetchRecipeWithAvailability.mockResolvedValue({
      recipe,
      ingredientAvailability: [],
      missingCount: 0,
    } as RecipeWithAvailability);

    render(<RecipesPage />);

    // Wait for recipe list to load
    await waitFor(() => expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument());

    // Type into the max prep time filter with a value that still shows the recipe (10 <= 15)
    const prepInput = screen.getByLabelText(/max prep time/i);
    await user.type(prepInput, '15');
    expect(prepInput).toHaveValue(15);

    // Recipe should still be visible (prepTime 10 <= maxPrepTime 15)
    expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();

    // Navigate to detail view using the aria-label button
    await user.click(screen.getByRole('button', { name: /view pasta carbonara/i }));
    await waitFor(() => screen.getByRole('button', { name: /back/i }));

    // Navigate back to list
    await user.click(screen.getByRole('button', { name: /back/i }));

    // Wait for list to re-render with the recipe visible
    await waitFor(() => expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument());

    // Filter inputs should be reset to empty (RecipeList unmounted and remounted)
    expect(screen.getByLabelText(/max prep time/i)).toHaveValue(null);
  });
});
