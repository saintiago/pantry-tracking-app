import React, { useState } from 'react';
import { t, useLanguage } from '../../i18n/i18n';
const topics = [
  [
    'Getting started',
    [
      'Start in Settings to choose your language, measurements and appearance, and add your storage locations. Use Inventory, Recipes, Meal Plan and Shopping List along the bottom to move around.',
      'Inventory, recipes and meal plans save to your signed-in account online. Shopping preferences and display settings save for this account on the current device. Keep a connection when saving cloud data.',
    ],
  ],
  [
    'Inventory and storage',
    [
      'Choose Add to enter a product or scan its barcode. Review the name, quantity, unit and location, then select an expiration date or Not applicable. A barcode suggestion is a starting point; check it before saving.',
      'Open a category, then a product to see its individual stock entries. Each entry keeps its own quantity, location and expiration. Open an entry to edit it; removal asks for confirmation.',
      'Use search and location filters to narrow the list. Set a product’s low-stock threshold to be reminded when stock reaches that amount. A blank threshold turns the warning off. Compatible weight or volume units are converted for comparison.',
      'Storage locations can be added, renamed or removed in Settings. Move items out of a location before removing it. Product icons appear in the pastel theme.',
    ],
  ],
  [
    'Recipes, imports and cookbooks',
    [
      'Choose Recipes, then New Recipe. Add manually, paste a public recipe link, or take/upload a clear photo of a written recipe. AI extraction creates a draft for review, not a saved recipe.',
      'Check the extracted ingredients, quantities, units, portions and instructions. Correct missing or uncertain details and reorder rows if needed. Add at least one tag, then save. If extraction fails, retry or use manual entry; printed-text recognition is also available for photos.',
      'Create a cookbook with a name, description and optional cover, then select the recipes to include. Recipes may belong to several cookbooks. Open a cookbook to browse it, or choose All recipes. Removing a cookbook keeps its recipes.',
      'Search by name or tag. Time sliders use the durations recorded in your recipes. Only recipes I can make now checks ingredients against stock. Ingredients expiring soon helps prioritize food within the selected window.',
      'Open a recipe to view ingredients and steps, edit it, or start cooking. Cooking mode keeps your current step while you visit another page; use Return to Cooking to resume. Adjusting portions scales ingredient quantities.',
    ],
  ],
  [
    'Planning meals and favorites',
    [
      'Choose Day, Week or Two weeks and use the previous/next controls to change dates. The servings slider sets portions for new assignments. Update future meals is a separate action for existing assignments.',
      'Drag a recipe to a breakfast, lunch or dinner slot, or use Plan and choose a destination. On touchscreens, hold before dragging; a normal swipe scrolls. Open Recipe drawer on narrow screens to reach the library.',
      'Open a scheduled meal to edit it. You can plan a recipe, leftovers, eating out or a note. The remove button deletes only the assignment. Undo becomes available after an undoable saved change.',
      'Under Recipes, open Favorite Weeks/Days. Choose the current day or week, enter a name and save it. Select a saved favorite, choose a destination, preview the copied meals, then Apply copy. Existing destination meals remain; check the preview for collisions.',
    ],
  ],
  [
    'Prepared batches and leftovers',
    [
      'Plan a cooking batch when one preparation will serve several meals. Set the cooking yield separately from the portions eaten at a meal. Link later meals to its leftovers.',
      'After cooking, confirm the actual yield, preparation date and storage. Prepared batches appear beneath Recipes. Record portions eaten or discarded, and resolve shortages before allocating more leftovers.',
      'Preparing a batch does not automatically deduct raw ingredients from inventory. Shopping counts ingredients for the cooking batch once; prepared leftovers do not add the same ingredients again.',
    ],
  ],
  [
    'Shopping, purchases and sharing',
    [
      'Open Shopping List or Shop for these meals in the planner. Select the period and optional day, recipe or ingredient filters. The list combines planned ingredients, low-stock replenishment and things you add manually.',
      'Arrange by Recipe, Aisle, A to Z or Recently added. Shopping mode groups by store. Product preferences can hold a store, package size, desired reserve, price estimate and a purchase link.',
      'Checking an item puts it in your basket without changing inventory. The red X removes it from the selected shopping period after confirmation; use Removed from this list to restore it. Changing the period may bring the requirement back.',
      'Defer an item to another date or mark it unavailable when needed. Record the actual product, quantity, unit and storage when adding a purchase to inventory. If a save result is uncertain, refresh inventory before submitting again to avoid duplicates.',
      'Share the shopping list or meal plan with its Share button. Supported devices open their usual sharing options; otherwise copy the plain text into another app. Nothing is sent until you choose to send it.',
      'Order preview shows estimated costs and product links. It does not place an order or import receipts.',
    ],
  ],
  [
    'Measurements and appearance',
    [
      'Settings offers As recorded, Metric and Imperial (US customary). Switching changes displayed measurements without rewriting saved quantities. Cups, tablespoons and teaspoons use US customary volumes. Weight and volume are never converted into each other.',
      'Quantity fields show the selected measurement system. You can type decimals or supported fractions. Review the adjacent unit before saving. Pieces, handfuls and other counts have no assumed weight.',
      'Manage units lets you add supported units to the picker, remove choices and move them up or down. Existing entries keep their unit even when it is removed from the list. Reset unit list restores the default choices.',
      'Pastel colors uses the familiar colors and emojis. Minimalist uses black and white and hides decorative emojis. System mode follows the device’s light or dark setting. Change language in Settings; saving an account default is optional.',
    ],
  ],
  [
    'Connection and troubleshooting',
    [
      'The app can cache its screens, but cloud reads and writes need a connection. Check the Online indicator and use the retry action after a connection failure. Changes are not queued for automatic offline upload.',
      'Allow camera access to scan barcodes or take photos. You can always enter a barcode manually or choose a photo file instead. Clear, well-lit printed recipes are easiest to import.',
      'If another edit has changed a cookbook or plan, reload the latest data and review your changes before retrying. Unsaved recipe imports can be cancelled without creating a recipe.',
    ],
  ],
] as const;
export default function HelpPage() {
  useLanguage();
  const [search, setSearch] = useState('');
  const visible = topics.filter(([title, paragraphs]) =>
    [title, ...paragraphs].some((text) =>
      t(text).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ),
  );
  return (
    <section style={{ maxWidth: 800, margin: 'auto' }}>
      <h2>{t('Help')}</h2>
      <p>{t('How to use Pantry Tracking App')}</p>
      <label>
        {t('Search help')}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
          style={{ display: 'block', width: '100%', minHeight: 44, padding: 10, margin: '12px 0' }}
        />
      </label>
      {!visible.length && <p>{t('No help topics match your search.')}</p>}
      {visible.map(([title, paragraphs]) => (
        <details
          key={title}
          open={search ? true : undefined}
          style={{
            margin: '12px 0',
            padding: 16,
            border: '1px solid var(--color-border)',
            borderRadius: 12,
          }}
        >
          <summary style={{ minHeight: 44, fontWeight: 700 }}>{t(title)}</summary>
          {paragraphs.map((text) => (
            <p key={text} style={{ margin: '12px 0' }}>
              {t(text)}
            </p>
          ))}
        </details>
      ))}
    </section>
  );
}
