import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import AddRecipeDialog from '../AddRecipeDialog';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../../api/meal-plans/meal-plans', () => ({
  fetchRecipesForPlanning: jest.fn(),
  createMealPlan: jest.fn(),
}));

jest.mock('../../../auth/cognitoClient/cognitoClient', () => ({
  getCurrentSession: jest.fn().mockResolvedValue({
    user: { userId: 'user-1', email: 'test@example.com' },
    tokens: { idToken: 'mock-id-token', accessToken: 'mock-access', refreshToken: 'mock-refresh' },
  }),
}));

jest.mock('../../../config', () => ({ API_URL: 'https://api.example.com' }));

import {
  fetchRecipesForPlanning,
  createMealPlan,
  type MealPlan,
} from '../../../api/meal-plans/meal-plans';

const mockFetchRecipesForPlanning = fetchRecipesForPlanning as jest.MockedFunction<
  typeof fetchRecipesForPlanning
>;
const mockCreateMealPlan = createMealPlan as jest.MockedFunction<typeof createMealPlan>;

// ─── Test data ────────────────────────────────────────────────────────────────

const testDate = '2025-06-02';

const mockRecipes = [
  { recipeId: 'r1', name: 'Oatmeal' },
  { recipeId: 'r2', name: 'Pasta' },
  { recipeId: 'r3', name: 'Salad' },
];

function makeMealPlan(overrides: Partial<MealPlan> = {}): MealPlan {
  return {
    planId: 'plan-1',
    date: testDate,
    mealType: 'breakfast',
    recipeId: 'r1',
    recipeName: 'Oatmeal',
    createdAt: '2025-06-02T08:00:00.000Z',
    updatedAt: '2025-06-02T08:00:00.000Z',
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderDialog(
  overrides: Partial<{ date: string; onAdd: jest.Mock; onClose: jest.Mock }> = {},
) {
  const props = {
    date: testDate,
    onAdd: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { ...render(<AddRecipeDialog {...props} />), ...props };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AddRecipeDialog — recipe fetch states', () => {
  it('shows loading state while fetching recipes (Req 6.2)', () => {
    // Keep the promise pending
    mockFetchRecipesForPlanning.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(screen.getByText('Loading recipes…')).toBeInTheDocument();
  });

  it('shows empty-state message and no confirm when no recipes found (Req 4.11, 6.4)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: [] });
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('No recipes found. Add some recipes first.')).toBeInTheDocument();
    });

    // Confirm button should be disabled when there are no recipes
    const confirmButton = screen.getByRole('button', { name: 'Add' });
    expect(confirmButton).toBeDisabled();
  });

  it('shows error message and retry button when recipe fetch fails (Req 6.5)', async () => {
    mockFetchRecipesForPlanning.mockRejectedValue(new Error('Failed to load recipes'));
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Failed to load recipes')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('does not show stale recipe list when in error state (Req 6.5)', async () => {
    // First call fails
    mockFetchRecipesForPlanning.mockRejectedValue(new Error('Network error'));
    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    // The recipe listbox (with recipe items) should not be present
    expect(screen.queryByRole('listbox', { name: 'Available recipes' })).not.toBeInTheDocument();
  });

  it('clicking retry re-fetches recipes', async () => {
    mockFetchRecipesForPlanning
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ recipes: mockRecipes });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
    });
  });

  it('shows recipe list when fetch succeeds (Req 4.2)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Pasta' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Salad' })).toBeInTheDocument();
    });
  });
});

describe('AddRecipeDialog — meal type selection', () => {
  it('default meal type is breakfast (Req 4.4)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    renderDialog();

    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: 'Meal' });
      expect(select).toHaveValue('breakfast');
    });
  });

  it('shows breakfast, lunch, and dinner options (Req 4.3)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    renderDialog();

    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: 'Meal' });
      const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
      expect(options).toContain('breakfast');
      expect(options).toContain('lunch');
      expect(options).toContain('dinner');
    });
  });
});

describe('AddRecipeDialog — validation', () => {
  it('shows validation message and does not call createMealPlan when no recipe selected (Req 4.6)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
    });

    // Click Add without selecting a recipe
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Please select a recipe before confirming.')).toBeInTheDocument();
    expect(mockCreateMealPlan).not.toHaveBeenCalled();
  });
});

describe('AddRecipeDialog — confirm flow', () => {
  it('calling confirm with selected recipe calls createMealPlan (Req 4.5)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    mockCreateMealPlan.mockResolvedValue({ mealPlan: makeMealPlan() });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('option', { name: 'Oatmeal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockCreateMealPlan).toHaveBeenCalledWith({
        date: testDate,
        mealType: 'breakfast',
        recipeId: 'r1',
        recipeName: 'Oatmeal',
      });
    });
  });

  it('calls onAdd with the new MealPlan on success (Req 4.7)', async () => {
    const newPlan = makeMealPlan({ planId: 'plan-new' });
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    mockCreateMealPlan.mockResolvedValue({ mealPlan: newPlan });

    const { onAdd } = renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('option', { name: 'Oatmeal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(newPlan);
    });
  });
});

describe('AddRecipeDialog — dismiss', () => {
  it('clicking Cancel calls onClose without API call (Req 4.8)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    const { onClose } = renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockCreateMealPlan).not.toHaveBeenCalled();
  });

  it('clicking the close (×) button calls onClose without API call (Req 4.8)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    const { onClose } = renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockCreateMealPlan).not.toHaveBeenCalled();
  });
});

describe('AddRecipeDialog — submit error', () => {
  it('failed createMealPlan shows error and keeps dialog open with retained selection (Req 4.9)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    mockCreateMealPlan.mockRejectedValue(new Error('Server error'));

    const { onAdd } = renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
    });

    // Select a recipe
    await userEvent.click(screen.getByRole('option', { name: 'Oatmeal' }));

    // Confirm
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    // Dialog still open
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // onAdd not called
    expect(onAdd).not.toHaveBeenCalled();

    // Selection retained: the recipe item should still be shown as selected
    expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
  });

  it('shows fallback error message when createMealPlan throws non-Error (Req 4.9)', async () => {
    mockFetchRecipesForPlanning.mockResolvedValue({ recipes: mockRecipes });
    mockCreateMealPlan.mockRejectedValue('string error');

    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Oatmeal' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('option', { name: 'Oatmeal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to save assignment. Please try again.')).toBeInTheDocument();
    });
  });
});
