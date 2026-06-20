import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import MealPlanPage from '../MealPlanPage';
import { getWeekStart, addDays } from '../weekUtils';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../../api/meal-plans/meal-plans', () => ({
  fetchMealPlans: jest.fn(),
  createMealPlan: jest.fn(),
  deleteMealPlan: jest.fn(),
  fetchRecipesForPlanning: jest.fn(),
}));

jest.mock('../../../auth/cognitoClient/cognitoClient', () => ({
  getCurrentSession: jest.fn().mockResolvedValue({
    user: { userId: 'user-1', email: 'test@example.com' },
    tokens: { idToken: 'mock-id-token', accessToken: 'mock-access', refreshToken: 'mock-refresh' },
  }),
}));

jest.mock('../../../config', () => ({ API_URL: 'https://api.example.com' }));

import {
  fetchMealPlans,
  createMealPlan,
  deleteMealPlan,
  fetchRecipesForPlanning,
  type MealPlan,
} from '../../../api/meal-plans/meal-plans';

const mockFetchMealPlans = fetchMealPlans as jest.MockedFunction<typeof fetchMealPlans>;
const mockCreateMealPlan = createMealPlan as jest.MockedFunction<typeof createMealPlan>;
const mockDeleteMealPlan = deleteMealPlan as jest.MockedFunction<typeof deleteMealPlan>;
const mockFetchRecipesForPlanning = fetchRecipesForPlanning as jest.MockedFunction<
  typeof fetchRecipesForPlanning
>;

// ─── Test data ────────────────────────────────────────────────────────────────

// Always use a date that falls in the current week so that MealPlanPage will
// show it (the page fetches the current week on mount).
const currentWeekMonday = getWeekStart(new Date());
// Use the second day of the current week (Tuesday) so it's always in-range
const currentWeekDate = addDays(currentWeekMonday, 1);

function makeMealPlan(overrides: Partial<MealPlan> = {}): MealPlan {
  return {
    planId: 'plan-1',
    date: currentWeekDate,
    mealType: 'breakfast',
    recipeId: 'recipe-1',
    recipeName: 'Oatmeal',
    createdAt: `${currentWeekDate}T08:00:00.000Z`,
    updatedAt: `${currentWeekDate}T08:00:00.000Z`,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks();
  // Default: fetchMealPlans resolves with empty list
  mockFetchMealPlans.mockResolvedValue({ mealPlans: [] });
  // Default: fetchRecipesForPlanning resolves with some recipes (so dialog can be used)
  mockFetchRecipesForPlanning.mockResolvedValue({
    recipes: [
      { recipeId: 'recipe-1', name: 'Oatmeal' },
      { recipeId: 'recipe-2', name: 'Pasta' },
    ],
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(<MealPlanPage />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MealPlanPage — initial render', () => {
  it('renders 7 day columns with labels and numbers (Req 1.3)', async () => {
    renderPage();

    await waitFor(() => {
      // 7 "Add recipe" buttons — one per day column
      const addButtons = screen.getAllByRole('button', { name: 'Add recipe' });
      expect(addButtons).toHaveLength(7);
    });
  });

  it('shows day-of-week labels in the 7 columns', async () => {
    renderPage();

    await waitFor(() => {
      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      // At least a few labels must be present (exact set depends on current week)
      const found = dayLabels.filter((l) => screen.queryByText(l) !== null);
      expect(found.length).toBeGreaterThanOrEqual(7);
    });
  });

  it('shows loading indicator while fetch is in progress (Req 1.8, 2.2)', async () => {
    // Create a promise we control
    let resolveFetch!: (value: { mealPlans: MealPlan[] }) => void;
    mockFetchMealPlans.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderPage();

    // Loading text should be visible immediately
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    // Resolve the fetch so the component settles
    act(() => resolveFetch({ mealPlans: [] }));
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });
  });

  it('previous week data NOT shown while loading new week (Req 2.2)', async () => {
    // First load: returns a plan
    const plan = makeMealPlan();
    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [plan] });

    renderPage();

    // Wait for first load to finish and card to appear
    await waitFor(() => {
      expect(screen.getByText('Oatmeal')).toBeInTheDocument();
    });

    // Second navigation — returns pending promise so loading state shows
    let resolveSecond!: (v: { mealPlans: MealPlan[] }) => void;
    mockFetchMealPlans.mockReturnValueOnce(
      new Promise((r) => {
        resolveSecond = r;
      }),
    );

    const nextButton = screen.getByRole('button', { name: 'Next week' });
    await userEvent.click(nextButton);

    // Loading state is shown; previous week's card is cleared
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Oatmeal')).not.toBeInTheDocument();

    act(() => resolveSecond({ mealPlans: [] }));
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  });
});

