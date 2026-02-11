import { test, expect } from '../fixtures/extension.js';

const STORAGE_KEY = 'formFillerData';

function makeState(entries = []) {
  return {
    schemaVersion: 1,
    globalSettings: { enabled: true, defaultDelay: 300 },
    entries,
  };
}

function makeEntry(overrides = {}) {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 8),
    enabled: true,
    urlMatch: { domain: 'example.com', pathPrefix: null },
    type: 'input_and_button',
    input: {
      selector: 'input[name="email"]',
      selectorMeta: { usedAttributes: ['name'], humanReadable: 'email input' },
      value: 'user@example.com',
    },
    button: {
      selector: 'button[type="submit"]',
      selectorMeta: { usedAttributes: ['type'], humanReadable: 'submit button' },
    },
    strategy: null,
    execution: { delayBeforeAction: 500, delayBetweenActions: 200, waitForElement: true, waitTimeout: 5000 },
    ...overrides,
  };
}

async function seedAndOpenPopup(context, extensionId, state) {
  const sw = context.serviceWorkers().find(w => w.url().includes(extensionId));
  await sw.evaluate((data) => chrome.storage.local.set({ formFillerData: data }), state);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  return page;
}

test('shows empty state when no entries', async ({ context, extensionId }) => {
  const page = await seedAndOpenPopup(context, extensionId, makeState());
  await expect(page.locator('.empty-state')).toBeVisible({ timeout: 5000 });
});

test('displays entry cards', async ({ context, extensionId }) => {
  const entries = [
    makeEntry({ id: 'e1', urlMatch: { domain: 'github.com' } }),
    makeEntry({ id: 'e2', urlMatch: { domain: 'microsoft.com' }, type: 'button_only' }),
  ];
  const page = await seedAndOpenPopup(context, extensionId, makeState(entries));
  await expect(page.locator('.entry-card')).toHaveCount(2, { timeout: 5000 });
});

test('shows type badge on entry cards', async ({ context, extensionId }) => {
  const entry = makeEntry({ type: 'button_only' });
  const page = await seedAndOpenPopup(context, extensionId, makeState([entry]));
  await expect(page.locator('.type-badge')).toContainText('button', { timeout: 5000 });
});

test('global enable toggle works', async ({ context, extensionId }) => {
  const page = await seedAndOpenPopup(context, extensionId, makeState([makeEntry()]));
  const toggle = page.locator('#global-toggle');
  await expect(toggle).toBeChecked({ timeout: 5000 });

  await toggle.uncheck();
  await page.waitForTimeout(300);

  const sw = context.serviceWorkers().find(w => w.url().includes(extensionId));
  const stored = await sw.evaluate(() => chrome.storage.local.get('formFillerData'));
  expect(stored.formFillerData.globalSettings.enabled).toBe(false);
});

test('per-entry enable/disable toggle works', async ({ context, extensionId }) => {
  const entry = makeEntry({ id: 'toggle-test' });
  const page = await seedAndOpenPopup(context, extensionId, makeState([entry]));

  const entryToggle = page.locator('.entry-toggle').first();
  await expect(entryToggle).toBeChecked({ timeout: 5000 });

  await entryToggle.uncheck();
  await page.waitForTimeout(300);

  const sw = context.serviceWorkers().find(w => w.url().includes(extensionId));
  const stored = await sw.evaluate(() => chrome.storage.local.get('formFillerData'));
  expect(stored.formFillerData.entries[0].enabled).toBe(false);
});

test('delete button removes entry', async ({ context, extensionId }) => {
  const entries = [makeEntry({ id: 'del-1' }), makeEntry({ id: 'del-2' })];
  const page = await seedAndOpenPopup(context, extensionId, makeState(entries));

  await expect(page.locator('.entry-card')).toHaveCount(2, { timeout: 5000 });
  await page.locator('.delete-btn').first().click();
  await expect(page.locator('.entry-card')).toHaveCount(1);

  const sw = context.serviceWorkers().find(w => w.url().includes(extensionId));
  const stored = await sw.evaluate(() => chrome.storage.local.get('formFillerData'));
  expect(stored.formFillerData.entries.length).toBe(1);
});

test('shows domain and selector info on cards', async ({ context, extensionId }) => {
  const entry = makeEntry({ urlMatch: { domain: 'login.example.com' } });
  const page = await seedAndOpenPopup(context, extensionId, makeState([entry]));

  await expect(page.locator('.entry-domain').first()).toContainText('login.example.com', { timeout: 5000 });
  await expect(page.locator('.entry-selector').first()).toContainText('input[name="email"]', { timeout: 5000 });
});
