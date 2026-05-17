import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import RecipeList from '../RecipeList';
import * as recipesApi from '../../../api/recipes/recipes';
import type { Recipe } from '../../../api/recipes/recipes';
import type { InventoryIndex } from '../../../api/recipes/availability';

jest.mock('../../../api/recipes/recipes');

const mockFetchRecipes = recipesApi.fetchRecipes as jest.MockedFunction<typeof recipesApi.fetchRecipes>;

// Restore the real computeTotalTime since it's a pure function
const { computeTotalTime: realComputeTotalTime } = jest.requireActual('../../../api/recipes/recipes');
const recipesApiModule = jest.requireMock('../../../api/recipes/recipes');
recipesApiModule.computeTotalTime = realComputeTotalTime;

function makeRecipe(overrides: Partial<Recipe> & { recipeId: string; name: string }): Recipe {
  return {
    userId: 'user-1',
    tags: [],
    ingredients: [],
    instructions: 'Some instructions',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncVersion: 1,
    ...overrides,
  };
}

const sampleRecipes: Recipe[] = [
  makeRecipe({ recipeId: 'r1', name: 'Pasta Carbonara' }),
  makeRecipe({ recipeId: 'r2', name: 'Chicken Soup' }),
  makeRecipe({ recipeId: 'r3', name: 'Banana Bread' }),
];

