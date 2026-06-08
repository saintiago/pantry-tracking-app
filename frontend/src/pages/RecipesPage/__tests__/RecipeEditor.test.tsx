import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import RecipeEditor from '../RecipeEditor';
import * as recipesApi from '../../../api/recipes/recipes';
import type { Recipe, RecipeWithAvailability } from '../../../api/recipes/recipes';
import * as inventoryApi from '../../../api/inventory/inventory';

jest.mock('../../../api/recipes/recipes', () => ({
  ...jest.requireActual('../../../api/recipes/recipes'),
  createRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  fetchRecipeWithAvailability: jest.fn(),
}));
jest.mock('../../../api/inventory/inventory');

const mockCreate = recipesApi.createRecipe as jest.MockedFunction<typeof recipesApi.createRecipe>;
const mockUpdate = recipesApi.updateRecipe as jest.MockedFunction<typeof recipesApi.updateRecipe>;
const mockFetch = recipesApi.fetchRecipeWithAvailability as jest.MockedFunction<
  typeof recipesApi.fetchRecipeWithAvailability
>;
const mockSearch = inventoryApi.searchInventory as jest.MockedFunction<
  typeof inventoryApi.searchInventory
>;

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    recipeId: 'r1',
    userId: 'user-1',
    name: 'Pasta Carbonara',
    tags: ['italian'],
    instructions: 'Boil pasta. Mix eggs and cheese. Combine.',
    ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncVersion: 1,
    ...overrides,
  };
}

function makeAvailability(recipe: Recipe): RecipeWithAvailability {
  return {
    recipe,
    ingredientAvailability: [],
    missingCount: 0,
  };
}

