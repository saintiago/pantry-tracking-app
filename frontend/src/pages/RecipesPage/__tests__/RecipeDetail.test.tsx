import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import RecipeDetail from '../RecipeDetail';
import * as recipesApi from '../../../api/recipes/recipes';
import type { RecipeWithAvailability } from '../../../api/recipes/recipes';

jest.mock('../../../api/recipes/recipes');
jest.mock('../IngredientAvailability', () => ({
  __esModule: true,
  default: () => <div data-testid="ingredient-availability" />,
}));

// Restore the real computeTotalTime and scaleIngredients since they are pure functions
const { computeTotalTime: realComputeTotalTime, scaleIngredients: realScaleIngredients } = jest.requireActual('../../../api/recipes/recipes');
const recipesApiModule = jest.requireMock('../../../api/recipes/recipes');
recipesApiModule.computeTotalTime = realComputeTotalTime;
recipesApiModule.scaleIngredients = realScaleIngredients;

const mockFetchRecipeWithAvailability = recipesApi.fetchRecipeWithAvailability as jest.MockedFunction<
  typeof recipesApi.fetchRecipeWithAvailability
>;
const mockDeleteRecipe = recipesApi.deleteRecipe as jest.MockedFunction<typeof recipesApi.deleteRecipe>;

const sampleData: RecipeWithAvailability = {
  recipe: {
    recipeId: 'r1',
    userId: 'user-1',
    name: 'Pasta Carbonara',
    tags: [],
    ingredients: [],
    instructions: 'Boil pasta. Mix eggs and cheese. Combine.',
    sourceUrl: 'https://example.com/pasta',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncVersion: 1,
  },
  ingredientAvailability: [],
  missingCount: 0,
};

const defaultProps = {
  recipeId: 'r1',
  onEdit: jest.fn(),
  onBack: jest.fn(),
  onDeleted: jest.fn(),
};

describe('RecipeDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state while fetching', () => {
    mockFetchRecipeWithAvailability.mockReturnValue(new Promise(() => {}));
    render(<RecipeDetail {...defaultProps} />);
    expect(screen.getByText(/loading recipe/i)).toBeInTheDocument();
  });

  it('renders recipe name and instructions after fetch', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument());
    expect(screen.getByText('Boil pasta. Mix eggs and cheese. Combine.')).toBeInTheDocument();
  });

  it('renders source URL link with target="_blank" rel="noopener noreferrer" when sourceUrl is present', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));
    const link = screen.getByRole('link', { name: /view original recipe/i });
    expect(link).toHaveAttribute('href', 'https://example.com/pasta');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does NOT render source URL link when sourceUrl is absent', async () => {
    const dataWithoutUrl: RecipeWithAvailability = {
      ...sampleData,
      recipe: { ...sampleData.recipe, sourceUrl: undefined },
    };
    mockFetchRecipeWithAvailability.mockResolvedValue(dataWithoutUrl);
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByText('Pasta Carbonara'));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders IngredientAvailability component', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByTestId('ingredient-availability'));
    expect(screen.getByTestId('ingredient-availability')).toBeInTheDocument();
  });

  it('edit button calls onEdit', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    const user = userEvent.setup();
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByTestId('edit-button'));
    await user.click(screen.getByTestId('edit-button'));
    expect(defaultProps.onEdit).toHaveBeenCalledTimes(1);
  });

  it('back button calls onBack', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    const user = userEvent.setup();
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByRole('button', { name: /go back/i }));
    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  it('delete button shows confirmation dialog', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByTestId('delete-button'));
    await user.click(screen.getByTestId('delete-button'));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('when confirm is accepted: calls deleteRecipe and then onDeleted', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    mockDeleteRecipe.mockResolvedValue(undefined);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByTestId('delete-button'));
    await user.click(screen.getByTestId('delete-button'));
    await waitFor(() => expect(defaultProps.onDeleted).toHaveBeenCalledTimes(1));
    expect(mockDeleteRecipe).toHaveBeenCalledWith('r1');
    confirmSpy.mockRestore();
  });

  it('when confirm is cancelled: does NOT call deleteRecipe', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByTestId('delete-button'));
    await user.click(screen.getByTestId('delete-button'));
    expect(mockDeleteRecipe).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows error banner when deleteRecipe fails', async () => {
    mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
    mockDeleteRecipe.mockRejectedValue(new Error('Delete failed'));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByTestId('delete-button'));
    await user.click(screen.getByTestId('delete-button'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Delete failed');
    confirmSpy.mockRestore();
  });

  it('shows error state when fetch fails', async () => {
    mockFetchRecipeWithAvailability.mockRejectedValue(new Error('Network error'));
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  // ─── Time display ─────────────────────────────────────────────────────────────

  describe('time display', () => {
    it('renders total time when only prepTime is set', async () => {
      const data: RecipeWithAvailability = {
        ...sampleData,
        recipe: { ...sampleData.recipe, prepTime: 15 },
      };
      mockFetchRecipeWithAvailability.mockResolvedValue(data);
      render(<RecipeDetail {...defaultProps} />);
      await waitFor(() => screen.getByRole('region', { name: /recipe time/i }));
      expect(screen.getByText(/total: 15 min/i)).toBeInTheDocument();
    });

    it('renders total time when only cookTime is set', async () => {
      const data: RecipeWithAvailability = {
        ...sampleData,
        recipe: { ...sampleData.recipe, cookTime: 30 },
      };
      mockFetchRecipeWithAvailability.mockResolvedValue(data);
      render(<RecipeDetail {...defaultProps} />);
      await waitFor(() => screen.getByRole('region', { name: /recipe time/i }));
      expect(screen.getByText(/total: 30 min/i)).toBeInTheDocument();
    });

    it('renders prepTime, cookTime, and total when both are set', async () => {
      const data: RecipeWithAvailability = {
        ...sampleData,
        recipe: { ...sampleData.recipe, prepTime: 10, cookTime: 20 },
      };
      mockFetchRecipeWithAvailability.mockResolvedValue(data);
      render(<RecipeDetail {...defaultProps} />);
      await waitFor(() => screen.getByRole('region', { name: /recipe time/i }));
      expect(screen.getByText(/prep: 10 min/i)).toBeInTheDocument();
      expect(screen.getByText(/cook: 20 min/i)).toBeInTheDocument();
      expect(screen.getByText(/total: 30 min/i)).toBeInTheDocument();
    });

    it('renders no time section when neither field is set', async () => {
      mockFetchRecipeWithAvailability.mockResolvedValue(sampleData);
      render(<RecipeDetail {...defaultProps} />);
      await waitFor(() => screen.getByText('Pasta Carbonara'));
      expect(screen.queryByRole('region', { name: /recipe time/i })).not.toBeInTheDocument();
    });
  });

  // ─── Tags ────────────────────────────────────────────────────────────────────

  describe('tags', () => {
    it('renders tag chips for a recipe with tags', async () => {
      const data: RecipeWithAvailability = {
        ...sampleData,
        recipe: { ...sampleData.recipe, tags: ['italian', 'quick'] },
      };
      mockFetchRecipeWithAvailability.mockResolvedValue(data);
      render(<RecipeDetail {...defaultProps} />);
      await waitFor(() => screen.getByRole('region', { name: /recipe tags/i }));
      expect(screen.getByText('italian')).toBeInTheDocument();
      expect(screen.getByText('quick')).toBeInTheDocument();
    });

    it('does not render tags section when recipe has no tags (empty array)', async () => {
      const data: RecipeWithAvailability = {
        ...sampleData,
        recipe: { ...sampleData.recipe, tags: [] },
      };
      mockFetchRecipeWithAvailability.mockResolvedValue(data);
      render(<RecipeDetail {...defaultProps} />);
      await waitFor(() => screen.getByText('Pasta Carbonara'));
      expect(screen.queryByRole('region', { name: /recipe tags/i })).not.toBeInTheDocument();
    });

    it('does not render tags section when recipe.tags is undefined (legacy records)', async () => {
      const data: RecipeWithAvailability = {
        ...sampleData,
        recipe: { ...sampleData.recipe, tags: undefined as unknown as string[] },
      };
      mockFetchRecipeWithAvailability.mockResolvedValue(data);
      render(<RecipeDetail {...defaultProps} />);
      await waitFor(() => screen.getByText('Pasta Carbonara'));
      expect(screen.queryByRole('region', { name: /recipe tags/i })).not.toBeInTheDocument();
    });

    it('chips have no remove button (read-only display)', async () => {
      const data: RecipeWithAvailability = {
        ...sampleData,
        recipe: { ...sampleData.recipe, tags: ['italian'] },
      };
      mockFetchRecipeWithAvailability.mockResolvedValue(data);
      render(<RecipeDetail {...defaultProps} />);
      await waitFor(() => screen.getByText('italian'));
      expect(screen.queryByRole('button', { name: /remove tag/i })).not.toBeInTheDocument();
    });
  });
});

