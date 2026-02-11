import { test, expect } from '../fixtures/extension.js';

const BASE_URL = 'http://localhost:3947/pages';
const STORAGE_KEY = 'formFillerData';

function makeState(entries) {
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
    urlMatch: { domain: 'localhost', pathPrefix: null },
    type: 'input_and_button',
    input: {
      selector: 'input[name="email"]',
      selectorMeta: {},
      value: 'test@example.com',
    },
    button: {
      selector: 'button[type="submit"]',
      selectorMeta: {},
    },
    strategy: null,
    execution: {
      delayBeforeAction: 100,
      delayBetweenActions: 50,
      waitForElement: true,
      waitTimeout: 5000,
    },
    ...overrides,
  };
}

async function seedStorage(page, extensionId, state) {
  const sw = page.context().serviceWorkers().find(w => w.url().includes(extensionId));
  await sw.evaluate((data) => {
    return chrome.storage.local.set({ formFillerData: data });
  }, state);
}

test('fills input and clicks button on simple login page', async ({ context, extensionId }) => {
  const entry = makeEntry();
  const page = await context.newPage();
  await seedStorage(page, extensionId, makeState([entry]));
  await page.goto(`${BASE_URL}/simple-login.html`);
  await expect(page.locator('#result')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#result')).toContainText('test@example.com');
});

test('respects fill_no_click strategy', async ({ context, extensionId }) => {
  const entry = makeEntry({ strategy: 'fill_no_click' });
  const page = await context.newPage();
  await seedStorage(page, extensionId, makeState([entry]));
  await page.goto(`${BASE_URL}/simple-login.html`);
  await page.waitForTimeout(1500);
  await expect(page.locator('input[name="email"]')).toHaveValue('test@example.com');
  await expect(page.locator('#result')).not.toBeVisible();
});

test('handles button_only entries', async ({ context, extensionId }) => {
  const entry = makeEntry({
    type: 'button_only',
    input: null,
    button: { selector: 'button[type="submit"]', selectorMeta: {} },
  });
  const page = await context.newPage();
  await seedStorage(page, extensionId, makeState([entry]));
  await page.goto(`${BASE_URL}/simple-login.html`);
  await expect(page.locator('#result')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#result')).toContainText('Submitted:');
});

test('skips disabled entries', async ({ context, extensionId }) => {
  const entry = makeEntry({ enabled: false });
  const page = await context.newPage();
  await seedStorage(page, extensionId, makeState([entry]));
  await page.goto(`${BASE_URL}/simple-login.html`);
  await page.waitForTimeout(1500);
  await expect(page.locator('input[name="email"]')).toHaveValue('');
});

test('waits for element in SPA page', async ({ context, extensionId }) => {
  const entry = makeEntry({
    input: { selector: 'input[name="email"]', selectorMeta: {}, value: 'spa@test.com' },
    button: { selector: 'button[type="submit"]', selectorMeta: {} },
    execution: { delayBeforeAction: 100, delayBetweenActions: 50, waitForElement: true, waitTimeout: 5000 },
  });
  const page = await context.newPage();
  await seedStorage(page, extensionId, makeState([entry]));
  await page.goto(`${BASE_URL}/spa-login.html`);
  await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#result')).toContainText('spa@test.com');
});

test('skips entries for different domains', async ({ context, extensionId }) => {
  const entry = makeEntry({ urlMatch: { domain: 'other.com', pathPrefix: null } });
  const page = await context.newPage();
  await seedStorage(page, extensionId, makeState([entry]));
  await page.goto(`${BASE_URL}/simple-login.html`);
  await page.waitForTimeout(1500);
  await expect(page.locator('input[name="email"]')).toHaveValue('');
});

test('fills textarea elements', async ({ context, extensionId }) => {
  const entry = makeEntry({
    input: {
      selector: 'textarea[name="query"]',
      selectorMeta: {},
      value: 'hello world',
    },
    button: {
      selector: '#search-btn',
      selectorMeta: {},
    },
  });
  const page = await context.newPage();
  await seedStorage(page, extensionId, makeState([entry]));
  await page.goto(`${BASE_URL}/textarea-search.html`);
  await expect(page.locator('#result')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#result')).toContainText('hello world');
});

test('does nothing when globally disabled', async ({ context, extensionId }) => {
  const state = makeState([makeEntry()]);
  state.globalSettings.enabled = false;
  const page = await context.newPage();
  await seedStorage(page, extensionId, state);
  await page.goto(`${BASE_URL}/simple-login.html`);
  await page.waitForTimeout(1500);
  await expect(page.locator('input[name="email"]')).toHaveValue('');
});
