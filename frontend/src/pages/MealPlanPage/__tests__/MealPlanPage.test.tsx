import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import MealPlanPage from '../MealPlanPage';
import {
  fetchPlannerWorkspace,
  changePlanner,
  reconcilePlanner,
} from '../../../api/meal-plans/workspace';
import { fetchRecipesForPlanning } from '../../../api/meal-plans/meal-plans';
import { getWeekStart } from '../weekUtils';
import type { PlannerSnapshot, PlannerChange } from '@pantry/domain';
jest.mock('../../../api/meal-plans/workspace', () => ({
  fetchPlannerWorkspace: jest.fn(),
  changePlanner: jest.fn(),
  reconcilePlanner: jest.fn(),
}));
jest.mock('../../../api/meal-plans/meal-plans', () => ({ fetchRecipesForPlanning: jest.fn() }));
jest.mock('../../../config', () => ({ API_URL: 'https://api.example.com' }));
const date = getWeekStart(new Date());
let state: PlannerSnapshot;
beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(global.crypto, 'randomUUID', {
    configurable: true,
    value: () => 'operation-id',
  });
  state = {
    contractVersion: 2,
    revision: 1,
    batches: [],
    favorites: [],
    mealPlans: [
      {
        planId: 'meal',
        recipeId: 'rice',
        recipeName: 'Rice',
        date,
        mealType: 'dinner',
        servings: 2,
        createdAt: '',
        updatedAt: '',
      },
    ],
  };
  jest.mocked(fetchPlannerWorkspace).mockImplementation(async () => state);
  jest.mocked(fetchRecipesForPlanning).mockResolvedValue({
    recipes: [{ recipeId: 'rice', name: 'Rice', portions: 4, totalKcal: 1600 }],
  });
  jest.mocked(changePlanner).mockImplementation(async (change: PlannerChange) => {
    state = {
      ...state,
      revision: state.revision + 1,
      mealPlans: [
        ...state.mealPlans.filter(
          (e) =>
            !change.removeIds?.includes(e.planId) &&
            !change.entries?.some((n) => n.planId === e.planId),
        ),
        ...(change.entries ?? []),
      ],
    };
    return state;
  });
  jest.mocked(reconcilePlanner).mockImplementation(async () => state);
});
test('loads cloud state and derives calorie totals from recipe yield', async () => {
  render(<MealPlanPage />);
  await screen.findByLabelText(`Remove Rice from ${date} dinner`);
  expect(fetchPlannerWorkspace).toHaveBeenCalled();
  expect(screen.getByText('kcal per person: 400')).toBeInTheDocument();
  expect(screen.getByText('All planned portions: 800 kcal')).toBeInTheDocument();
});
test('X removes only the saved assignment and Undo restores its identity', async () => {
  render(<MealPlanPage />);
  await userEvent.click(await screen.findByLabelText(`Remove Rice from ${date} dinner`));
  await waitFor(() =>
    expect(screen.queryByLabelText(`Remove Rice from ${date} dinner`)).not.toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await screen.findByLabelText(`Remove Rice from ${date} dinner`);
  expect(state.mealPlans[0].planId).toBe('meal');
});
test('uncertain removal retains the card, blocks duplicate operations and retries the same operation ID', async () => {
  jest.mocked(changePlanner).mockRejectedValueOnce(new Error('Connection lost'));
  render(<MealPlanPage />);
  await userEvent.click(await screen.findByLabelText(`Remove Rice from ${date} dinner`));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  expect(screen.getByLabelText(`Remove Rice from ${date} dinner`)).toBeDisabled();
  const original = jest.mocked(changePlanner).mock.calls[0][0];
  await userEvent.click(screen.getByRole('button', { name: 'Retry pending save' }));
  await waitFor(() => expect(changePlanner).toHaveBeenCalledTimes(2));
  expect(jest.mocked(changePlanner).mock.calls[1][0]).toEqual(original);
});
test('load failure has a working retry and does not claim an empty saved plan', async () => {
  jest.mocked(fetchPlannerWorkspace).mockRejectedValueOnce(new Error('Cannot load'));
  render(<MealPlanPage />);
  await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Cannot load'));
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByLabelText(`Remove Rice from ${date} dinner`);
});
test('day/week navigation preserves data and filter inputs without unnecessary cloud writes', async () => {
  render(<MealPlanPage />);
  await screen.findByLabelText(`Remove Rice from ${date} dinner`);
  await userEvent.type(screen.getByRole('searchbox'), 'ric');
  await userEvent.click(screen.getByRole('button', { name: 'Day' }));
  expect(document.querySelectorAll('[data-date]')).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
  expect(screen.getByRole('searchbox')).toHaveValue('ric');
  expect(changePlanner).not.toHaveBeenCalled();
});