describe('RecipeEditor — create mode', () => {
  const onSaved = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockResolvedValue({
      field: 'name',
      query: '',
      resultType: 'items',
      items: [],
      count: 0,
    });
  });

  it('renders create form with empty fields', () => {
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    expect(screen.getByRole('heading', { name: /new recipe/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^name$/i })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /instructions/i })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /source url/i })).toHaveValue('');
  });

  it('renders one empty ingredient row by default', () => {
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    expect(screen.getByLabelText(/ingredient 1 name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ingredient 1 quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ingredient 1 unit/i)).toBeInTheDocument();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows validation errors when submitting empty form', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    await user.click(screen.getByRole('button', { name: /create recipe/i }));
    expect(await screen.findByText(/recipe name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/instructions are required/i)).toBeInTheDocument();
  });

  it('shows ingredient validation errors on submit', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    // Fill required top-level fields but leave ingredient empty
    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'My Recipe');
    await user.type(screen.getByLabelText(/instructions/i), 'Do stuff');
    await user.click(screen.getByRole('button', { name: /create recipe/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a valid quantity/i)).toBeInTheDocument();
    expect(screen.getByText(/unit is required/i)).toBeInTheDocument();
  });

  it('adds a new ingredient row when Add Ingredient is clicked', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    await user.click(screen.getByRole('button', { name: /add ingredient/i }));
    expect(screen.getByLabelText(/ingredient 2 name/i)).toBeInTheDocument();
  });

  it('remove button is disabled when only one ingredient row exists', () => {
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    expect(screen.getByRole('button', { name: /remove ingredient 1/i })).toBeDisabled();
  });

  it('removes an ingredient row when remove is clicked (with 2+ rows)', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    await user.click(screen.getByRole('button', { name: /add ingredient/i }));
    expect(screen.getByLabelText(/ingredient 2 name/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remove ingredient 2/i }));
    expect(screen.queryByLabelText(/ingredient 2 name/i)).not.toBeInTheDocument();
  });

  it('calls createRecipe and onSaved on successful submit', async () => {
    const user = userEvent.setup();
    const newRecipe = makeRecipe({ recipeId: 'new-id' });
    mockCreate.mockResolvedValue(newRecipe);

    render(
      <RecipeEditor
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={['italian', 'quick']}
        tagsLoading={false}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Pasta');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Cook it');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Pasta');
    await user.clear(screen.getByLabelText(/ingredient 1 quantity/i));
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '200');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'g');
    await user.type(screen.getByLabelText(/portions/i), '2');

    // Add a tag
    const tagInput = screen.getByPlaceholderText('Add a tag…');
    await user.type(tagInput, 'italian');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Pasta',
        instructions: ['Cook it'],
        ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
      }),
    );
    expect(onSaved).toHaveBeenCalledWith('new-id');
  });

  it('shows submit error banner when createRecipe fails', async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(new Error('Server error'));

    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Pasta');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Cook it');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Pasta');
    await user.clear(screen.getByLabelText(/ingredient 1 quantity/i));
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '200');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'g');
    await user.type(screen.getByLabelText(/portions/i), '2');

    // Add a tag so validation passes
    const tagInput = screen.getByPlaceholderText('Add a tag…');
    await user.type(tagInput, 'italian');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('omits sourceUrl from payload when left empty', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeRecipe());

    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Pasta');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Cook it');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Pasta');
    await user.clear(screen.getByLabelText(/ingredient 1 quantity/i));
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '200');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'g');
    await user.type(screen.getByLabelText(/portions/i), '2');

    // Add a tag so validation passes
    const tagInput = screen.getByPlaceholderText('Add a tag…');
    await user.type(tagInput, 'italian');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.sourceUrl).toBeUndefined();
  });

  it('shows autocomplete dropdown when typing 3+ chars in ingredient name', async () => {
    jest.useFakeTimers();
    mockSearch.mockResolvedValue({
      field: 'name',
      query: 'pas',
      resultType: 'items',
      items: [{ itemId: 'i1', name: 'Pasta', category: 'Dry Goods', unit: 'Gram' } as never],
      count: 1,
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'pas');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('name', 'pas'));
    await waitFor(() => expect(screen.getByTestId('autocomplete-dropdown')).toBeInTheDocument());

    jest.useRealTimers();
  });

  it('does not show autocomplete dropdown when typing fewer than 3 chars', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'pa');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    expect(mockSearch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('autocomplete-dropdown')).not.toBeInTheDocument();

    jest.useRealTimers();
  });

  it('searches across name, barcode, brand, category, and whereToBuy fields in parallel', async () => {
    jest.useFakeTimers();
    mockSearch.mockResolvedValue({
      field: 'name',
      query: 'pas',
      resultType: 'items',
      items: [],
      count: 0,
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'pas');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(5));
    expect(mockSearch).toHaveBeenCalledWith('name', 'pas');
    expect(mockSearch).toHaveBeenCalledWith('barcode', 'pas');
    expect(mockSearch).toHaveBeenCalledWith('brand', 'pas');
    expect(mockSearch).toHaveBeenCalledWith('category', 'pas');
    expect(mockSearch).toHaveBeenCalledWith('whereToBuy', 'pas');

    jest.useRealTimers();
  });

  it('deduplicates results from multiple field searches by itemId', async () => {
    jest.useFakeTimers();
    const item = { itemId: 'i1', name: 'Pasta', category: 'Dry Goods', unit: 'Gram' } as never;
    // Same item returned by both name and category search
    mockSearch.mockResolvedValue({
      field: 'name',
      query: 'pas',
      resultType: 'items',
      items: [item],
      count: 1,
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'pas');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => screen.getByTestId('autocomplete-dropdown'));
    // Should only show one item despite 5 searches returning the same item
    expect(screen.getAllByTestId(/dropdown-item-/)).toHaveLength(1);

    jest.useRealTimers();
  });

  it('shows item found by category search in dropdown', async () => {
    jest.useFakeTimers();
    mockSearch.mockImplementation(async (field: string) => {
      if (field === 'category') {
        return {
          field: 'category',
          query: 'bak',
          resultType: 'items',
          items: [{ itemId: 'i2', name: 'Flour', category: 'Baking', unit: 'Gram' } as never],
          count: 1,
        };
      }
      return { field, query: 'bak', resultType: 'items', items: [], count: 0 };
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'bak');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => screen.getByTestId('dropdown-item-0'));
    expect(screen.getByText('Flour')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('autofills ingredient name and unit when selecting from dropdown', async () => {
    jest.useFakeTimers();
    mockSearch.mockResolvedValue({
      field: 'name',
      query: 'pas',
      resultType: 'items',
      items: [{ itemId: 'i1', name: 'Pasta', category: 'Dry Goods', unit: 'Gram' } as never],
      count: 1,
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'pas');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => screen.getByTestId('dropdown-item-0'));
    await user.click(screen.getByTestId('dropdown-item-0'));

    expect(screen.getByLabelText(/ingredient 1 name/i)).toHaveValue('Pasta');
    expect(screen.getByLabelText(/ingredient 1 unit/i)).toHaveValue('g');

    jest.useRealTimers();
  });

  it('renders a labeled "Portions" input in create mode', () => {
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);
    expect(screen.getByLabelText(/portions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/portions/i)).toHaveAttribute('type', 'number');
  });

  it('shows validation error when portions is empty on submit', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Pasta');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Cook it');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Pasta');
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '200');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'g');
    // Leave portions empty

    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    expect(await screen.findByText(/portions is required/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows validation error when portions is 0 on submit', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Pasta');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Cook it');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Pasta');
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '200');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'g');
    await user.type(screen.getByLabelText(/portions/i), '0');

    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    expect(
      await screen.findByText(/portions must be a positive whole number/i),
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not recalculate ingredient quantities when portions changes in create mode', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    // Set an ingredient quantity
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '200');

    // Change portions
    await user.type(screen.getByLabelText(/portions/i), '4');

    // Quantity should remain unchanged (text input now)
    expect(screen.getByLabelText(/ingredient 1 quantity/i)).toHaveValue('200');
  });

  it('includes portions in the create API call payload', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeRecipe({ recipeId: 'new-id' }));

    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Pasta');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Cook it');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Pasta');
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '200');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'g');
    await user.type(screen.getByLabelText(/portions/i), '4');

    // Add a tag so validation passes
    const tagInput = screen.getByPlaceholderText('Add a tag…');
    await user.type(tagInput, 'italian');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ portions: 4 }));
  });
});

