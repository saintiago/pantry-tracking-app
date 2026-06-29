# Requirements Document

## Introduction

This feature bundles two complementary inventory enhancements for the Pantry Tracking App:

1. **Merge identical items on add** — When a user adds an item that is identical to an existing item in every comparable field except quantity, the quantity is added to the existing item rather than creating a duplicate row. If any comparable field differs, a separate item is created so no information is lost. The behavior is surfaced reactively in the Add Item frontend (autocomplete-driven autofill, dynamic submit button label, and highlight color) and is authoritatively enforced on the backend, which is the source of truth for the merge decision.

2. **Group identical items within a category view** — Within the existing category drill-down view, items that share the same name, category, and unit are displayed as a single expandable parent row that summarizes the group. Individual items remain separate database rows; the grouped row is a purely client-side UI construct. Expanding the group reveals the underlying items, sorted by expiration date, visually distinguished from the main list through indentation, distinct formatting, and connector lines.

The two features are complementary: Feature 1 collapses exact duplicates at write time, while Feature 2 visually groups items that share name + category + unit but differ in other comparable fields (such as expiration date or location) so they appear together while remaining distinct rows.

This feature references the shared `InventoryItem` schema, API contracts, and access patterns defined in `.kiro/steering/data-model.md` rather than redefining them.

## Glossary

- **Inventory_Backend**: The Inventory Lambda handler (`backend/src/handlers/inventory/inventory.ts`) responsible for persisting inventory items and authoritatively enforcing merge behavior.
- **Add_Item_Page**: The frontend Add Item page (`frontend/src/pages/AddItemPage/AddItemPage.tsx`) where users enter new inventory items.
- **Inventory_List**: The frontend inventory list component (`frontend/src/components/InventoryList/InventoryList.tsx`) that renders the category and item views.
- **Comparable_Fields**: The set of `InventoryItem` fields used to determine whether two items are "the same item" for merge purposes: `name`, `category`, `expirationDate`, `location`, `unit`, `barcode`, `brand`, `whereToBuy`, and `onlineStoreLink`. Quantity and picture are excluded.
- **Merge_Match**: An existing inventory item belonging to the same user whose Comparable_Fields are all equal to those of a newly submitted item.
- **Merge_Operation**: The act of increasing an existing matched item's quantity by the submitted quantity instead of creating a new item.
- **Grouping_Key**: The tuple (`name`, `category`, `unit`) used to group items into a single parent row in the category view.
- **Grouped_Row**: A client-side-only parent row in the category view that represents all items sharing a Grouping_Key.
- **Child_Item**: An individual `InventoryItem` displayed within an expanded Grouped_Row.
- **Autofill**: The Add_Item_Page behavior that copies field values from a selected autocomplete suggestion into the form, highlighting copied fields.
- **Prefilled_Field**: A form field whose value was populated by Autofill and has not been edited by the user.
- **Low_Stock**: The condition where an item's `quantity` is less than or equal to its `threshold`, reflected by the `isLowStock` flag.

## Requirements

### Requirement 1: Backend merge detection on add

**User Story:** As a user, I want adding an item identical to one I already have to increase its quantity instead of creating a duplicate, so that my inventory stays clean and accurate.

#### Acceptance Criteria

1. WHEN an add-item request is received, THE Inventory_Backend SHALL search the requesting user's existing inventory items for a Merge_Match before creating a new item.
2. THE Inventory_Backend SHALL treat an existing item as a Merge_Match for a submitted item only when every field in Comparable_Fields is equal according to the equality semantics defined in Requirement 2.
3. IF the submitted item differs from an existing item in any field in Comparable_Fields, THEN THE Inventory_Backend SHALL NOT treat that existing item as a Merge_Match.
4. WHERE a Merge_Match exists, THE Inventory_Backend SHALL perform a Merge_Operation that increases the matched item's `quantity` by the submitted quantity, recomputes its `isLowStock` flag, updates its `updatedAt` timestamp, and increments its `syncVersion`, instead of creating a new item.
5. WHERE no Merge_Match exists, THE Inventory_Backend SHALL create a new inventory item.
6. WHERE more than one existing item qualifies as a Merge_Match, THE Inventory_Backend SHALL select the match with the earliest `createdAt`, tie-broken by the lexicographically smallest `itemId`, apply the Merge_Operation to only that item, and leave all other matching items unmodified.
7. WHEN a Merge_Operation completes, THE Inventory_Backend SHALL return the updated existing item in the mutation response together with an indicator that the operation was a merge.
8. WHEN a new item is created because no Merge_Match exists, THE Inventory_Backend SHALL return the created item in the mutation response together with an indicator that the operation was a creation.
9. IF a concurrent modification causes the Merge_Operation's optimistic-locking check on `syncVersion` to fail, THEN THE Inventory_Backend SHALL re-evaluate the Merge_Match and retry the operation up to 3 attempts, and SHALL leave the user's inventory unchanged and return a conflict error if all attempts are exhausted.