describe('RecipeDetail — portions scaler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders +/– buttons and the selectedPortions value', async () => {
    const data: RecipeWithAvailability = {
      ...sampleData,
      recipe: { ...sampleData.recipe, portions: 4 },
    };
    mockFetchRecipeWithAvailability.mockResolvedValue(data);
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByRole('region', { name: /portions/i }));
    expect(screen.getByRole('button', { name: /increase portions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decrease portions/i })).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('initialises selectedPortions to recipe.portions', async () => {
    const data: RecipeWithAvailability = {
      ...sampleData,
      recipe: { ...sampleData.recipe, portions: 3 },
    };
    mockFetchRecipeWithAvailability.mockResolvedValue(data);
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByRole('region', { name: /portions/i }));
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('disables – button when selectedPortions is 1', async () => {
    const data: RecipeWithAvailability = {
      ...sampleData,
      recipe: { ...sampleData.recipe, portions: 1 },
    };
    mockFetchRecipeWithAvailability.mockResolvedValue(data);
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByRole('region', { name: /portions/i }));
    expect(screen.getByRole('button', { name: /decrease portions/i })).toBeDisabled();
  });

  it('does not call fetch when +/– is tapped', async () => {
    const data: RecipeWithAvailability = {
      ...sampleData,
      recipe: { ...sampleData.recipe, portions: 2 },
    };
    mockFetchRecipeWithAvailability.mockResolvedValue(data);
    const user = userEvent.setup();
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByRole('region', { name: /portions/i }));
    await user.click(screen.getByRole('button', { name: /increase portions/i }));
    expect(mockFetchRecipeWithAvailability).toHaveBeenCalledTimes(1);
  });

  it('displays scaled ingredient quantities when selectedPortions differs from recipe.portions', async () => {
    const data: RecipeWithAvailability = {
      ...sampleData,
      recipe: {
        ...sampleData.recipe,
        portions: 2,
        ingredients: [{ name: 'Flour', quantity: 100, unit: 'Gram' }],
      },
    };
    mockFetchRecipeWithAvailability.mockResolvedValue(data);
    const user = userEvent.setup();
    render(<RecipeDetail {...defaultProps} />);
    await waitFor(() => screen.getByRole('region', { name: /portions/i }));
    await user.click(screen.getByRole('button', { name: /increase portions/i }));
    // 100 * (3/2) = 150
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });
});
