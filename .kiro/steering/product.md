# Pantry Tracking App

A Progressive Web App (PWA) for household inventory management. Users track food and household items across storage locations (Pantry, Fridge, Freezer, Limbo Pantry), plan meals, and generate shopping lists.

## Core Features

- Inventory management with add/remove/update (barcode scanning, manual entry, receipt OCR)
- Low-stock threshold notifications
- Recipe management with ingredient availability checking
- Day/week/two-week meal planner with pastel breakfast/lunch/dinner slots, a single
  alphabetical recipe library with tag filters, shared recipe/cooking navigation,
  per-meal and bulk servings, drag handles and accessible move/remove actions
- Shopping list generation from meal plans minus current inventory
- Offline-first with service worker caching and background sync
- Cognito-based authentication (email/password)

## Target Platform

Mobile-first smartphone experience optimized for quick add/remove operations. Installable as a PWA. Supports screen widths 320px–1920px.

## Languages

English (default), Spanish, and Italian are available from the top-panel flag selector.
Device preference takes precedence over account locale; new devices copy account locale,
or detect a supported browser language and fall back to English. Device choices are scoped
per account. Saving an account default is explicit and leaves other devices unchanged.
Translate app-owned UI and standard labels, including asynchronously loaded views; preserve
user-written names, recipes, notes, tags, and custom categories. See `../specs/language/`.

## Shopping companion and visual system (September 2026)

The approved extension in `../specs/shopping-list/second-brain.md` supersedes the
initial manual-restock quantity and limited purchase-form rules. Planning has three
lists (meals, restock, manual), a combined store/department Shopping mode, product
preferences, package rounding, defer/unavailable controls, partial purchases, purchase
history and an order preview with estimated prices/budgets. Manual items/preferences
are saved per user on this device; inventory and plans retain their cloud APIs.
Ordering is a draft and product links only; retailer checkout and receipt OCR remain
future integrations. Selected filters are mint; all app pages use the shared neutral
and pastel palette with dark text.
