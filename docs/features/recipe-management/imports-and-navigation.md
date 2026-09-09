# Recipe imports and compact navigation — issue #14

This extension follows [issue #14](https://github.com/saintiago/pantry-tracking-app/issues/14).
It supersedes the bottom Settings tab and the planner's household kcal display.

Settings is reached by the gear beside the language selector; storage locations
start collapsed. The planner groups Day/Week/Two weeks under View, places Shopping
at the top right, and keeps icon-labelled Undo beside the calendar. Servings and
heart-labelled copy/favorite controls expand on demand. Its subtitle is “From recipes
to your weekly plan.” Only kcal per portion and unknown-entry notices are displayed.
The existing calorie contract and batch snapshots remain unchanged.

New Recipe offers manual entry, a camera/upload photo, or a public HTTPS recipe link.
Imports open the existing editor with a review banner, extraction method, extracted
text and missing/uncertain fields. Ingredient and instruction rows can be reordered,
edited, added or removed. Existing required tags and validation still apply. Only
Create Recipe persists a recipe and its placeholders. Cancel abandons the draft.
Failed/partial imports allow retry, a replacement source, or manual entry. Source
images are optional and require an explicit permission choice before using the
existing private image upload flow.

Amazon Bedrock Nova Lite interprets recipe images and fetched text. The selected input
is sent to AWS only when extraction is requested; the UI explains this. Model output
is bounded and validated as a draft, with no tool execution or database writes.
If Bedrock is unavailable, links retain available schema.org Recipe metadata/plain
text and display the fallback. Photos offer on-device Tesseract recognition in
English, Spanish and Italian. Worker/runtime/language files are hosted by this app
and downloaded on demand. Clear printed recipes work best. Unknown portions/units
remain unresolved for human review; nutrition is never invented.

The authenticated endpoint revalidates redirects/DNS answers and pins connections to
public addresses. Credentials, private networks and non-HTTPS links are rejected;
time, response size and content type are bounded. It does not bypass access controls.
See [API contracts](../../architecture/data-model.md) and
[module ownership](../../architecture/modules.md).

AWS account verification initially blocked Bedrock, then cleared during implementation;
a real recipe extraction succeeded. Release checks must distinguish an actual Bedrock extraction from metadata/OCR fallback. Tests cover
both paths, actual browser OCR, editable review, explicit save, reordering, unsafe
URLs, failures, legacy flows and narrow layouts.

References: [schema.org Recipe](https://schema.org/Recipe),
[Nova image input](https://docs.aws.amazon.com/nova/latest/userguide/modalities-image-examples.html),
[Tesseract local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).