### Requirement 2: Comparable-field equality semantics

**User Story:** As a user, I want items to merge only when they are truly identical, so that differences like expiration date or location never cause me to lose information.

#### Acceptance Criteria

1. IF the submitted item's `expirationDate`, compared as an ISO date string, differs from an existing item's `expirationDate`, THEN THE Inventory_Backend SHALL create a separate item.
2. IF the submitted item's `location`, compared as an exact location identifier, differs from an existing item's `location`, THEN THE Inventory_Backend SHALL create a separate item.
3. THE Inventory_Backend SHALL apply the same equality rule uniformly to every field in Comparable_Fields (`name`, `category`, `expirationDate`, `location`, `unit`, `barcode`, `brand`, `whereToBuy`, `onlineStoreLink`).
4. WHEN comparing an optional Comparable_Field that is present and non-empty on one item and absent or empty on the other, THE Inventory_Backend SHALL treat the two values as not equal.
5. WHEN comparing an optional Comparable_Field that is absent or empty on both items, THE Inventory_Backend SHALL treat the two values as equal.
6. THE Inventory_Backend SHALL exclude `quantity` and picture from the Comparable_Fields comparison.
7. WHEN comparing the string Comparable_Fields (`name`, `category`, `barcode`, `brand`, `whereToBuy`, `onlineStoreLink`), THE Inventory_Backend SHALL compare values case-insensitively after trimming leading and trailing whitespace.
8. WHEN comparing the `unit` field, THE Inventory_Backend SHALL resolve each value to its canonical unit key before comparison so that legacy and modern values mapping to the same key are treated as equal.

### Requirement 3: Quantity merging and low-stock recalculation

**User Story:** As a user, I want the merged item to reflect the combined quantity and correct low-stock status, so that my totals and alerts stay accurate.

#### Acceptance Criteria

1. WHEN a Merge_Operation is performed, THE Inventory_Backend SHALL set the matched item's resulting `quantity` to the exact arithmetic sum of its existing `quantity` and the submitted quantity, preserving fractional values without rounding or truncation.
2. WHEN a Merge_Operation changes an item's `quantity`, THE Inventory_Backend SHALL recalculate the item's `isLowStock` flag so that it is true if and only if the item has a defined `threshold` and the resulting `quantity` is less than or equal to that `threshold`.
3. WHEN a Merge_Operation changes the matched item's `isLowStock` value, THE Inventory_Backend SHALL include a low-stock transition indicator in the mutation response that reflects the new `isLowStock` value, consistent with the existing update behavior.
4. IF a Merge_Operation leaves the matched item's `isLowStock` value unchanged, THEN THE Inventory_Backend SHALL NOT include a low-stock transition indicator in the mutation response.
5. WHEN a Merge_Operation updates an item, THE Inventory_Backend SHALL set the item's `updatedAt` timestamp to the time the merge is applied and increment its `syncVersion` by exactly 1.

### Requirement 4: Autofill copies expiration date

**User Story:** As a user, I want selecting an existing item suggestion to copy its expiration date while still letting me adjust it, so that adding a truly identical item takes minimal effort.

#### Acceptance Criteria

1. WHEN a user selects an autocomplete suggestion that triggers a full Autofill AND the selected suggestion has a non-empty `expirationDate` AND the expiration date field is empty, THE Add_Item_Page SHALL copy the suggestion's `expirationDate` into the expiration date field.
2. WHEN a full Autofill copies a non-empty `expirationDate` into the empty expiration date field, THE Add_Item_Page SHALL mark the expiration date field as a Prefilled_Field.
3. WHEN a full Autofill completes AND the expiration date field is empty, THE Add_Item_Page SHALL prompt the user to confirm or change the expiration date by moving focus to the expiration date field and opening its date picker.
4. IF a full Autofill is triggered AND the expiration date field already contains a value entered or edited by the user, THEN THE Add_Item_Page SHALL leave the existing expiration date value unchanged, SHALL NOT mark the expiration date field as a Prefilled_Field, and SHALL NOT move focus to the expiration date field or open its date picker.
5. IF a full Autofill is triggered AND the selected suggestion has no `expirationDate`, THEN THE Add_Item_Page SHALL leave the expiration date field unchanged and SHALL NOT mark the expiration date field as a Prefilled_Field.

