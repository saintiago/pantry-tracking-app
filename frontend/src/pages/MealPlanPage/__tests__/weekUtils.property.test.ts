/**
 * Property-based tests for weekUtils.ts.
 * Feature: meal-planner
 */
import * as fc from 'fast-check';
import {
  getWeekStart,
  addDays,
  getWeekDates,
  sortAssignments,
  groupByDate,
  Assignment,
} from '../weekUtils';

/* ── Arbitraries ────────────────────────────────────────────────── */

/**
 * Generates a safe ISO date string (YYYY-MM-DD) using year/month/day integers
 * constrained to avoid month-overflow issues. Day is capped at 28 to be safe
 * across all months.
 */
const isoDateArb: fc.Arbitrary<string> = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  });

/** Generates a Date object within a bounded range. */
const referenceDateArb: fc.Arbitrary<Date> = fc
  .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  // Truncate to midnight UTC to keep tests deterministic
  .map((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));

const mealTypeArb = fc.constantFrom('breakfast', 'lunch', 'dinner') as fc.Arbitrary<
  'breakfast' | 'lunch' | 'dinner'
>;

const assignmentArb: fc.Arbitrary<Assignment> = fc.record({
  planId: fc.uuid(),
  date: isoDateArb,
  mealType: mealTypeArb,
  recipeName: fc.string({ minLength: 1, maxLength: 50 }),
  createdAt: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map((d) => d.toISOString()),
});

