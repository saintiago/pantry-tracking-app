# Language implementation

`frontend/src/i18n/i18n.ts` owns the language store and translation/formatting helpers.
Components subscribe with `useLanguage()` (React `useSyncExternalStore`) and translate at
render time. This updates mounted and lazy-loaded screens without remounting them.
English source messages are stable catalog keys and the built-in fallback; English needs
no catalog download. Each other language owns one JSON file in `i18n/locales/`, including
its singular forms and API error translations. `catalog-urls.ts` imports only hashed asset
URLs with `?url&no-inline`; catalogs are never embedded in JavaScript or preloaded by HTML.
`catalogs.ts` fetches only a resolved or explicitly selected language, shares concurrent
requests, and retains successful downloads in memory. Failed/invalid downloads are not
cached and can be retried, with a ten-second request deadline.

The active language, dictionary, formatting and document language change together after
loading succeeds. Until then the current UI and form state remain usable. The selector
shows download progress and retry errors; failed choices do not overwrite device storage
or allow saving an unintended account default. A newer selection/account change cancels
the earlier activation, even if its download finishes later. Account preference resolution
does not download a provisional system catalog while waiting for the account response.
Interpolation never translates its values.

The service worker caches requested hashed JSON assets alongside app assets. Previously
cached languages can be loaded offline with the cached app version; an unvisited language
requires connectivity. Merely opening the language menu downloads no catalogs. Cache
eviction and app-version updates can require another download. This does not add offline
cloud-data reads or writes.

To add a language, add its JSON catalog and URL entry, native-name metadata in `i18n.ts`,
and the appropriate selector flag. Preserve English keys/interpolation slots and supply
singular overrides where needed. New languages add only a URL/name to the initial app;
their dictionary bytes are fetched only when selected. Extend catalog completeness and
language negotiation tests with the new language.

`LanguageProvider` sits inside `AuthProvider`. It resolves preference precedence and
guards asynchronous results against account changes, unmounts, and newer device choices.
The `storage` event synchronizes tabs of the same account on the same browser.

Account language uses Cognito's standard `locale` attribute via authenticated
`getUserAttributes` / `updateAttributes`; read the fresh profile rather than a stale ID
token claim. Restore the session with `getSession` on the same `CognitoUser` instance
used for the attribute operation: `getCurrentUser` creates a new instance each time.
Recheck the current account after session restoration to prevent an account-switch race.
The existing app client has default standard-attribute read/write permissions.
No DynamoDB migration or additional endpoint is needed.

Device key: `pantry-language-v1:<userId>`; logged-out key: `pantry-language-v1:guest`.
Value: `{ language: 'en' | 'es' | 'it', source: 'explicit' | 'account' | 'system' }`.
Invalid data is ignored; storage exceptions are handled. Guest choices transfer only when
explicitly made in the current login session, preventing another account's old guest
preference from silently taking over. System fallback is temporary when account reads fail.

`t` translates app-owned keys and interpolated templates. `message` additionally handles
known canonical English messages from state/API responses, translating at render time so
late responses and already visible errors follow the current language. Unknown errors
remain intact to preserve diagnostics. Never pass user content to either helper.

Unit keys, department option values, IDs, inventory groups, ingredient matching, dates
in storage, and other API contracts remain language-neutral. Localized display functions
leave these values unchanged. Existing saved content and imported product text remain
original; this feature does not perform machine translation.

Shopping lines represent an unspecified store with an empty string and translate its
placeholder only when rendering. A user-written store named `Any store` stays unchanged.
Store filter values encode the original string so the all-stores option and an
unspecified store remain distinct when the language changes.