### Requirement 5: Dynamic submit button reflecting merge state

**User Story:** As a user, I want the submit button to tell me whether I am adding quantity to an existing item or creating a new one, so that I understand the outcome before I submit.

#### Acceptance Criteria

1. WHILE an autocomplete suggestion is selected AND every Prefilled_Field other than quantity equals the value originally populated by Autofill, THE Add_Item_Page SHALL display the submit button with a label indicating quantity is being added to an existing item.
2. IF an autocomplete suggestion is selected AND any Prefilled_Field other than quantity has a current value different from the value originally populated by Autofill, THEN THE Add_Item_Page SHALL display the submit button with a label that includes the word "new".
3. WHEN a field value changes, THE Add_Item_Page SHALL update the submit button label to reflect the current merge state within 200 milliseconds.
4. WHILE no autocomplete suggestion has been selected, THE Add_Item_Page SHALL display the submit button with a label that includes the word "new".
5. THE Add_Item_Page SHALL exclude the quantity field from the determination of merge state, so that editing the quantity does not change the submit button away from the "add to existing item" label.
6. WHILE an add-item submission is in progress, THE Add_Item_Page SHALL disable the submit button and indicate that submission is in progress.

### Requirement 6: Reactive highlight color for merge state

**User Story:** As a user, I want field highlight colors to signal whether I am updating an existing item or filling in a new one, so that I get clear visual feedback as I edit.

#### Acceptance Criteria

1. WHILE all Prefilled_Fields from a selected suggestion (other than quantity) remain equal to their originally populated values, THE Add_Item_Page SHALL display those Prefilled_Fields with a yellow highlight that is visually distinct from the existing prefilled highlight color and maintains a text contrast ratio of at least 4.5:1.
2. WHILE at least one Prefilled_Field from a selected suggestion (other than quantity) differs from its originally populated value, THE Add_Item_Page SHALL display the remaining Prefilled_Fields with the existing prefilled highlight color rather than yellow.
3. WHEN a field value changes, THE Add_Item_Page SHALL update the highlight color of the affected fields to reflect the current merge state within 200 milliseconds.
4. WHEN a user edits a Prefilled_Field, THE Add_Item_Page SHALL stop highlighting that individual field as prefilled, consistent with existing behavior.
5. THE Add_Item_Page SHALL exclude the quantity field from the merge-state determination, so that editing the quantity does not change the highlight color of the other Prefilled_Fields.
6. THE Add_Item_Page SHALL derive the highlight color from the same merge-state condition used to determine the submit button label in Requirement 5.

### Requirement 7: Group identical items in the category view

**User Story:** As a user, I want items that share a name, category, and unit to appear together as one expandable row in the category view, so that my inventory is easier to scan.

#### Acceptance Criteria

1. WHILE the Inventory_List displays the item list for a selected category, THE Inventory_List SHALL group the currently displayed (post-filter) items by Grouping_Key into Grouped_Rows.
2. THE Inventory_List SHALL compute Grouped_Rows client-side from the provided items without creating or modifying any database records.
3. THE Inventory_List SHALL assign each currently displayed item in the selected category to exactly one Grouped_Row.
4. WHERE a Grouping_Key maps to exactly one item, THE Inventory_List SHALL display that item as a Grouped_Row containing a single Child_Item.
5. WHEN the set of displayed items changes, including when the text, location, or low-stock filters change, THE Inventory_List SHALL recompute the Grouped_Rows so that every displayed item remains represented.
6. WHEN grouping items by `name`, THE Inventory_List SHALL treat two names as equal after trimming leading and trailing whitespace, collapsing internal whitespace, and comparing case-insensitively.
7. WHEN grouping items by `unit`, THE Inventory_List SHALL compare units by canonical unit key so that legacy and modern unit values mapping to the same key group together.
8. THE Inventory_List SHALL order Grouped_Rows in ascending order by normalized, case-insensitive `name`, tie-broken by canonical unit key.

### Requirement 8: Expand and collapse grouped rows

**User Story:** As a user, I want to expand a grouped row to see the individual items inside it, so that I can inspect and act on each one.

#### Acceptance Criteria

