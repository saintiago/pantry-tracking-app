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

// Restore the real computeTotalTime since it's a pure function
const { computeTotalTime: realComputeTotalTime } = jest.requireActual('../../../api/recipes/recipes');
const recipesApiModule = jest.requireMock('../../../api/recipes/recipes');
recipesApiModule.computeTotalTime = realComputeTotalTime;

const mockFetchRecipeWithAvailability = recipesApi.fetchRecipeWithAvailability as jest.MockedFunction<
  typeof recipesApi.fetchRecipeWithAvailability
>;
const mockDeleteRecipe = recipesApi.deleteRecipe as jest.MockedFunction<typeof recipesApi.deleteRecipe>;

const sampleData: RecipeWithAvailability = {
  recipe: {
    recipeId: 'r1',
    userId: 'user-1',
    name: 'Pasta Carbonara',
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
});