describe('RecipeList', () => {
  const onSelect = jest.fn();
  const onNew = jest.fn();
  const defaultProps = {
    onSelect,
    onNew,
    allTags: [] as string[],
    tagsLoading: false,
    inventoryIndex: new Map() as InventoryIndex,
    inventoryLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state while fetching', () => {
    mockFetchRecipes.mockReturnValue(new Promise(() => {})); // never resolves
    render(<RecipeList {...defaultProps} />);
    expect(screen.getByRole('status', { name: /loading recipes/i })).toBeInTheDocument();
  });

  it('renders recipe list after fetch', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument());
    expect(screen.getByText('Chicken Soup')).toBeInTheDocument();
    expect(screen.getByText('Banana Bread')).toBeInTheDocument();
  });

  it('shows empty state when no recipes exist', async () => {
    mockFetchRecipes.mockResolvedValue([]);
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument());
  });

  it('shows error message on fetch failure', async () => {
    mockFetchRecipes.mockRejectedValue(new Error('Network error'));
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });

  it('calls onNew when New Recipe button is clicked', async () => {
    mockFetchRecipes.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByRole('button', { name: /new recipe/i }));
    await user.click(screen.getByRole('button', { name: /new recipe/i }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect with recipeId when a recipe row is clicked', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));
    await user.click(screen.getByRole('button', { name: /view pasta carbonara/i }));
    expect(onSelect).toHaveBeenCalledWith('r1');
  });

  it('filters recipes by search input (case-insensitive)', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    await user.type(screen.getByRole('searchbox', { name: /search recipes/i }), 'chicken');

    expect(screen.getByText('Chicken Soup')).toBeInTheDocument();
    expect(screen.queryByText('Pasta Carbonara')).not.toBeInTheDocument();
    expect(screen.queryByText('Banana Bread')).not.toBeInTheDocument();
  });

  it('shows empty search state when no recipes match filter', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    await user.type(screen.getByRole('searchbox', { name: /search recipes/i }), 'zzznomatch');

    expect(screen.getByText(/no recipes match the selected filters/i)).toBeInTheDocument();
  });

  it('shows missing-ingredient badge when missingCount > 0', async () => {
    const recipeWithMissing = { ...sampleRecipes[0], missingCount: 2 } as Recipe & { missingCount: number };
    mockFetchRecipes.mockResolvedValue([recipeWithMissing, sampleRecipes[1]]);
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    expect(screen.getByLabelText(/2 ingredient\(s\) missing/i)).toBeInTheDocument();
    // Second recipe has no missingCount — no badge
    expect(screen.queryAllByLabelText(/ingredient\(s\) missing/i)).toHaveLength(1);
  });

  it('does not show missing-ingredient badge when missingCount is 0', async () => {
    const recipeNoMissing = { ...sampleRecipes[0], missingCount: 0 } as Recipe & { missingCount: number };
    mockFetchRecipes.mockResolvedValue([recipeNoMissing]);
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    expect(screen.queryByLabelText(/ingredient\(s\) missing/i)).not.toBeInTheDocument();
  });

  // ─── Time badge ───────────────────────────────────────────────────────────────

  it('renders time badge for recipes with time fields', async () => {
    const recipeWithTime = makeRecipe({ recipeId: 'r1', name: 'Pasta Carbonara', prepTime: 10, cookTime: 20 });
    mockFetchRecipes.mockResolvedValue([recipeWithTime]);
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    // The badge text should be "30 min"
    const badge = screen.getByText('30 min');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', '30 minutes total');
  });

  it('renders no time badge for recipes without time fields', async () => {
    mockFetchRecipes.mockResolvedValue([sampleRecipes[0]]);
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    expect(screen.queryByText(/\d+ min$/)).not.toBeInTheDocument();
  });

  // ─── RecipeFilterPanel integration ───────────────────────────────────────────

  it('filter panel renders below the tag cloud and above the recipe list (Requirement 1.1)', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    render(
      <RecipeList
        {...defaultProps}
        allTags={['italian', 'soup']}
      />,
    );
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    // Get the container element
    const container = screen.getByRole('list').parentElement!;
    const tagCloud = screen.getByRole('group', { name: /filter by tag/i });
    const filterPanel = screen.getByRole('region', { name: /recipe filters/i });
    const recipeList = screen.getByRole('list');

    // Check DOM order: tagCloud < filterPanel < recipeList
    const position = (el: Element) =>
      Array.from(container.querySelectorAll('*')).indexOf(el);

    expect(position(tagCloud)).toBeLessThan(position(filterPanel));
    expect(position(filterPanel)).toBeLessThan(position(recipeList));
  });

  it('setting "Max prep time (min)" to "15" excludes recipes with prepTime > 15 and no prepTime (Requirements 2.1, 2.4)', async () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', name: 'Fast Prep', prepTime: 10 }),
      makeRecipe({ recipeId: 'r2', name: 'Slow Prep', prepTime: 20 }),
      makeRecipe({ recipeId: 'r3', name: 'No Prep Time' }), // no prepTime — excluded
    ];
    mockFetchRecipes.mockResolvedValue(recipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Fast Prep'));

    const prepInput = screen.getByLabelText(/max prep time/i);
    await user.clear(prepInput);
    await user.type(prepInput, '15');

    expect(screen.getByText('Fast Prep')).toBeInTheDocument();
    expect(screen.queryByText('Slow Prep')).not.toBeInTheDocument();
    expect(screen.queryByText('No Prep Time')).not.toBeInTheDocument();
  });

  it('setting "Max cook time (min)" excludes recipes with cookTime > limit and no cookTime (Requirements 3.1, 3.4)', async () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', name: 'Quick Cook', cookTime: 10 }),
      makeRecipe({ recipeId: 'r2', name: 'Long Cook', cookTime: 30 }),
      makeRecipe({ recipeId: 'r3', name: 'No Cook Time' }), // no cookTime — excluded
    ];
    mockFetchRecipes.mockResolvedValue(recipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Quick Cook'));

    const cookInput = screen.getByLabelText(/max cook time/i);
    await user.clear(cookInput);
    await user.type(cookInput, '20');

    expect(screen.getByText('Quick Cook')).toBeInTheDocument();
    expect(screen.queryByText('Long Cook')).not.toBeInTheDocument();
    expect(screen.queryByText('No Cook Time')).not.toBeInTheDocument();
  });

  it('setting "Max total time (min)" excludes accordingly using computeTotalTime (Requirements 4.1, 4.4, 4.5)', async () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', name: 'Short Total', prepTime: 5, cookTime: 10 }), // total=15
      makeRecipe({ recipeId: 'r2', name: 'Long Total', prepTime: 10, cookTime: 20 }), // total=30
      makeRecipe({ recipeId: 'r3', name: 'No Times' }), // undefined total — excluded
    ];
    mockFetchRecipes.mockResolvedValue(recipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Short Total'));

    const totalInput = screen.getByLabelText(/max total time/i);
    await user.clear(totalInput);
    await user.type(totalInput, '20');

    expect(screen.getByText('Short Total')).toBeInTheDocument();
    expect(screen.queryByText('Long Total')).not.toBeInTheDocument();
    expect(screen.queryByText('No Times')).not.toBeInTheDocument();
  });

  it('activating "Only recipes I can make now" with non-empty inventoryIndex excludes recipes with missing ingredients (Requirements 5.1, 5.3)', async () => {
    const inventoryIndex: InventoryIndex = new Map([['eggs', 6]]);
    const recipes = [
      makeRecipe({
        recipeId: 'r1',
        name: 'Egg Dish',
        ingredients: [{ name: 'Eggs', quantity: 3, unit: 'Unit' }],
      }),
      makeRecipe({
        recipeId: 'r2',
        name: 'Milk Dish',
        ingredients: [{ name: 'Milk', quantity: 1, unit: 'Liter' }],
      }),
    ];
    mockFetchRecipes.mockResolvedValue(recipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} inventoryIndex={inventoryIndex} />);
    await waitFor(() => screen.getByText('Egg Dish'));

    const toggle = screen.getByLabelText(/only recipes i can make now/i);
    await user.click(toggle);

    expect(screen.getByText('Egg Dish')).toBeInTheDocument();
    expect(screen.queryByText('Milk Dish')).not.toBeInTheDocument();
  });

  it('activating "Only recipes I can make now" with empty inventoryIndex excludes every recipe with at least one ingredient (Requirement 5.4)', async () => {
    const recipes = [
      makeRecipe({
        recipeId: 'r1',
        name: 'Has Ingredients',
        ingredients: [{ name: 'Flour', quantity: 1, unit: 'Kilo' }],
      }),
      makeRecipe({
        recipeId: 'r2',
        name: 'No Ingredients',
        ingredients: [],
      }),
    ];
    mockFetchRecipes.mockResolvedValue(recipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} inventoryIndex={new Map()} />);
    await waitFor(() => screen.getByText('Has Ingredients'));

    const toggle = screen.getByLabelText(/only recipes i can make now/i);
    await user.click(toggle);

    expect(screen.queryByText('Has Ingredients')).not.toBeInTheDocument();
    // Recipe with no ingredients passes vacuously
    expect(screen.getByText('No Ingredients')).toBeInTheDocument();
  });

  it('shows "No recipes match the selected filters." when recipes exist but filter produces empty result (Requirement 7.1)', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    // Set a maxPrepTime of 0 — all recipes have no prepTime so all are excluded
    const prepInput = screen.getByLabelText(/max prep time/i);
    await user.clear(prepInput);
    await user.type(prepInput, '0');

    expect(screen.getByText(/no recipes match the selected filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/no recipes yet/i)).not.toBeInTheDocument();
  });

  it('shows "No recipes yet." when recipes.length === 0 and does NOT show filter empty-result message (Requirement 7.2)', async () => {
    mockFetchRecipes.mockResolvedValue([]);
    render(<RecipeList {...defaultProps} />);
    await waitFor(() => screen.getByText(/no recipes yet/i));

    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/no recipes match the selected filters/i)).not.toBeInTheDocument();
  });

  it('combining name-search, active tag filter, and maxPrepTime applies all three (Requirements 6.1, 6.3)', async () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', name: 'Pasta Carbonara', tags: ['italian'], prepTime: 10 }),
      makeRecipe({ recipeId: 'r2', name: 'Pasta Primavera', tags: ['italian'], prepTime: 30 }),
      makeRecipe({ recipeId: 'r3', name: 'Chicken Soup', tags: ['soup'], prepTime: 10 }),
      makeRecipe({ recipeId: 'r4', name: 'Pasta Bake', tags: ['italian'], prepTime: 5 }),
    ];
    mockFetchRecipes.mockResolvedValue(recipes);
    const user = userEvent.setup();
    render(<RecipeList {...defaultProps} allTags={['italian', 'soup']} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    // 1. Type "pasta" in search
    await user.type(screen.getByRole('searchbox', { name: /search recipes/i }), 'pasta');

    // 2. Click the "italian" tag
    await user.click(screen.getByRole('button', { name: 'italian' }));

    // 3. Set maxPrepTime to 15
    const prepInput = screen.getByLabelText(/max prep time/i);
    await user.clear(prepInput);
    await user.type(prepInput, '15');

    // Only "Pasta Carbonara" (name matches "pasta", tag "italian", prepTime 10 <= 15)
    // and "Pasta Bake" (name matches "pasta", tag "italian", prepTime 5 <= 15) should remain
    // "Pasta Primavera" excluded by prepTime > 15
    // "Chicken Soup" excluded by name not matching "pasta"
    expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
    expect(screen.getByText('Pasta Bake')).toBeInTheDocument();
    expect(screen.queryByText('Pasta Primavera')).not.toBeInTheDocument();
    expect(screen.queryByText('Chicken Soup')).not.toBeInTheDocument();
  });
});