1. WHEN a user activates a Grouped_Row, including a Grouped_Row containing a single Child_Item, THE Inventory_List SHALL toggle that group between expanded and collapsed, showing its Child_Items when expanding and hiding them when collapsing.
2. WHILE a Grouped_Row is expanded, THE Inventory_List SHALL display the group's Child_Items sorted in ascending order by `expirationDate`, tie-broken by ascending `createdAt` and then ascending `itemId`.
3. WHILE a Grouped_Row is collapsed, THE Inventory_List SHALL hide the group's Child_Items.
4. WHEN a Grouped_Row is first rendered, THE Inventory_List SHALL render it collapsed with its Child_Items hidden.
5. WHEN the displayed items change due to filtering, item updates, or recomputation, THE Inventory_List SHALL preserve the expand or collapse state of Grouped_Rows that remain present.
6. WHEN a Grouped_Row has keyboard focus and the user presses Enter or Space, THE Inventory_List SHALL toggle the Grouped_Row identically to pointer activation and SHALL prevent the default scrolling behavior of the Space key.
7. THE Inventory_List SHALL expose each Grouped_Row's expanded or collapsed state and its association with its Child_Items to assistive technologies.

### Requirement 9: Grouped row summary

**User Story:** As a user, I want each grouped row to summarize its contents, so that I can understand the group without expanding it.

#### Acceptance Criteria

1. THE Inventory_List SHALL display on each Grouped_Row the total quantity of its Child_Items expressed in the group's shared unit, formatted to a maximum of 2 decimal places with trailing zeros and any trailing decimal point removed.
2. THE Inventory_List SHALL display on each Grouped_Row the count of Child_Items in the group as a non-negative integer equal to the number of Child_Items assigned to that group.
3. WHERE at least one Child_Item in a group is Low_Stock, THE Inventory_List SHALL display a low-stock indicator on the Grouped_Row.
4. WHERE no Child_Item in a group is Low_Stock, THE Inventory_List SHALL NOT display a low-stock indicator on the Grouped_Row.
5. THE Inventory_List SHALL compute each Grouped_Row's total quantity as the sum of the `quantity` values of its Child_Items.
6. WHERE a Grouped_Row's displayed total quantity equals 1, THE Inventory_List SHALL render the group's shared unit using its singular label.
7. WHERE a Grouped_Row's displayed total quantity does not equal 1, THE Inventory_List SHALL render the group's shared unit using its plural label.

### Requirement 10: Visual hierarchy for child items

**User Story:** As a user, I want expanded child items to be clearly distinguished from the main list, so that I can see which items belong to which group.

#### Acceptance Criteria

1. WHILE a Grouped_Row is expanded, THE Inventory_List SHALL render its Child_Items with visual indentation of at least 16 pixels relative to the Grouped_Row.
2. WHILE a Grouped_Row is expanded, THE Inventory_List SHALL render connector lines linking the Child_Items to their parent Grouped_Row.
3. WHILE a Grouped_Row is expanded, THE Inventory_List SHALL render Child_Items with a background treatment distinct from top-level Grouped_Rows.
4. WHERE a Child_Item exposes interactive controls, THE Inventory_List SHALL render those controls with a minimum touch target of 44 by 44 pixels.
5. WHEN a user activates a Child_Item, THE Inventory_List SHALL open that item's detail view, consistent with item activation in the ungrouped list.
6. WHERE a Child_Item is Low_Stock, THE Inventory_List SHALL render that Child_Item with a low-stock visual treatment.

## Correctness Properties

The following properties are suitable for property-based testing with fast-check.

- **Merge idempotence on field set**: For any item, determining a Merge_Match using Comparable_Fields yields the same result regardless of the order in which fields are compared, and comparing an item against itself always yields a match.
- **Quantity conservation across add operations**: For any sequence of add operations applied to a user's inventory, the total quantity across all items equals the sum of all submitted quantities (merges add quantity; non-merges add a new item), with no quantity lost or duplicated.
- **No item lost on differing fields**: For any submitted item that differs from every existing item in at least one Comparable_Field, the resulting inventory item count increases by exactly one.
- **Merge reduces or preserves count**: For any submitted item, the resulting inventory item count is either unchanged (merge) or increased by exactly one (new item), never more.
- **Grouping partitions items exactly**: For any list of items in a category, the union of all Grouped_Rows' Child_Items equals the input set, the Child_Item sets are pairwise disjoint, and the sum of Child_Item counts equals the input count.
- **Grouped total quantity conservation**: For any Grouped_Row, its summarized total quantity equals the sum of its Child_Items' quantities.
- **Child sort order**: For any expanded Grouped_Row, its Child_Items are ordered by non-decreasing `expirationDate`.
- **Group low-stock correctness**: For any Grouped_Row, its low-stock indicator is shown if and only if at least one Child_Item is Low_Stock.
