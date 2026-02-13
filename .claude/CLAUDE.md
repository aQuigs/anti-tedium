# Form Filler Extension

## Quick Reference

```bash
npm run test:unit         # 24 unit tests — pure Node, no browser, <1s
npm run test:integration  # 21 Playwright integration tests — needs Chromium
npm test                  # both
```

## Architecture

Chrome MV3 WebExtension. No build step, no bundler — raw JS loaded directly by the browser.

- **`src/shared/`** — Pure JS modules (storage, url-matcher, constants). Imported by unit tests via ESM. NOT importable from content scripts or popup (those run in browser context without ESM). The content script and popup duplicate the storage key constant (`formFillerData`) inline.
- **`src/content/content-script.js`** — Runs on every page at `document_idle`. Reads `chrome.storage.local`, matches domain, fills inputs, clicks buttons. Also relays `window.postMessage` from the picker (MAIN world) to the service worker via `chrome.runtime.sendMessage`. No imports.
- **`src/content/element-picker.js`** — Injected on demand via `chrome.scripting.executeScript` into the **MAIN world** (`world: 'MAIN'`). Uses Shadow DOM for UI isolation. IIFE, no imports. Communicates with background via `window.postMessage` → content script relay → `chrome.runtime.sendMessage` (because `chrome.runtime` is not available in MAIN world).
- **`src/content/selector-generator.js`** — Standalone ESM module for unit testing. The picker has its own inline copy of the selector logic (necessary since it's injected as a single file).
- **`src/background/service-worker.js`** — Handles context menu, message routing (SAVE_ENTRY, GET_ENTRIES, INJECT_PICKER), storage writes.
- **`src/popup/`** — Extension popup UI. Reads/writes `chrome.storage.local` directly.

## Storage

Single key `formFillerData` in `chrome.storage.local`. Schema in `src/shared/constants.js`. The `createStorage()` wrapper in `storage.js` is used by unit tests with a mock; the actual extension code accesses `chrome.storage.local` directly.

## Testing Constraints

### Unit tests
- Use Node's built-in test runner (`node:test`), not Jest or Vitest
- Each `describe` block has `{ timeout: 50 }` — any test exceeding 50ms fails
- `selector-generator.js` tests use mock element objects (no jsdom)
- `storage.js` tests use an in-memory mock of `chrome.storage.local`

### Offline-only tests
- All tests (unit and integration) MUST run without internet access
- Never hit external sites (google.com, etc.) in automated tests — use local fixture HTML pages served by the test server instead
- Manual verification against real sites is fine but must not be part of the test suite

### Integration tests (Playwright)
- Extensions require headed Chromium — `headless: false` in config
- Custom fixture at `tests/fixtures/extension.js` launches persistent context with `--load-extension`
- Test server at `tests/test-server.js` (express, port 3947) serves fixture HTML pages
- Storage is seeded via `sw.evaluate()` on the service worker
- Most picker tests inject inline via `chrome.scripting.executeScript({ func })` to exercise picker logic from the content script world. A separate `production injection via files` test validates the real `{ files, world: 'MAIN' }` injection path.
- Picker's `form-filler-picker` element is checked with `{ state: 'attached' }` not `visible` (Shadow DOM host has no dimensions by default due to `:host { all: initial }`)

## Gotchas

- **Element picker MUST run in MAIN world** — `customElements` is `null` in Chrome's content script isolated world. The picker uses `customElements.define()`, so it must be injected with `world: 'MAIN'`. Since `chrome.runtime` is unavailable in MAIN world, the picker uses `window.postMessage` and the content script (which runs in ISOLATED world) relays messages to the service worker.
- `manifest.json` requires `host_permissions: ["<all_urls>"]` for `chrome.scripting.executeScript` to work on arbitrary pages. `activeTab` alone only grants permission on user gesture.
- The `tabs` permission is needed for `chrome.tabs.query` in popup and service worker.
- Firefox uses `manifest.firefox.json` (MV2). To test Firefox, copy it over `manifest.json`.
- `package.json` has `"type": "module"` for ESM in test files and config. The extension source files are NOT ES modules (no import/export) — they're plain scripts loaded by the browser.
- The `selector-generator.js` in `src/content/` IS an ES module (for unit test imports). It is NOT loaded by the extension runtime. The picker inlines its own copy of the algorithm.

## Entry Types

| Type | `input` field | `button` field | `strategy` |
|------|:---:|:---:|:---:|
| `input_and_button` | required | required | null |
| `button_only` | null | required | null |
| `strategy_only` | optional | optional | `fill_no_click` or `click_only` |

## Future Work (Not Implemented)

- Path prefix matching (schema supports it, matcher supports it, but no UI for it)
- Edit existing entries from popup
- Multiple entries per domain with ordering controls
- Import/export of rules
- SPA navigation re-trigger (content script only runs on initial load, not on pushState)
