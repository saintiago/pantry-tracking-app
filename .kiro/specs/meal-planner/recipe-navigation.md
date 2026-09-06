# Planner recipe navigation — September 2026

This extension supersedes the repeated tag sections and title-as-placement behavior
in the original spec and issue #5. Source: the shared chat "Define shopping list
behavior", approved with the final request to use pasta for lunch and implement
the remaining first-release requirements.

## Requirements

- Open the existing recipe detail from either library names or scheduled names.
  Opening never modifies an assignment. Show scheduled date, meal and servings.
- Reuse RecipeDetail, RecipeEditor and CookingPage. Scale displayed ingredients
  to planned servings. Saving servings changes only that meal; recipe yield is
  unchanged and the existing shopping calculation consumes the saved assignment.
- Provide a contextual return from details and cooking. Preserve week, day/week/
  fortnight view, selected date, search, selected categories and calendar/library
  scroll. Restore focus to the opened recipe. Support browser Back and resumable
  cooking steps.
- Show a single alphabetical name-only library, search and existing tag filters.
  Multiple categories match any selected tag, with no duplicated recipes. Selected
  categories use mint. Untagged recipes can be filtered as Uncategorized.
- Use a separate drag/placement handle. Touch/keyboard can select the handle then
  activate a dated meal. Provide Move to and Remove in a meal overflow menu.
  Keep one add action per meal slot, with the clicked meal preselected.
- Breakfast is cream #FFF2CC with ☀️; lunch terracotta #F4D1C1 with 🍝;
  dinner lavender blue #DEE3F5 with 🌙. Keep charcoal text and canonical API values
  independent of translated labels. Supply English, Spanish and Italian UI labels.

## Design

App retains the mounted planner while another page/cooking is shown. The planner
keeps its calendar mounted but hidden while shared detail/editor/move views are
visible, preserving local filter and scroll state. History entries identify the
recipe context; cooking uses a separate entry and keeps the shared session in App.
The single-assignment PUT client reuses the existing backend contract for servings
and date/meal changes. Failed writes preserve the form and saved assignment.

## Deferred roadmap

The source chat explicitly placed leftovers/batch portions, copy-week/templates,
flexible meal entries, pantry suggestions, preparation reminders and household
coordination beyond the proposed first release. They require separate entity and
shopping-demand decisions; they are not part of this navigation release.

## Validation

Extend stateful browser tests for detail/cooking/return, servings, search/category
union, views, move/removal, errors, keyboard/touch, palette and canonical translated
drag targets. Retain real pointer-drag regression coverage. Run type checking,
unit/property tests, lint, full browser tests, build, deployment and live UI checks.
