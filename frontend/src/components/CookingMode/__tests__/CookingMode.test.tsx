import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import CookingMode from '../CookingMode';
import type { IngredientStatus, RecipeIngredient } from '../../../api/recipes/recipes';

// Mock child components
jest.mock('../../ResizableSplit/ResizableSplit', () => ({
  __esModule: true,
  default: ({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) => (
    <div data-testid="resizable-split">
      <div data-testid="resizable-split-top">{top}</div>
      <div data-testid="resizable-split-bottom">{bottom}</div>
    </div>
  ),
}));

jest.mock('../../../pages/RecipesPage/IngredientAvailability', () => ({
  __esModule: true,
  default: ({ ingredients, missingCount }: { ingredients: RecipeIngredient[]; missingCount: number }) => (
    <div data-testid="ingredient-availability">
      <span>{ingredients.length} ingredients</span>
      <span>{missingCount} missing</span>
    </div>
  ),
}));

jest.mock('../ConfirmDialog', () => ({
  __esModule: true,
  default: ({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="confirm-dialog">
      <span>{message}</span>
      <button data-testid="confirm-dialog-confirm" onClick={onConfirm}>Finish Anyway</button>
      <button data-testid="confirm-dialog-cancel" onClick={onCancel}>Keep Cooking</button>
    </div>
  ),
}));

const mockIngredients: RecipeIngredient[] = [
  { name: 'Flour', quantity: 200, unit: 'g' },
  { name: 'Eggs', quantity: 3, unit: 'Unit' },
];

const mockAvailability: IngredientStatus[] = [
  { name: 'Flour', required: 200, unit: 'g', available: 200, status: 'available' },
  { name: 'Eggs', required: 3, unit: 'Unit', available: 1, status: 'partial' },
];

const defaultProps = {
  recipeName: 'Test Recipe',
  instructionSteps: ['Step one', 'Step two', 'Step three'],
  ingredients: mockIngredients,
  availability: mockAvailability,
  missingCount: 1,
  selectedPortions: 2,
  onPortionsIncrement: jest.fn(),
  onPortionsDecrement: jest.fn(),
  onExit: jest.fn(),
  onFinish: jest.fn(),
  currentStepIndex: 0,
  onStepChange: jest.fn(),
};

describe('CookingMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders recipe name in header', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'Test Recipe' })).toBeInTheDocument();
  });

  it('renders all instruction steps', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByText('Step one')).toBeInTheDocument();
    expect(screen.getByText('Step two')).toBeInTheDocument();
    expect(screen.getByText('Step three')).toBeInTheDocument();
  });

  it('renders the step counter', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });

  it('renders ingredient availability', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByTestId('ingredient-availability')).toBeInTheDocument();
    expect(screen.getByText('2 ingredients')).toBeInTheDocument();
    expect(screen.getByText('1 missing')).toBeInTheDocument();
  });

  it('renders Previous and Next buttons', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument();
  });

  it('Previous button is disabled at first step', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
  });

  it('Next button is enabled at first step', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled();
  });

  it('Next advances current step', async () => {
    const onStepChange = jest.fn();
    render(<CookingMode {...defaultProps} onStepChange={onStepChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it('Previous goes back', async () => {
    const onStepChange = jest.fn();
    render(<CookingMode {...defaultProps} currentStepIndex={2} onStepChange={onStepChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it('Previous is disabled at first step and Next is disabled at last step', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled();
  });

  it('Next is disabled at last step', () => {
    render(<CookingMode {...defaultProps} currentStepIndex={2} />);
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
  });

  it('tapping a step calls onStepChange', async () => {
    const onStepChange = jest.fn();
    render(<CookingMode {...defaultProps} onStepChange={onStepChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('cooking-step-2'));
    expect(onStepChange).toHaveBeenCalledWith(2);
  });

  it('current step has aria-current attribute', () => {
    render(<CookingMode {...defaultProps} currentStepIndex={1} />);
    expect(screen.getByTestId('cooking-step-1')).toHaveAttribute('aria-current', 'step');
  });

  it('completed steps show checkmark', () => {
    render(<CookingMode {...defaultProps} currentStepIndex={2} />);
    // Step 0 and step 1 should have checkmarks (hidden from accessibility but present)
    const checkmarks = screen.getAllByText('✓');
    expect(checkmarks.length).toBe(2);
  });

  it('renders progress bar', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('progress fill reflects step position', () => {
    render(<CookingMode {...defaultProps} currentStepIndex={1} />);
    const fill = screen.getByTestId('cooking-progress-fill');
    // 2 of 3 steps = ~66.67%
    expect(fill.style.width).toBe('66.66666666666666%');
  });

  it('progress bar has correct aria attributes', () => {
    render(<CookingMode {...defaultProps} currentStepIndex={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
  });

  it('Finish button is rendered', () => {
    render(<CookingMode {...defaultProps} />);
    expect(screen.getByTestId('finish-cooking-button')).toBeInTheDocument();
  });

  it('Finish on last step calls onFinish directly (no confirm)', async () => {
    const onFinish = jest.fn();
    render(<CookingMode {...defaultProps} currentStepIndex={2} onFinish={onFinish} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('finish-cooking-button'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('Finish before last step shows confirmation dialog', async () => {
    const onFinish = jest.fn();
    render(<CookingMode {...defaultProps} currentStepIndex={0} onFinish={onFinish} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('finish-cooking-button'));
    // Confirm dialog should appear, onFinish should NOT be called yet
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('confirming in dialog calls onFinish', async () => {
    const onFinish = jest.fn();
    render(<CookingMode {...defaultProps} currentStepIndex={0} onFinish={onFinish} />);
    const user = userEvent.setup();
    // Open confirm dialog
    await user.click(screen.getByTestId('finish-cooking-button'));
    // Confirm
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('cancelling in dialog dismisses without calling onFinish', async () => {
    const onFinish = jest.fn();
    render(<CookingMode {...defaultProps} currentStepIndex={0} onFinish={onFinish} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('finish-cooking-button'));
    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onFinish).not.toHaveBeenCalled();
    // Dialog should be gone
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('back button calls onExit', async () => {
    const onExit = jest.fn();
    render(<CookingMode {...defaultProps} onExit={onExit} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Leave cooking mode' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('portions increment button calls onPortionsIncrement', async () => {
    const onPortionsIncrement = jest.fn();
    render(<CookingMode {...defaultProps} onPortionsIncrement={onPortionsIncrement} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Increase portions' }));
    expect(onPortionsIncrement).toHaveBeenCalledTimes(1);
  });

  it('portions decrement button calls onPortionsDecrement', async () => {
    const onPortionsDecrement = jest.fn();
    render(<CookingMode {...defaultProps} onPortionsDecrement={onPortionsDecrement} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Decrease portions' }));
    expect(onPortionsDecrement).toHaveBeenCalledTimes(1);
  });

  it('portions – button is disabled when selectedPortions is 1', () => {
    render(<CookingMode {...defaultProps} selectedPortions={1} />);
    expect(screen.getByRole('button', { name: 'Decrease portions' })).toBeDisabled();
  });

  it('uses ResizableSplit with steps on top and ingredients on bottom', () => {
    render(<CookingMode {...defaultProps} />);
    const top = screen.getByTestId('resizable-split-top');
    const bottom = screen.getByTestId('resizable-split-bottom');
    expect(top).toContainElement(screen.getByTestId('cooking-step-0'));
    expect(bottom).toContainElement(screen.getByTestId('ingredient-availability'));
  });

  it('renders with a single step (boundary)', () => {
    render(
      <CookingMode
        {...defaultProps}
        instructionSteps={['Only step']}
        currentStepIndex={0}
      />,
    );
    expect(screen.getByText('Step 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
  });

  it('finish without confirm when on last single step', async () => {
    const onFinish = jest.fn();
    render(
      <CookingMode
        {...defaultProps}
        instructionSteps={['Only step']}
        currentStepIndex={0}
        onFinish={onFinish}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('finish-cooking-button'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
