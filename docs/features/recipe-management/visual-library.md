# Visual recipe library — issue #17

Implements [Enhancements 9-9](https://github.com/saintiago/pantry-tracking-app/issues/17).
Supersedes issue #15's always-visible cookbook cards and separate New cookbook button,
and the earlier reset-on-detail-return filter behavior.

My cookbooks shows compact rectangular covers, several per desktop row and two per
320px mobile row. Title and small recipe count sit above the cover; description stays
below it. Clicking the title or image opens that cookbook's recipes. Edit/remove are
icon buttons with accessible names, revealed on hover, keyboard focus or touch hold;
they are always available inside the selected cookbook. Deletion retains its existing
confirmation and preserves recipes. A touch hold reveals actions without opening the
book; moving or cancelling the pointer cancels the hold.

All recipes hides the cookbook shelf and shows the recipe library, retaining search,
tags, time, availability and expiration filters. Each collection offers List, Icons
and Larger images, using recipe main images with an initial fallback when absent or
unavailable. All recipes starts as a list; cookbook contents start as compact icons.
The two view choices are independent session state. Returning from recipe details
preserves the selected collection, filters and view. New cookbook lives in New Recipe.
Time sliders are compact and sit above search and tags, retaining recorded-duration
stops and keyboard input.

New or replacement cookbook covers are resized to at most 720px on their longest side
and JPEG-compressed below 203 KB before uploading. Existing private image IDs remain
valid and are not rewritten. Shelf and recipe card image requests start only near the
viewport, with reserved aspect ratios, native lazy loading and asynchronous decoding.
Image failure leaves a usable card; opening the recipe retains the detailed image retry.

Recipes, Meal Plan and Shopping List use the requested inventory-to-recipes,
recipes-to-meal-plan and meal-plan-to-shopping-list subtitles in all three languages.
See [testing](../../development/testing.md) and [data contracts](../../architecture/data-model.md).