describe('RecipeEditor — edit mode', () => {
  const onSaved = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockResolvedValue({
      field: 'name',
      query: '',
      resultType: 'items',
      items: [],
      count: 0,
    });
  });

  it('shows loading state while fetching recipe', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );
    expect(screen.getByRole('status', { name: /loading recipe/i })).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Not found'));
    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });

  it('pre-populates form fields from fetched recipe', async () => {
    const recipe = makeRecipe({
      name: 'Chicken Soup',
      instructions: 'Boil chicken',
      sourceUrl: 'https://example.com',
      ingredients: [
        { name: 'Chicken', quantity: 500, unit: 'g' },
        { name: 'Water', quantity: 1, unit: 'L' },
      ],
    });
    mockFetch.mockResolvedValue(makeAvailability(recipe));

    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^name$/i })).toHaveValue('Chicken Soup'),
    );
    expect(screen.getByRole('textbox', { name: /instructions/i })).toHaveValue('Boil chicken');
    expect(screen.getByRole('textbox', { name: /source url/i })).toHaveValue('https://example.com');
    expect(screen.getByLabelText(/ingredient 1 name/i)).toHaveValue('Chicken');
    expect(screen.getByLabelText(/ingredient 2 name/i)).toHaveValue('Water');
  });

  it('renders Edit Recipe heading in edit mode', async () => {
    mockFetch.mockResolvedValue(makeAvailability(makeRecipe()));
    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /edit recipe/i })).toBeInTheDocument(),
    );
  });

  it('calls updateRecipe and onSaved on successful submit', async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe();
    mockFetch.mockResolvedValue(makeAvailability(recipe));
    mockUpdate.mockResolvedValue({ ...recipe, name: 'Updated Name' });

    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^name$/i })).toHaveValue('Pasta Carbonara'),
    );

    // Clear and retype name
    await user.clear(screen.getByRole('textbox', { name: /^name$/i }));
    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Updated Name');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ name: 'Updated Name' }),
    );
    expect(onSaved).toHaveBeenCalledWith('r1');
  });

  it('removes existing chef notes when the field is cleared', async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ chefNotes: 'Use fresh herbs.' });
    mockFetch.mockResolvedValue(makeAvailability(recipe));
    mockUpdate.mockResolvedValue({ ...recipe, chefNotes: undefined });

    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );

    const chefNotes = await screen.findByLabelText(/chef's notes/i);
    expect(chefNotes).toHaveValue('Use fresh herbs.');
    await user.clear(chefNotes);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('r1', expect.objectContaining({ chefNotes: null })),
    );
  });

  it('shows submit error banner when updateRecipe fails', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(makeAvailability(makeRecipe()));
    mockUpdate.mockRejectedValue(new Error('Update failed'));

    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^name$/i })).toHaveValue('Pasta Carbonara'),
    );

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Update failed')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('RecipeEditor — edit mode portions scaler', () => {
  const onSaved = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockResolvedValue({
      field: 'name',
      query: '',
      resultType: 'items',
      items: [],
      count: 0,
    });
  });

  it('renders +/– controls in edit mode instead of a plain input', async () => {
    mockFetch.mockResolvedValue(makeAvailability(makeRecipe({ portions: 2 })));
    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /edit recipe/i })).toBeInTheDocument(),
    );

    expect(screen.getByRole('button', { name: /increase portions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decrease portions/i })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /portions/i })).not.toBeInTheDocument();
  });

  it('pre-populates selectedPortions from recipe.portions', async () => {
    mockFetch.mockResolvedValue(makeAvailability(makeRecipe({ portions: 4 })));
    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /edit recipe/i })).toBeInTheDocument(),
    );

    expect(screen.getByText(/4 portions/i)).toBeInTheDocument();
  });

  it('disables – button when selectedPortions is 1', async () => {
    mockFetch.mockResolvedValue(makeAvailability(makeRecipe({ portions: 1 })));
    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /edit recipe/i })).toBeInTheDocument(),
    );

    expect(screen.getByRole('button', { name: /decrease portions/i })).toBeDisabled();
  });

  it('does not recalculate ingredient quantity fields while portions change', async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({
      portions: 2,
      ingredients: [{ name: 'Flour', quantity: 100, unit: 'g' }],
    });
    mockFetch.mockResolvedValue(makeAvailability(recipe));
    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText(/ingredient 1 quantity/i)).toHaveValue('100'));

    await user.click(screen.getByRole('button', { name: /increase portions/i }));

    expect(screen.getByLabelText(/ingredient 1 quantity/i)).toHaveValue('100');
  });

  it('keeps ingredient quantity fields stable across repeated portion changes', async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({
      portions: 4,
      ingredients: [{ name: 'Flour', quantity: 200, unit: 'g' }],
    });
    mockFetch.mockResolvedValue(makeAvailability(recipe));
    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText(/ingredient 1 quantity/i)).toHaveValue('200'));

    await user.click(screen.getByRole('button', { name: /increase portions/i }));
    expect(screen.getByLabelText(/ingredient 1 quantity/i)).toHaveValue('200');

    await user.click(screen.getByRole('button', { name: /decrease portions/i }));
    expect(screen.getByLabelText(/ingredient 1 quantity/i)).toHaveValue('200');
  });

  it('includes selectedPortions as portions in the update API call payload', async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ portions: 2 });
    mockFetch.mockResolvedValue(makeAvailability(recipe));
    mockUpdate.mockResolvedValue({ ...recipe, portions: 3 });

    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={[]}
        tagsLoading={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^name$/i })).toHaveValue('Pasta Carbonara'),
    );

    await user.click(screen.getByRole('button', { name: /increase portions/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        portions: 3,
        ingredients: [{ name: 'Pasta', quantity: 300, unit: 'g' }],
      }),
    );
  });
});

