# Recipe Miscellaneous Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GitHub issue #4 across recipe persistence, editing, display, and tests.

**Architecture:** Extend the existing recipe contracts with backward-compatible optional fields and
nullable handful quantities. Keep editor state explicit, defer portion scaling to submit, and merge
ingredient presentation with availability rendering.

**Tech Stack:** React 18, TypeScript, Jest, Testing Library, AWS Lambda/DynamoDB, Playwright.

---

- [x] 1. Add sorted `unit` metadata to frontend and backend unit systems
  - Write failing unit tests for the new key and alphabetical order.
  - Add the metadata and deterministic sorting.
  - Run frontend and backend unit-type tests.

- [x] 2. Extend recipe contracts and backend validation
  - Write failing tests for sections, null handful quantities, chef notes, and instruction arrays.
  - Update recipe types, validation, persistence, and availability calculation.
  - Run backend recipe tests.

- [x] 3. Add editor support for sections, chef notes, instruction steps, and deferred scaling
  - Write failing component tests for each interaction and save payload.
  - Replace the instruction textarea with ordered step fields.
  - Add section inputs and handful-specific quantity validation.
  - Replace live edit scaling with portions-only controls and save-time scaling.
  - Run RecipeEditor tests.

- [x] 4. Consolidate recipe detail ingredient rendering
  - Write failing tests for one-row-per-ingredient rendering, sections, compact layout, statuses,
    numbered steps, and chef notes.
  - Update `IngredientAvailability` and `RecipeDetail`.
  - Run RecipeDetail and IngredientAvailability tests.

- [ ] 5. Add end-to-end coverage
  - [x] Add a Playwright scenario that creates and edits the new recipe fields.
  - [x] Verify section grouping, empty handful quantity, numbered instructions, chef notes, inline missing
        status, alphabetical units, and save-time portion scaling.
  - [ ] Run the focused Playwright spec. On June 8, 2026, all 119 Playwright tests were
        discovered but browser startup was blocked by `browserType.launch: spawn EPERM`. The in-app
        Browser fallback also failed during sandbox initialization, so no browser process could run.

- [ ] 6. Verify and publish
  - [x] Run `npm run lint`.
  - [x] Run `npm run type-check`.
  - [x] Run `npm run test:unit`.
  - [x] Run `npm run test:property`.
  - [x] Run backend and frontend production builds.
  - [ ] Run `npm run test:e2e`. Blocked by the browser startup restrictions documented above.
  - [ ] Commit, push, and open a non-draft PR linked to issue #4.
