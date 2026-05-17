import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipesPage from '../RecipesPage';

jest.mock('../../../api/recipes/recipes', () => ({
  ...jest.requireActual('../../../api/recipes/recipes'),
  fetchRecipes: jest.fn(),
  fetchRecipeTags: jest.fn(),
}));

import { fetchRecipes, fetchRecipeTags } from '../../../api/recipes/recipes';

const mockFetchRecipes = fetchRecipes as jest.MockedFunction<typeof fetchRecipes>;
const mockFetchRecipeTags = fetchRecipeTags as jest.MockedFunction<typeof fetchRecipeTags>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchRecipes.mockResolvedValue([]);
  mockFetchRecipeTags.mockResolvedValue(['italian', 'quick']);
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
});
