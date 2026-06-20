const MEAL_TYPE_ORDER: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Returns the ISO date string (YYYY-MM-DD) of the Monday of the week
 * containing the given reference Date.
 * Uses UTC to avoid timezone-dependent day-of-week shifts.
 */
export function getWeekStart(reference: Date): string {
  // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
  // We want Monday (1). Offset: (day + 6) % 7 gives days since Monday.
  const dayOfWeek = reference.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate() - daysSinceMonday,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Adds the given number of days to an ISO YYYY-MM-DD date string and returns
 * the resulting ISO date string. Supports negative values.
 */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Returns an array of exactly 7 consecutive ISO date strings starting from
 * weekStart (inclusive): [weekStart, weekStart+1, ..., weekStart+6].
 */
export function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Returns the abbreviated day-of-week label for the given ISO date string,
 * e.g. "Mon", "Tue", "Wed".
 */
export function getDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return DAY_LABELS[date.getUTCDay()];
}

/**
 * Returns the numeric calendar day-of-month for the given ISO date string,
 * e.g. 15 for "2024-03-15".
 */
export function getDayNumber(isoDate: string): number {
  const [, , day] = isoDate.split('-').map(Number);
  return day;
}

export interface Assignment {
  planId: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeName: string;
  createdAt: string;
}

/**
 * Returns a sorted copy of the assignments array ordered by:
 *   1. mealType: breakfast < lunch < dinner
 *   2. createdAt ascending (lexicographic ISO timestamp comparison)
 * Does not mutate the input array.
 */
export function sortAssignments(assignments: Assignment[]): Assignment[] {
  return [...assignments].sort((a, b) => {
    const mealDiff = (MEAL_TYPE_ORDER[a.mealType] ?? 0) - (MEAL_TYPE_ORDER[b.mealType] ?? 0);
    if (mealDiff !== 0) return mealDiff;
    // ISO timestamps compare lexicographically
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return 0;
  });
}

/**
 * Groups assignments by date, returning a Record keyed by each date in weekDates.
 * Assignments whose date is not in weekDates are excluded.
 * Each value is sorted via sortAssignments.
 */
export function groupByDate(
  assignments: Assignment[],
  weekDates: string[],
): Record<string, Assignment[]> {
  const weekDateSet = new Set(weekDates);
  const groups: Record<string, Assignment[]> = {};

  // Initialise all week dates with empty arrays so every day has an entry
  for (const date of weekDates) {
    groups[date] = [];
  }

  for (const assignment of assignments) {
    if (weekDateSet.has(assignment.date)) {
      groups[assignment.date].push(assignment);
    }
  }

  for (const date of weekDates) {
    groups[date] = sortAssignments(groups[date]);
  }

  return groups;
}
