# Design Document: Recipe Miscellaneous Fixes

## Overview

The change extends the existing recipe model without a data migration. New recipes use instruction
arrays and nullable handful quantities, while rendering and editing normalize legacy string
instructions and recipes without the new optional fields.

## Data Model

```typescript
interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string;
  section?: string;
  inventoryItemId?: string;
}

interface Recipe {
  instructions: string | string[];
  chefNotes?: string;
}
```

`null` is used instead of `undefined` inside ingredient arrays so DynamoDB document marshalling is
deterministic. It is valid only for the `handful` unit.

## Frontend

- `units.ts` adds `unit` metadata and exports alphabetically sorted `VALID_UNITS`.
- `RecipeEditor` stores instruction rows with stable IDs, ingredient section text, and a plain
  edit-mode portions value. It does not scale fields on portions changes.
- On edit submit, numeric quantities are scaled from the originally loaded portions to the selected
  portions. Null handful quantities pass through unchanged.
- `RecipeDetail` normalizes instruction strings to steps and renders an ordered list.
- `IngredientAvailability` becomes the single ingredient renderer. It receives recipe ingredients,
  aligns availability by index, groups consecutive section values, and renders inline status chips.

## Backend

- Ingredient validation accepts a positive number for all units and additionally accepts `null` for
  `handful`.
- Availability treats null handful quantity as a presence check.
- `chefNotes` is persisted by create and update.
- Instructions accept either a non-empty string or a non-empty array of non-empty strings, preserving
  backward compatibility while new clients send arrays.

## Portion Scaling

The editor retains `originalPortions`. Changing the portions control updates only the count. On save:

```text
numeric quantity -> round(quantity * selectedPortions / originalPortions, 2)
null quantity    -> null
```

This gives users stable ingredient inputs while editing and applies the automatic adjustment only at
the save boundary.

## Testing

- Unit tests cover sorted units, quantity validation, nullable handful availability, instruction
  normalization, chef notes, sections, unified rendering, and deferred portion scaling.
- E2E tests cover the complete editor/detail workflow.
- Full lint, type checking, unit/property tests, and Playwright tests run before publication.
