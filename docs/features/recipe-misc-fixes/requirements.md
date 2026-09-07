# Requirements Document: Recipe Miscellaneous Fixes

## Introduction

This feature implements GitHub issue #4 for the recipe editor and detail view. It extends
recipe ingredients with optional sections, adds chef notes and numbered instruction steps,
improves unit and quantity behavior, consolidates ingredient availability into one list, and
defers edit-mode portion scaling until save.

## Requirements

### Requirement 1: Recipe Units

1. THE Unit_System SHALL include a `unit` key displayed as "unit" or "units".
2. THE Recipe_Editor SHALL display unit options alphabetically by visible singular label.
3. THE backend SHALL accept `unit` as a valid recipe and inventory unit.

### Requirement 2: Ingredient Sections

1. THE Recipe_Editor SHALL allow each ingredient to have an optional section name.
2. THE Recipe_Detail SHALL group consecutive ingredients under their section heading.
3. Ingredients without a section SHALL remain in the default ingredient group.
4. Existing recipes without section values SHALL remain readable and editable.

### Requirement 3: Optional Handful Quantity

1. THE Recipe_Editor SHALL allow quantity to be empty only when the selected unit is `handful`.
2. THE Recipe_Editor SHALL continue requiring a positive quantity for every other unit.
3. THE Recipe_Lambda SHALL accept `null` quantity for `handful` and reject missing or invalid
   quantities for other units.
4. THE Recipe_Detail SHALL display an empty-quantity handful ingredient without a numeric prefix.
5. Availability for an empty-quantity handful SHALL be `available` when matching inventory has a
   positive quantity and `missing` otherwise.

### Requirement 4: Chef Notes

1. THE Recipe_Editor SHALL provide an optional free-text field labeled "Chef's notes".
2. THE Recipe_Lambda SHALL persist optional `chefNotes` values on create and update.
3. THE Recipe_Detail SHALL display chef notes below instructions when present.
4. Existing recipes without chef notes SHALL remain valid.

### Requirement 5: Unified Ingredient List

1. THE Recipe_Detail SHALL render each ingredient exactly once.
2. Quantity, unit, ingredient name, and availability state SHALL appear in the same row.
3. Missing and partial ingredients SHALL remain in their original section and list position.
4. The spacing between quantity, unit, and ingredient name SHALL be compact and visually connected.
5. The missing-or-partial summary SHALL remain visible.

### Requirement 6: Deferred Edit-Mode Portion Scaling

1. WHEN editing a recipe, changing portions SHALL NOT change ingredient fields while the editor is open.
2. WHEN the edit is saved with a changed portions value, ingredient quantities SHALL be scaled once
   using `new portions / original portions`.
3. Empty handful quantities SHALL remain empty during scaling.
4. The update request SHALL persist the new portions and the save-time scaled quantities together.
5. View-mode portion controls SHALL remain display-only and SHALL continue scaling immediately.

### Requirement 7: Numbered Instruction Steps

1. THE Recipe_Editor SHALL represent instructions as an ordered list of non-empty steps.
2. THE user SHALL be able to add and remove instruction steps.
3. THE Recipe_Detail SHALL display instructions as a numbered list.
4. Newly saved recipes SHALL persist instructions as an array of strings.
5. Legacy string instructions SHALL load as steps and remain readable.

## Correctness Properties

1. For every valid unit list, visible labels are in ascending locale order.
2. For every ingredient, quantity is valid iff it is positive or its unit is `handful` and quantity
   is `null`.
3. Saving an edit from portions P to P2 scales each numeric quantity by P2/P exactly once and leaves
   null quantities unchanged.
4. Every ingredient appears exactly once in the unified detail list regardless of availability.
