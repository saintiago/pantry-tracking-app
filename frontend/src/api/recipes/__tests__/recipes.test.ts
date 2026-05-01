import {
  fetchRecipes,
  createRecipe,
  fetchRecipeWithAvailability,
  updateRecipe,
  deleteRecipe,
} from '../recipes';

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

beforeEach(() => {
  jest.resetAllMocks();
  mockGetCurrentSession.mockResolvedValue(mockSession);
  global.fetch = jest.fn();
});

const mockFetch = () => global.fetch as jest.MockedFunction<typeof fetch>;

const mockRecipe = {
  recipeId: 'recipe-1',
  userId: 'user-1',
  name: 'Pasta',
  ingredients: [{ name: 'Pasta', quantity: 200, unit: 'Gram' }],
  instructions: 'Boil pasta.',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  syncVersion: 1,
};

describe('fetchRecipes', () => {
  it('sends GET /recipes with auth header and returns recipes array', async () => {
    const recipes = [mockRecipe];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipes }),
    } as Response);

    const result = await fetchRecipes();

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/recipes', {
      headers: expectedHeaders,
    });
    expect(result).toEqual(recipes);
  });

  it('throws when not authenticated', async () => {
    mockGetCurrentSession.mockResolvedValue(null);
    await expect(fetchRecipes()).rejects.toThrow('Not authenticated');
  });

  it('throws with server error message on 5xx', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Internal server error' }),
    } as Response);

    await expect(fetchRecipes()).rejects.toThrow('Internal server error');
  });

  it('throws with default message when response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(fetchRecipes()).rejects.toThrow('Failed to fetch recipes');
  });

  it('throws on network failure', async () => {
    mockFetch().mockRejectedValue(new Error('Network error'));
    await expect(fetchRecipes()).rejects.toThrow('Network error');
  });
});

describe('createRecipe', () => {
  const newRecipeData = {
    name: 'Pasta',
    ingredients: [{ name: 'Pasta', quantity: 200, unit: 'Gram' }],
    instructions: 'Boil pasta.',
  };

  it('sends POST /recipes with data and returns created recipe', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipe: mockRecipe }),
    } as Response);

    const result = await createRecipe(newRecipeData);

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/recipes', {
      method: 'POST',
      headers: expectedHeaders,
      body: JSON.stringify(newRecipeData),
    });
    expect(result).toEqual(mockRecipe);
  });

  it('throws with validation error message on 400', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Ingredients are required' }),
    } as Response);

    await expect(createRecipe(newRecipeData)).rejects.toThrow('Ingredients are required');
  });

  it('throws with server error message on 500', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Internal server error' }),
    } as Response);

    await expect(createRecipe(newRecipeData)).rejects.toThrow('Internal server error');
  });

  it('throws with default message when response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(createRecipe(newRecipeData)).rejects.toThrow('Failed to create recipe');
  });
});

describe('fetchRecipeWithAvailability', () => {
  const mockAvailability = {
    recipe: mockRecipe,
    ingredientAvailability: [
      { name: 'Pasta', required: 200, unit: 'Gram', available: 100, status: 'partial' as const },
    ],
    missingCount: 1,
  };

  it('sends GET /recipes/:id with auth header and returns recipe with availability', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => mockAvailability,
    } as Response);

    const result = await fetchRecipeWithAvailability('recipe-1');

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/recipes/recipe-1', {
      headers: expectedHeaders,
    });
    expect(result).toEqual(mockAvailability);
  });

  it('throws with not found message on 404', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Recipe not found' }),
    } as Response);

    await expect(fetchRecipeWithAvailability('bad-id')).rejects.toThrow('Recipe not found');
  });

  it('throws with default message when response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(fetchRecipeWithAvailability('bad-id')).rejects.toThrow('Failed to fetch recipe');
  });
});

describe('updateRecipe', () => {
  const updateData = { name: 'Updated Pasta', instructions: 'Boil pasta al dente.' };

  it('sends PUT /recipes/:id with data and returns updated recipe', async () => {
    const updatedRecipe = { ...mockRecipe, ...updateData };
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipe: updatedRecipe }),
    } as Response);

    const result = await updateRecipe('recipe-1', updateData);

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/recipes/recipe-1', {
      method: 'PUT',
      headers: expectedHeaders,
      body: JSON.stringify(updateData),
    });
    expect(result).toEqual(updatedRecipe);
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Recipe not found' }),
    } as Response);

    await expect(updateRecipe('bad-id', updateData)).rejects.toThrow('Recipe not found');
  });

  it('throws with default message when response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(updateRecipe('bad-id', updateData)).rejects.toThrow('Failed to update recipe');
  });
});

describe('deleteRecipe', () => {
  it('sends DELETE /recipes/:id with auth header', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await deleteRecipe('recipe-1');

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/recipes/recipe-1', {
      method: 'DELETE',
      headers: expectedHeaders,
    });
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Recipe not found' }),
    } as Response);

    await expect(deleteRecipe('bad-id')).rejects.toThrow('Recipe not found');
  });

  it('throws with default message when response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(deleteRecipe('bad-id')).rejects.toThrow('Failed to delete recipe');
  });
});

describe('createRecipe — time fields', () => {
  it('sends prepTime and cookTime in request body when provided', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipe: { ...mockRecipe, prepTime: 10, cookTime: 20 } }),
    } as Response);

    const data = {
      name: 'Pasta',
      ingredients: [{ name: 'Pasta', quantity: 200, unit: 'Gram' }],
      instructions: 'Boil pasta.',
      prepTime: 10,
      cookTime: 20,
    };

    await createRecipe(data);

    const callBody = JSON.parse((mockFetch().mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.prepTime).toBe(10);
    expect(callBody.cookTime).toBe(20);
  });
});

describe('updateRecipe — time fields', () => {
  it('sends null for prepTime when explicitly clearing the field', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipe: mockRecipe }),
    } as Response);

    await updateRecipe('recipe-1', { prepTime: null });

    const callBody = JSON.parse((mockFetch().mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.prepTime).toBeNull();
  });

  it('does not include time fields in body when not provided', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ recipe: mockRecipe }),
    } as Response);

    await updateRecipe('recipe-1', { name: 'Updated' });

    const callBody = JSON.parse((mockFetch().mock.calls[0][1] as RequestInit).body as string);
    expect(callBody).not.toHaveProperty('prepTime');
    expect(callBody).not.toHaveProperty('cookTime');
  });
});
