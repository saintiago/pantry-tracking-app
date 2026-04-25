import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import RecipeList from '../RecipeList';
import * as recipesApi from '../../../api/recipes/recipes';
import type { Recipe } from '../../../api/recipes/recipes';

jest.mock('../../../api/recipes/recipes');

const mockFetchRecipes = recipesApi.fetchRecipes as jest.MockedFunction<typeof recipesApi.fetchRecipes>;

function makeRecipe(overrides: Partial<Recipe> & { recipeId: string; name: string }): Recipe {
  return {
    userId: 'user-1',
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state while fetching', () => {
    mockFetchRecipes.mockReturnValue(new Promise(() => {})); // never resolves
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    expect(screen.getByRole('status', { name: /loading recipes/i })).toBeInTheDocument();
  });

  it('renders recipe list after fetch', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument());
    expect(screen.getByText('Chicken Soup')).toBeInTheDocument();
    expect(screen.getByText('Banana Bread')).toBeInTheDocument();
  });

  it('shows empty state when no recipes exist', async () => {
    mockFetchRecipes.mockResolvedValue([]);
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument());
  });

  it('shows error message on fetch failure', async () => {
    mockFetchRecipes.mockRejectedValue(new Error('Network error'));
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });

  it('calls onNew when New Recipe button is clicked', async () => {
    mockFetchRecipes.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => screen.getByRole('button', { name: /new recipe/i }));
    await user.click(screen.getByRole('button', { name: /new recipe/i }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect with recipeId when a recipe row is clicked', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    const user = userEvent.setup();
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));
    await user.click(screen.getByRole('button', { name: /view pasta carbonara/i }));
    expect(onSelect).toHaveBeenCalledWith('r1');
  });

  it('filters recipes by search input (case-insensitive)', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    const user = userEvent.setup();
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    await user.type(screen.getByRole('searchbox', { name: /search recipes/i }), 'chicken');

    expect(screen.getByText('Chicken Soup')).toBeInTheDocument();
    expect(screen.queryByText('Pasta Carbonara')).not.toBeInTheDocument();
    expect(screen.queryByText('Banana Bread')).not.toBeInTheDocument();
  });

  it('shows empty search state when no recipes match filter', async () => {
    mockFetchRecipes.mockResolvedValue(sampleRecipes);
    const user = userEvent.setup();
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    await user.type(screen.getByRole('searchbox', { name: /search recipes/i }), 'zzznomatch');

    expect(screen.getByText(/no recipes match your search/i)).toBeInTheDocument();
  });

  it('shows missing-ingredient badge when missingCount > 0', async () => {
    const recipeWithMissing = { ...sampleRecipes[0], missingCount: 2 } as Recipe & { missingCount: number };
    mockFetchRecipes.mockResolvedValue([recipeWithMissing, sampleRecipes[1]]);
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    expect(screen.getByLabelText(/2 ingredient\(s\) missing/i)).toBeInTheDocument();
    // Second recipe has no missingCount — no badge
    expect(screen.queryAllByLabelText(/ingredient\(s\) missing/i)).toHaveLength(1);
  });

  it('does not show missing-ingredient badge when missingCount is 0', async () => {
    const recipeNoMissing = { ...sampleRecipes[0], missingCount: 0 } as Recipe & { missingCount: number };
    mockFetchRecipes.mockResolvedValue([recipeNoMissing]);
    render(<RecipeList onSelect={onSelect} onNew={onNew} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));

    expect(screen.queryByLabelText(/ingredient\(s\) missing/i)).not.toBeInTheDocument();
  });
});
