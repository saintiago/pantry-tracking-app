import {
  fetchMealPlans,
  createMealPlan,
  deleteMealPlan,
  fetchRecipesForPlanning,
  type MealPlan,
  type CreateMealPlanInput,
} from '../meal-plans';

jest.mock('../../../config', () => ({
  API_URL: 'https://api.example.com',
}));

jest.mock('../../../auth/cognitoClient/cognitoClient', () => ({
  getCurrentSession: jest.fn(),
}));

import { getCurrentSession } from '../../../auth/cognitoClient/cognitoClient';

const mockGetCurrentSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

const mockSession = {
  user: { userId: 'user-1', email: 'test@example.com' },
  tokens: {
    idToken: 'mock-id-token',
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  },
};

const expectedHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer mock-id-token',
};

const mockMealPlan: MealPlan = {
  planId: 'plan-1',
  date: '2025-06-01',
  mealType: 'breakfast',
  recipeId: 'recipe-1',
  recipeName: 'Oatmeal',
  createdAt: '2025-06-01T08:00:00.000Z',
  updatedAt: '2025-06-01T08:00:00.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
  mockGetCurrentSession.mockResolvedValue(mockSession);
  global.fetch = jest.fn();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const mockFetch = () => global.fetch as jest.MockedFunction<typeof fetch>;

// ─── fetchMealPlans ───────────────────────────────────────────────────────────

describe('fetchMealPlans', () => {
  it('sends GET /meal-plans with encoded startDate and endDate query params', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ mealPlans: [mockMealPlan] }),
    } as Response);

    const result = await fetchMealPlans('2025-06-01', '2025-06-07');

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/meal-plans?startDate=2025-06-01&endDate=2025-06-07',
      expect.objectContaining({ headers: expectedHeaders }),
    );
    expect(result).toEqual({ mealPlans: [mockMealPlan] });
  });

  it('percent-encodes special characters in date params', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ mealPlans: [] }),
    } as Response);

    // encodeURIComponent turns '+' into '%2B — verify encoding is applied
    await fetchMealPlans('2025+06+01', '2025+06+07');

    const calledUrl = (mockFetch().mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('startDate=2025%2B06%2B01');
    expect(calledUrl).toContain('endDate=2025%2B06%2B07');
  });

  it('attaches Bearer token from Cognito session', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ mealPlans: [] }),
    } as Response);

    await fetchMealPlans('2025-06-01', '2025-06-07');

    const calledOptions = (mockFetch().mock.calls[0] as unknown[])[1] as RequestInit;
    expect((calledOptions.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer mock-id-token',
    );
  });

  it('returns the parsed JSON response', async () => {
    const mealPlans = [mockMealPlan, { ...mockMealPlan, planId: 'plan-2', mealType: 'lunch' as const }];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ mealPlans }),
    } as Response);

    const result = await fetchMealPlans('2025-06-01', '2025-06-07');
    expect(result.mealPlans).toHaveLength(2);
    expect(result.mealPlans[0].planId).toBe('plan-1');
  });

  it('throws when not authenticated', async () => {
    mockGetCurrentSession.mockResolvedValue(null);
    await expect(fetchMealPlans('2025-06-01', '2025-06-07')).rejects.toThrow('Not authenticated');
  });

  it('throws with server error message when response is not ok', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Invalid date range' }),
    } as Response);

    await expect(fetchMealPlans('2025-06-07', '2025-06-01')).rejects.toThrow('Invalid date range');
  });

  it('throws with fallback message when error response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(fetchMealPlans('2025-06-01', '2025-06-07')).rejects.toThrow(
      'Failed to fetch meal plans',
    );
  });

  it('aborts the request after 10 seconds', async () => {
    // Verify the AbortController timeout is wired: spy on AbortController.abort
    // and on setTimeout so we can confirm a 10s timer is registered and fires abort.
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    mockFetch().mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          const signal = (opts as RequestInit).signal;
          if (signal) {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }
        }),
    );

    const fetchPromise = fetchMealPlans('2025-06-01', '2025-06-07');

    // Flush the async auth step so the fetch call (and its setTimeout) is registered
    await Promise.resolve();
    await Promise.resolve();

    // Confirm no abort yet
    expect(abortSpy).not.toHaveBeenCalled();

    // Tick past the 10-second timeout
    jest.advanceTimersByTime(10001);

    // Confirm abort was called
    expect(abortSpy).toHaveBeenCalledTimes(1);

    abortSpy.mockRestore();

    // The promise should now reject with the abort error
    await expect(fetchPromise).rejects.toThrow();
  });
});

// ─── createMealPlan ───────────────────────────────────────────────────────────

