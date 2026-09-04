# Windows Chrome mouse-drag follow-up

The user reported that click-to-place worked on the deployed v0.0.48 planner but
mouse dragging did not. Native dragging succeeded in some automated checks, so
those successes did not establish reliable behavior in the user's browser session.
The exact trigger in that session was not isolated.

The local fix replaces native HTML dragging with pointer capture for mouse/pen.
A six-pixel movement starts a drag, a floating label follows the cursor, the dated
meal beneath it highlights, and release submits exactly one assignment. Cancellation
and releases outside a meal do not submit. The recipe library scrolls independently,
and dragging near the window/calendar edges scrolls to additional dates. Touch
continues to scroll normally and uses tap-to-place; keyboard selection is preserved.

Verification on 2026-09-04:

- Installed Windows Chrome: all 10 focused drag/touch cases passed.
- Full Playwright suite: 187 passed.
- Frontend unit/property suite: 638 passed across 44 suites.
- Frontend type checking and production build, repository lint and diff whitespace
  check passed.
- Inspected the active-drag screenshot: floating recipe label and highlighted meal
  appear at the actual mouse destination.

Tests include ordinary mouse press/move/release, cancellation of native HTML drag
events, exact recipe identity after scrolling a long library, release outside a
meal, Escape, pointer cancellation, edge scrolling, touch swiping and touch taps.
Scroll and tap tests are separate gestures so synthetic swipe momentum cannot consume
the tap under test. The initial combined test exposed that test-driver timing issue.

This follow-up is local and has not been committed or deployed. The live diagnostic
intercepted meal-creation requests, so it did not modify account data. Release awaits
the new explicit commit/deploy instruction required by AGENTS.md and workflow.md.
