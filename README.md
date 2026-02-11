# Form Filler Extension

Cross-browser WebExtension (Chrome MV3 + Firefox MV2) that auto-fills forms and clicks buttons on registered pages. Designed to expedite repetitive login flows across GitHub SSO, Microsoft FIDO, Okta, etc.

## Install

### Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select this directory

### Firefox

1. Copy `manifest.firefox.json` to `manifest.json` (back up the original)
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on" → select the `manifest.json`

## Usage

1. Navigate to a login page
2. Click the extension icon → "Add Rule"
3. Hover over elements — the picker highlights them
4. Click an input field → enter the value to fill → click "Select Button"
5. Click the submit button → Confirm
6. Navigate away and back — the extension auto-fills on page load

## How It Works

- **Registry**: Rules are stored in `chrome.storage.local`, keyed by domain
- **Auto-execution**: A content script runs on every page load, checks for matching rules, fills inputs and clicks buttons with configurable delays
- **Element picker**: A visual overlay (Shadow DOM isolated) lets you select elements and generates resilient CSS selectors (prioritizing `aria-label`, `name`, `placeholder` over volatile IDs/classes)

## Entry Types

| Type               | Description                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| `input_and_button` | Fill an input field, then click a button                                              |
| `button_only`      | Just click a button                                                                   |
| `strategy_only`    | Fill without clicking (`fill_no_click`) or click without filling (`click_only`)       |

## Development

```bash
npm install
npx playwright install chromium
npm run test:unit         # 24 unit tests (no browser needed)
npm run test:integration  # 20 Playwright integration tests
npm test                  # both
```

## Architecture

```text
src/
├── background/service-worker.js  — Context menu, messaging, storage coordination
├── content/
│   ├── content-script.js         — Auto-fill on page load
│   ├── element-picker.js         — Visual picker with Shadow DOM
│   └── selector-generator.js     — Resilient selector algorithm
├── popup/                        — Extension popup UI
└── shared/
    ├── storage.js                — Storage abstraction (CRUD)
    ├── constants.js              — Entry types, strategies, defaults
    └── url-matcher.js            — Domain/path matching
```