describe('createMealPlan', () => {
  const input: CreateMealPlanInput = {
    date: '2025-06-01',
    mealType: 'lunch',
    recipeId: 'recipe-1',
    recipeName: 'Oatmeal',
  };

  it('sends POST /meal-plans with JSON body and bearer header', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ mealPlan: mockMealPlan }),
    } as Response);

    const result = await createMealPlan(input);

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/meal-plans', {
      method: 'POST',
      headers: expectedHeaders,
      body: JSON.stringify(input),
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ mealPlan: mockMealPlan });
  });

  it('returns the parsed created meal plan', async () => {
    const newPlan = { ...mockMealPlan, planId: 'plan-99' };
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ mealPlan: newPlan }),
    } as Response);

    const result = await createMealPlan(input);
    expect(result.mealPlan.planId).toBe('plan-99');
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Missing recipeId' }),
    } as Response);

    await expect(createMealPlan(input)).rejects.toThrow('Missing recipeId');
  });

  it('throws with fallback message when error response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(createMealPlan(input)).rejects.toThrow('Failed to create meal plan');
  });

  it('aborts the request after 10 seconds', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    mockFetch().mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          const signal = (opts as RequestInit).signal;
          if (signal) {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }
        }),
    );

    const fetchPromise = createMealPlan(input);
    await Promise.resolve();
    await Promise.resolve();

    expect(abortSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10001);
    expect(abortSpy).toHaveBeenCalledTimes(1);

    abortSpy.mockRestore();
    await expect(fetchPromise).rejects.toThrow();
  }, 15000);
});

// ─── deleteMealPlan ───────────────────────────────────────────────────────────

describe('deleteMealPlan', () => {
  it('sends DELETE /meal-plans/{planId} with bearer header', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await deleteMealPlan('plan-1');

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/meal-plans/plan-1', {
      method: 'DELETE',
      headers: expectedHeaders,
      signal: expect.any(AbortSignal),
    });
  });

  it('uses the exact planId in the URL path', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await deleteMealPlan('some-other-plan-id');

    const calledUrl = (mockFetch().mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toBe('https://api.example.com/meal-plans/some-other-plan-id');
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Plan not found' }),
    } as Response);

    await expect(deleteMealPlan('plan-1')).rejects.toThrow('Plan not found');
  });

  it('throws with fallback message when error response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(deleteMealPlan('plan-1')).rejects.toThrow('Failed to delete meal plan');
  });

  it('aborts the request after 10 seconds', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    mockFetch().mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          const signal = (opts as RequestInit).signal;
          if (signal) {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }
        }),
    );

    const fetchPromise = deleteMealPlan('plan-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(abortSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10001);
    expect(abortSpy).toHaveBeenCalledTimes(1);

    abortSpy.mockRestore();
    await expect(fetchPromise).rejects.toThrow();
  }, 15000);
});

// ─── fetchRecipesForPlanning ──────────────────────────────────────────────────

describe('fetchRecipesForPlanning', () => {
  it('sends GET /recipes with bearer header', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipes: [{ recipeId: 'r1', name: 'Pasta' }] }),
    } as Response);

    await fetchRecipesForPlanning();

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/recipes',
      expect.objectContaining({
        headers: expectedHeaders,
      }),
    );
  });

  it('maps full recipe objects to PlannableRecipe shape (recipeId + name only)', async () => {
    const fullRecipes = [
      { recipeId: 'r1', name: 'Pasta', tags: ['italian'], portions: 2, createdAt: '…' },
      { recipeId: 'r2', name: 'Salad', tags: ['veg'], portions: 1, createdAt: '…' },
    ];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipes: fullRecipes }),
    } as Response);

    const result = await fetchRecipesForPlanning();

    expect(result.recipes).toEqual([
      { recipeId: 'r1', name: 'Pasta' },
      { recipeId: 'r2', name: 'Salad' },
    ]);
    // Verify extra fields are stripped
    expect(Object.keys(result.recipes[0])).toEqual(['recipeId', 'name']);
  });

  it('returns an empty recipes array when the server returns no recipes', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipes: [] }),
    } as Response);

    const result = await fetchRecipesForPlanning();
    expect(result.recipes).toEqual([]);
  });

  it('handles missing recipes field gracefully (treats it as empty)', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await fetchRecipesForPlanning();
    expect(result.recipes).toEqual([]);
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Unauthorized' }),
    } as Response);

    await expect(fetchRecipesForPlanning()).rejects.toThrow('Unauthorized');
  });

  it('throws with fallback message when error response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(fetchRecipesForPlanning()).rejects.toThrow('Failed to fetch recipes');
  });

  it('aborts the request after 10 seconds', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    mockFetch().mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          const signal = (opts as RequestInit).signal;
          if (signal) {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }
        }),
    );

    const fetchPromise = fetchRecipesForPlanning();
    await Promise.resolve();
    await Promise.resolve();

    expect(abortSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10001);
    expect(abortSpy).toHaveBeenCalledTimes(1);

    abortSpy.mockRestore();
    await expect(fetchPromise).rejects.toThrow();
  }, 15000);
});