/* ── Helper: parse ISO date to UTC day-of-week (0=Sun … 6=Sat) ─── */
function utcDayOfWeek(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isoToUtcMs(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/* ── Property 1: Week_Start is the Monday of the reference week ─── */

// Feature: meal-planner, Property 1: Week_Start is the Monday of the reference week
describe('Property 1: Week_Start is the Monday of the reference week', () => {
  it(
    'getWeekStart returns Monday on-or-before reference, no more than 6 days before',
    () => {
      fc.assert(
        fc.property(referenceDateArb, (reference) => {
          const weekStart = getWeekStart(reference);

          // (a) falls on a Monday (UTC day 1)
          expect(utcDayOfWeek(weekStart)).toBe(1);

          const weekStartMs = isoToUtcMs(weekStart);
          const referenceMs = Date.UTC(
            reference.getUTCFullYear(),
            reference.getUTCMonth(),
            reference.getUTCDate(),
          );

          // (b) is on or before the reference date
          expect(weekStartMs).toBeLessThanOrEqual(referenceMs);

          // (c) is no more than 6 days before the reference date
          const diffDays = (referenceMs - weekStartMs) / (1000 * 60 * 60 * 24);
          expect(diffDays).toBeLessThanOrEqual(6);
        }),
        { numRuns: 100 },
      );
    },
  );
});

/* ── Property 2: A week spans seven consecutive dates from Week_Start ── */

// Feature: meal-planner, Property 2: A week spans seven consecutive dates from Week_Start
describe('Property 2: A week spans seven consecutive dates from Week_Start', () => {
  it(
    'getWeekDates returns exactly 7 dates where each equals addDays(weekStart, i)',
    () => {
      fc.assert(
        fc.property(isoDateArb, (weekStart) => {
          const dates = getWeekDates(weekStart);

          // Exactly 7 dates
          expect(dates).toHaveLength(7);

          // Each date equals addDays(weekStart, i) for i=0..6
          for (let i = 0; i < 7; i++) {
            expect(dates[i]).toBe(addDays(weekStart, i));
          }

          // First date equals weekStart
          expect(dates[0]).toBe(weekStart);

          // Last date equals addDays(weekStart, 6)
          expect(dates[6]).toBe(addDays(weekStart, 6));

          // All dates match YYYY-MM-DD format
          const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
          dates.forEach((d) => expect(d).toMatch(isoPattern));
        }),
        { numRuns: 100 },
      );
    },
  );
});

/* ── Property 3: Week navigation is an exact ±7-day shift and round-trips ── */

// Feature: meal-planner, Property 3: Week navigation is an exact ±7-day shift and round-trips
describe('Property 3: Week navigation is an exact ±7-day shift and round-trips', () => {
  it(
    'advancing then returning restores the original weekStart',
    () => {
      fc.assert(
        fc.property(isoDateArb, (weekStart) => {
          const nextWeek = addDays(weekStart, 7);
          const prevWeek = addDays(weekStart, -7);

          // Round-trip: next then back
          expect(addDays(nextWeek, -7)).toBe(weekStart);

          // Round-trip: prev then forward
          expect(addDays(prevWeek, 7)).toBe(weekStart);

          // The diff in milliseconds must be exactly ±7 days
          const startMs = isoToUtcMs(weekStart);
          const nextMs = isoToUtcMs(nextWeek);
          const prevMs = isoToUtcMs(prevWeek);

          const msPerDay = 1000 * 60 * 60 * 24;
          expect(nextMs - startMs).toBe(7 * msPerDay);
          expect(startMs - prevMs).toBe(7 * msPerDay);
        }),
        { numRuns: 100 },
      );
    },
  );
});

/* ── Property 4: Assignment ordering is by meal type then creation time ── */

// Feature: meal-planner, Property 4: Assignment ordering is by meal type then creation time
describe('Property 4: Assignment ordering is by meal type then creation time', () => {
  const MEAL_TYPE_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

  it(
    'sortAssignments orders by mealType (breakfast<lunch<dinner) then createdAt ascending',
    () => {
      fc.assert(
        fc.property(fc.array(assignmentArb, { minLength: 0, maxLength: 20 }), (assignments) => {
          const sorted = sortAssignments(assignments);

          // Result is a permutation — same length
          expect(sorted).toHaveLength(assignments.length);

          // Verify ordering invariant for each consecutive pair
          for (let i = 0; i < sorted.length - 1; i++) {
            const a = sorted[i];
            const b = sorted[i + 1];
            const orderA = MEAL_TYPE_ORDER[a.mealType];
            const orderB = MEAL_TYPE_ORDER[b.mealType];

            // mealType order must be non-decreasing
            expect(orderA).toBeLessThanOrEqual(orderB);

            // Within the same mealType, createdAt must be non-decreasing (lexicographic)
            if (orderA === orderB) {
              expect(a.createdAt <= b.createdAt).toBe(true);
            }
          }

          // Verify it doesn't mutate the original (result is a new array)
          const originalFirst = assignments[0];
          if (originalFirst) {
            // The original array reference is unchanged — sort returns a new array
            expect(sorted).not.toBe(assignments);
          }

          // Verify all original elements appear in the sorted result
          const sortedIds = sorted.map((a) => a.planId).sort();
          const originalIds = assignments.map((a) => a.planId).sort();
          expect(sortedIds).toEqual(originalIds);
        }),
        { numRuns: 100 },
      );
    },
  );
});

/* ── Property 5: Each assignment is placed under its own date ────── */

// Feature: meal-planner, Property 5: Each assignment is placed under its own date
describe('Property 5: Each assignment is placed under its own date', () => {
  it(
    'groupByDate places each assignment under its date key, excludes out-of-week assignments',
    () => {
      fc.assert(
        fc.property(
          isoDateArb.chain((weekStart) => {
            const weekDates = getWeekDates(weekStart);
            return fc
              .array(assignmentArb, { minLength: 0, maxLength: 30 })
              .map((assignments) => ({ assignments, weekDates }));
          }),
          ({ assignments, weekDates }) => {
            const weekDateSet = new Set(weekDates);
            const grouped = groupByDate(assignments, weekDates);

            // All week dates have a key in the result
            for (const date of weekDates) {
              expect(grouped).toHaveProperty(date);
            }

            // No extra keys beyond the week dates
            const resultKeys = Object.keys(grouped);
            expect(resultKeys).toHaveLength(weekDates.length);
            for (const key of resultKeys) {
              expect(weekDateSet.has(key)).toBe(true);
            }

            // Each assignment inside the week appears under its own date key
            for (const assignment of assignments) {
              if (weekDateSet.has(assignment.date)) {
                const bucket = grouped[assignment.date];
                expect(bucket.some((a) => a.planId === assignment.planId)).toBe(true);
              }
            }

            // No assignment appears under a different date key
            for (const [date, bucket] of Object.entries(grouped)) {
              for (const assignment of bucket) {
                expect(assignment.date).toBe(date);
              }
            }

            // Assignments outside the week are excluded entirely
            const outsideAssignments = assignments.filter((a) => !weekDateSet.has(a.date));
            const allGroupedIds = new Set(
              Object.values(grouped)
                .flat()
                .map((a) => a.planId),
            );
            for (const outside of outsideAssignments) {
              // An assignment outside the week must not appear in any bucket
              // (note: planId could collide with an in-week assignment by chance via fc.uuid,
              //  so we check only assignments that are genuinely outside AND have a unique id)
              const alsoInWeek = assignments.some(
                (a) => a.planId === outside.planId && weekDateSet.has(a.date),
              );
              if (!alsoInWeek) {
                expect(allGroupedIds.has(outside.planId)).toBe(false);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