describe('RecipeEditor — issue 4 fields', () => {
  const onSaved = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockResolvedValue({
      field: 'name',
      query: '',
      resultType: 'items',
      items: [],
      count: 0,
    });
  });

  it('allows an empty quantity for handful and includes section, steps, and chef notes', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeRecipe({ recipeId: 'new-id' }));
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Sauce');
    await user.type(screen.getByLabelText('Instructions'), 'Chop herbs');
    await user.click(screen.getByRole('button', { name: /add step/i }));
    await user.type(screen.getByLabelText('Instruction step 2'), 'Mix sauce');
    await user.type(screen.getByLabelText(/chef's notes/i), 'Taste before serving.');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Parsley');
    await user.type(screen.getByLabelText(/ingredient 1 section/i), 'For the sauce');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'handful');
    await user.type(screen.getByLabelText(/portions/i), '2');
    await user.type(screen.getByPlaceholderText('Add a tag…'), 'quick');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: ['Chop herbs', 'Mix sauce'],
        chefNotes: 'Taste before serving.',
        ingredients: [
          {
            name: 'Parsley',
            quantity: null,
            unit: 'handful',
            section: 'For the sauce',
          },
        ],
      }),
    );
  });
});

describe('RecipeEditor — tags', () => {
  const onSaved = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockResolvedValue({
      field: 'name',
      query: '',
      resultType: 'items',
      items: [],
      count: 0,
    });
  });

  it('renders TagInput in the form', () => {
    render(
      <RecipeEditor
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={['italian', 'quick']}
        tagsLoading={false}
      />,
    );
    // TagInput renders a combobox input with placeholder "Add a tag…"
    expect(screen.getByPlaceholderText('Add a tag…')).toBeInTheDocument();
    // Tags label
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('submitting with no tags shows "At least one tag is required."', async () => {
    const user = userEvent.setup();
    render(<RecipeEditor onSaved={onSaved} onCancel={onCancel} allTags={[]} tagsLoading={false} />);

    // Fill required fields
    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Test Recipe');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Do stuff');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Flour');
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '100');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'g');
    await user.type(screen.getByLabelText(/portions/i), '2');

    // Submit without adding tags
    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => {
      expect(screen.getByText('At least one tag is required.')).toBeInTheDocument();
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('tags are included in the createRecipe API call payload', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeRecipe({ recipeId: 'new-recipe' }));

    render(
      <RecipeEditor
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={['italian', 'quick']}
        tagsLoading={false}
      />,
    );

    // Fill required fields
    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Test Recipe');
    await user.type(screen.getByRole('textbox', { name: /instructions/i }), 'Do stuff');
    await user.type(screen.getByLabelText(/ingredient 1 name/i), 'Flour');
    await user.type(screen.getByLabelText(/ingredient 1 quantity/i), '100');
    await user.selectOptions(screen.getByLabelText(/ingredient 1 unit/i), 'g');
    await user.type(screen.getByLabelText(/portions/i), '2');

    // Add a tag via the TagInput
    const tagInput = screen.getByPlaceholderText('Add a tag…');
    await user.type(tagInput, 'italian');
    await user.keyboard('{Enter}');

    // Submit
    await user.click(screen.getByRole('button', { name: /create recipe/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ tags: ['italian'] }));
    });
  });

  it('in edit mode, existing tags are pre-populated in TagInput', async () => {
    const recipe = makeRecipe({ tags: ['italian', 'quick'] });
    mockFetch.mockResolvedValue(makeAvailability(recipe));

    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={['italian', 'quick', 'soup']}
        tagsLoading={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('italian')).toBeInTheDocument();
      expect(screen.getByText('quick')).toBeInTheDocument();
    });
  });

  it('tags are included in the updateRecipe API call payload', async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ tags: ['italian'] });
    mockFetch.mockResolvedValue(makeAvailability(recipe));
    mockUpdate.mockResolvedValue({ ...recipe, tags: ['italian', 'quick'] });

    render(
      <RecipeEditor
        recipeId="r1"
        onSaved={onSaved}
        onCancel={onCancel}
        allTags={['italian', 'quick']}
        tagsLoading={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^name$/i })).toHaveValue('Pasta Carbonara'),
    );

    // Add another tag
    const tagInput = screen.getByPlaceholderText('Add a tag…');
    await user.type(tagInput, 'quick');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ tags: ['italian', 'quick'] }),
      );
    });
  });
});
