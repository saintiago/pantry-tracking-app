import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import WeekCalendar from '../WeekCalendar';
import type { Assignment } from '../weekUtils';
import { getWeekDates, getWeekStart } from '../weekUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const weekStart = getWeekStart(new Date('2025-06-02T00:00:00Z')); // Monday 2025-06-02
const weekDates = getWeekDates(weekStart);

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    planId: 'plan-1',
    date: weekDates[0],
    mealType: 'breakfast',
    recipeName: 'Oatmeal',
    createdAt: '2025-06-02T08:00:00.000Z',
    ...overrides,
  };
}

const noop = () => {};

function renderCalendar(
  props: Partial<React.ComponentProps<typeof WeekCalendar>> = {},
) {
  const defaults: React.ComponentProps<typeof WeekCalendar> = {
    weekDates,
    assignments: [],
    loading: false,
    error: null,
    removingPlanIds: new Set(),
    onPrevWeek: noop,
    onNextWeek: noop,
    onAddClick: noop,
    onRemove: noop,
  };
  return render(<WeekCalendar {...defaults} {...props} />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WeekCalendar — rendering', () => {
  it('renders exactly 7 DayColumn add-recipe buttons for 7 dates', () => {
    renderCalendar();
    const addButtons = screen.getAllByRole('button', { name: 'Add recipe' });
    expect(addButtons).toHaveLength(7);
  });

  it('renders day labels for all 7 days of the week', () => {
    renderCalendar();
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    dayLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('renders the month/year label for the visible week', () => {
    // weekStart 2025-06-02 → all 7 days fall in June 2025
    renderCalendar();
    expect(screen.getByRole('heading', { name: 'June 2025' })).toBeInTheDocument();
  });

  it('renders recipe cards for assignments', () => {
    const assignments = [makeAssignment({ recipeName: 'Pancakes', mealType: 'breakfast' })];
    renderCalendar({ assignments });
    expect(screen.getByText('Pancakes')).toBeInTheDocument();
  });

  it('renders previous and next week navigation buttons', () => {
    renderCalendar();
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next week' })).toBeInTheDocument();
  });

  it('calls onPrevWeek when previous week button is clicked', async () => {
    const onPrevWeek = jest.fn();
    renderCalendar({ onPrevWeek });
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(onPrevWeek).toHaveBeenCalledTimes(1);
  });

  it('calls onNextWeek when next week button is clicked', async () => {
    const onNextWeek = jest.fn();
    renderCalendar({ onNextWeek });
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onNextWeek).toHaveBeenCalledTimes(1);
  });
});

describe('WeekCalendar — loading state', () => {
  it('shows loading status text while loading (Req 1.8)', () => {
    renderCalendar({ loading: true });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('navigation buttons are disabled while loading (Req 3.5)', () => {
    renderCalendar({ loading: true });
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
  });

  it('navigation buttons are enabled when not loading', () => {
    renderCalendar({ loading: false });
    expect(screen.getByRole('button', { name: 'Previous week' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next week' })).not.toBeDisabled();
  });

  it('does not show loading indicator when not loading', () => {
    renderCalendar({ loading: false });
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});

describe('WeekCalendar — error state', () => {
  it('shows error banner with error message (Req 1.9)', () => {
    renderCalendar({ error: 'Failed to load meal plans' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load meal plans')).toBeInTheDocument();
  });

  it('all 7 columns still present (with add buttons) when error is shown (Req 1.9)', () => {
    // Pass in an assignment to verify it's hidden when there's an error
    const assignments = [makeAssignment({ recipeName: 'Pasta' })];
    renderCalendar({ error: 'Some error', assignments });

    // 7 add buttons still rendered
    const addButtons = screen.getAllByRole('button', { name: 'Add recipe' });
    expect(addButtons).toHaveLength(7);
  });

  it('assignment cards are hidden when there is an error (Req 1.9)', () => {
    const assignments = [makeAssignment({ recipeName: 'Pasta' })];
    renderCalendar({ error: 'Some error', assignments });
    expect(screen.queryByText('Pasta')).not.toBeInTheDocument();
  });

  it('error banner not shown when error is null', () => {
    renderCalendar({ error: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('WeekCalendar — add click callback', () => {
  it('calls onAddClick with the correct date when add button is clicked', async () => {
    const onAddClick = jest.fn();
    renderCalendar({ onAddClick });

    const addButtons = screen.getAllByRole('button', { name: 'Add recipe' });
    await userEvent.click(addButtons[0]);

    expect(onAddClick).toHaveBeenCalledWith(weekDates[0]);
  });
});

describe('WeekCalendar — remove callback', () => {
  it('calls onRemove with planId when remove button is clicked', async () => {
    const onRemove = jest.fn();
    const assignments = [makeAssignment({ planId: 'plan-abc', date: weekDates[0] })];
    renderCalendar({ assignments, onRemove });

    await userEvent.click(screen.getByRole('button', { name: 'Remove assignment' }));
    expect(onRemove).toHaveBeenCalledWith('plan-abc');
  });

  it('remove button is disabled when planId is in removingPlanIds (Req 5.3)', () => {
    const assignments = [makeAssignment({ planId: 'plan-deleting' })];
    renderCalendar({ assignments, removingPlanIds: new Set(['plan-deleting']) });

    expect(screen.getByRole('button', { name: 'Remove assignment' })).toBeDisabled();
  });

  it('remove button is enabled when planId is not in removingPlanIds', () => {
    const assignments = [makeAssignment({ planId: 'plan-1' })];
    renderCalendar({ assignments, removingPlanIds: new Set() });

    expect(screen.getByRole('button', { name: 'Remove assignment' })).not.toBeDisabled();
  });
});