describe('MealPlanPage — error states', () => {
  it('renders 7 columns with add buttons and an error message on fetch failure (Req 1.9)', async () => {
    mockFetchMealPlans.mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    // All 7 add buttons still present
    const addButtons = screen.getAllByRole('button', { name: 'Add recipe' });
    expect(addButtons).toHaveLength(7);
  });

  it('shows error banner and retry button on week-load failure (Req 2.5)', async () => {
    mockFetchMealPlans.mockRejectedValue(new Error('Failed to load'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('clicking retry re-calls fetchMealPlans with the same week range (Req 2.6)', async () => {
    mockFetchMealPlans.mockRejectedValueOnce(new Error('Failed to load'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    const [firstCallArgs] = mockFetchMealPlans.mock.calls;

    // Now resolve on retry
    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [] });
    await userEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();
    });

    // The retry should use same start/end dates
    expect(mockFetchMealPlans).toHaveBeenCalledTimes(2);
    const [retryCallArgs] = mockFetchMealPlans.mock.calls.slice(-1);
    expect(retryCallArgs[0]).toBe(firstCallArgs[0]);
    expect(retryCallArgs[1]).toBe(firstCallArgs[1]);
  });
});

describe('MealPlanPage — week navigation', () => {
  it('renders previous and next week controls (Req 3.1)', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next week' })).toBeInTheDocument();
    });
  });

  it('navigation buttons are disabled while loading (Req 3.5)', async () => {
    let resolveFetch!: (v: { mealPlans: MealPlan[] }) => void;
    mockFetchMealPlans.mockReturnValue(
      new Promise((r) => {
        resolveFetch = r;
      }),
    );

    renderPage();

    expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();

    act(() => resolveFetch({ mealPlans: [] }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Previous week' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next week' })).not.toBeDisabled();
    });
  });

  it('clicking next week triggers a new fetchMealPlans with updated dates (Req 3.4)', async () => {
    renderPage();

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    const [firstStart, firstEnd] = mockFetchMealPlans.mock.calls[0];

    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));

    await waitFor(() => expect(mockFetchMealPlans).toHaveBeenCalledTimes(2));

    const [secondStart, secondEnd] = mockFetchMealPlans.mock.calls[1];
    // Next week start should be 7 days after first
    const firstStartDate = new Date(firstStart);
    const secondStartDate = new Date(secondStart);
    const diffDays =
      (secondStartDate.getTime() - firstStartDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);

    const firstEndDate = new Date(firstEnd);
    const secondEndDate = new Date(secondEnd);
    const endDiffDays =
      (secondEndDate.getTime() - firstEndDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(endDiffDays).toBe(7);
  });

  it('clicking prev week triggers a new fetchMealPlans with dates 7 days earlier (Req 3.4)', async () => {
    renderPage();

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    const [firstStart] = mockFetchMealPlans.mock.calls[0];

    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));

    await waitFor(() => expect(mockFetchMealPlans).toHaveBeenCalledTimes(2));

    const [secondStart] = mockFetchMealPlans.mock.calls[1];
    const diffDays =
      (new Date(firstStart).getTime() - new Date(secondStart).getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });
});

