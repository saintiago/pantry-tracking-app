# Language selection

- Support English (`en`), Spanish (`es`), and Italian (`it`). English is the app fallback.
- A flag button in the top panel opens a language selector with native language names.
  The login screen also offers the selector. Use SVG flags so Windows renders flags.
- Resolve language from the current account's preference on this browser first; otherwise
  read the account locale, then the first supported browser language, then English.
- When the account or browser supplies the initial language, persist it on this device.
  Later account changes do not override an existing device preference.
- Selecting a language applies to this device immediately. “Use this language as account
  default” explicitly saves the same selection to the account for future devices.
- Browser preferences are scoped per account. An explicit choice on the current login
  screen can seed an account with no local preference; automatic detection cannot override
  the account language discovered after signing in.
- Preserve all user-written content, including names, recipe steps, notes, tags, custom
  categories, brands, and storage-location names. Do not translate or rewrite it.
- Translate app-owned labels, standard units, department choices, statuses, validation,
  known API messages, calendars, and numeric displays. Content loaded after a language
  switch must use the current language. Canonical stored values never change with language.
- Switching must preserve navigation, unsaved forms, shopping state, and cooking progress.
- Storage/network failures must leave the app usable and explain which preference was
  not saved. A failed account read must not persist a provisional fallback over the account.
- Late account responses must not overwrite a newer selection or another user's session.

## Verification

Unit tests cover precedence, language negotiation, storage corruption/failure, account
switches, late responses, account-save retry, interpolation, units, dates, and catalogs.
Browser tests cover separate devices sharing an account, persistence across reloads,
system fallback, unfinished forms, delayed recipes, unchanged user content, cooking,
shopping departments, account-save failure, blocked storage, and a 320px menu.