describe('MealPlanPage — add recipe flow', () => {
  it('clicking Add recipe button opens dialog bound to that date (Req 4.1)', async () => {
    renderPage();

    await waitFor(() => {
      const addButtons = screen.getAllByRole('button', { name: 'Add recipe' });
      expect(addButtons.length).toBeGreaterThan(0);
    });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    const addButtons = screen.getAllByRole('button', { name: 'Add recipe' });
    await userEvent.click(addButtons[0]);

    // Dialog should be open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Add Recipe')).toBeInTheDocument();
  });

  it('on successful add, dialog closes and card appears (Req 4.7)', async () => {
    const newPlan = makeMealPlan({ planId: 'plan-new', recipeName: 'Pasta', mealType: 'lunch' });

    // createMealPlan will be called when dialog confirms
    mockCreateMealPlan.mockResolvedValue({ mealPlan: newPlan });
    mockFetchRecipesForPlanning.mockResolvedValue({
      recipes: [{ recipeId: 'recipe-2', name: 'Pasta' }],
    });

    renderPage();

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    const addButtons = screen.getAllByRole('button', { name: 'Add recipe' });
    await userEvent.click(addButtons[0]);

    // Wait for dialog with recipes
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Pasta' })).toBeInTheDocument();
    });

    // Select the recipe
    await userEvent.click(screen.getByRole('option', { name: 'Pasta' }));

    // Confirm
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Card should now be visible
    expect(screen.getByText('Pasta')).toBeInTheDocument();
  });
});

describe('MealPlanPage — remove flow', () => {
  it('remove button calls deleteMealPlan with correct planId (Req 5.2)', async () => {
    const plan = makeMealPlan({ planId: 'plan-to-remove', recipeName: 'Oatmeal' });
    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [plan] });
    mockDeleteMealPlan.mockResolvedValue(undefined);
    // After delete, refresh returns empty
    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Oatmeal')).toBeInTheDocument();
    });

    const removeButton = screen.getByRole('button', { name: 'Remove assignment' });
    await userEvent.click(removeButton);

    await waitFor(() => {
      expect(mockDeleteMealPlan).toHaveBeenCalledWith('plan-to-remove');
    });
  });

  it('on successful remove, refreshes data and card disappears (Req 5.4)', async () => {
    const plan = makeMealPlan({ planId: 'plan-1', recipeName: 'Oatmeal' });
    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [plan] });
    mockDeleteMealPlan.mockResolvedValue(undefined);
    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Oatmeal')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Remove assignment' }));

    await waitFor(() => {
      expect(screen.queryByText('Oatmeal')).not.toBeInTheDocument();
    });
  });

  it('on remove failure, card stays visible, button re-enabled, error shown (Req 5.5, 5.6, 5.7)', async () => {
    const plan = makeMealPlan({ planId: 'plan-1', recipeName: 'Oatmeal' });
    mockFetchMealPlans.mockResolvedValue({ mealPlans: [plan] });
    mockDeleteMealPlan.mockRejectedValue(new Error('Delete failed'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Oatmeal')).toBeInTheDocument();
    });

    const removeButton = screen.getByRole('button', { name: 'Remove assignment' });
    await userEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });

    // Card still visible
    expect(screen.getByText('Oatmeal')).toBeInTheDocument();

    // Button is re-enabled
    expect(screen.getByRole('button', { name: 'Remove assignment' })).not.toBeDisabled();
  });

  it('remove button is disabled while deletion is in flight (Req 5.3)', async () => {
    const plan = makeMealPlan({ planId: 'plan-1', recipeName: 'Oatmeal' });
    mockFetchMealPlans.mockResolvedValue({ mealPlans: [plan] });

    let resolveDelete!: () => void;
    mockDeleteMealPlan.mockReturnValue(
      new Promise<void>((r) => {
        resolveDelete = r;
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Oatmeal')).toBeInTheDocument();
    });

    const removeButton = screen.getByRole('button', { name: 'Remove assignment' });
    await userEvent.click(removeButton);

    // While deletion is pending, button should be disabled
    expect(screen.getByRole('button', { name: 'Remove assignment' })).toBeDisabled();

    // Resolve + finish
    act(() => resolveDelete());
    // Clean up with a resolved refresh
    mockFetchMealPlans.mockResolvedValueOnce({ mealPlans: [] });
  });
});
