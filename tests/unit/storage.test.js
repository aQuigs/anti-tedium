import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../../src/shared/storage.js';
import { ENTRY_TYPES, SCHEMA_VERSION } from '../../src/shared/constants.js';

function mockChromeStorage() {
  let data = {};
  return {
    local: {
      get: (keys) => Promise.resolve(
        typeof keys === 'string' ? { [keys]: data[keys] } :
        Array.isArray(keys) ? Object.fromEntries(keys.map(k => [k, data[k]])) :
        { ...data }
      ),
      set: (obj) => { Object.assign(data, obj); return Promise.resolve(); },
    },
    _data: data,
    _reset: () => { data = {}; },
  };
}

describe('Storage', { timeout: 50 }, () => {
  let storage;
  let chrome;

  beforeEach(() => {
    chrome = mockChromeStorage();
    storage = createStorage(chrome);
  });

  it('initializes with default schema when empty', async () => {
    const state = await storage.load();
    assert.equal(state.schemaVersion, SCHEMA_VERSION);
    assert.equal(state.globalSettings.enabled, true);
    assert.deepEqual(state.entries, []);
  });

  it('persists and retrieves entries', async () => {
    const entry = {
      id: 'test-1',
      enabled: true,
      urlMatch: { domain: 'example.com', pathPrefix: null },
      type: ENTRY_TYPES.INPUT_AND_BUTTON,
      input: { selector: 'input[name="email"]', selectorMeta: {}, value: 'a@b.com' },
      button: { selector: 'button[type="submit"]', selectorMeta: {} },
      strategy: null,
      execution: { delayBeforeAction: 500, delayBetweenActions: 200, waitForElement: true, waitTimeout: 5000 },
    };

    await storage.addEntry(entry);
    const state = await storage.load();
    assert.equal(state.entries.length, 1);
    assert.equal(state.entries[0].id, 'test-1');
  });

  it('removes an entry by id', async () => {
    await storage.addEntry({ id: 'a', enabled: true, urlMatch: { domain: 'a.com' }, type: ENTRY_TYPES.BUTTON_ONLY });
    await storage.addEntry({ id: 'b', enabled: true, urlMatch: { domain: 'b.com' }, type: ENTRY_TYPES.BUTTON_ONLY });
    await storage.removeEntry('a');
    const state = await storage.load();
    assert.equal(state.entries.length, 1);
    assert.equal(state.entries[0].id, 'b');
  });

  it('updates an entry by id', async () => {
    await storage.addEntry({ id: 'x', enabled: true, urlMatch: { domain: 'x.com' }, type: ENTRY_TYPES.BUTTON_ONLY });
    await storage.updateEntry('x', { enabled: false });
    const state = await storage.load();
    assert.equal(state.entries[0].enabled, false);
  });

  it('gets entries by domain', async () => {
    await storage.addEntry({ id: '1', enabled: true, urlMatch: { domain: 'login.microsoft.com' }, type: ENTRY_TYPES.BUTTON_ONLY });
    await storage.addEntry({ id: '2', enabled: true, urlMatch: { domain: 'github.com' }, type: ENTRY_TYPES.BUTTON_ONLY });
    await storage.addEntry({ id: '3', enabled: true, urlMatch: { domain: 'login.microsoft.com' }, type: ENTRY_TYPES.INPUT_AND_BUTTON });

    const msEntries = await storage.getEntriesForDomain('login.microsoft.com');
    assert.equal(msEntries.length, 2);
    assert.ok(msEntries.every(e => e.urlMatch.domain === 'login.microsoft.com'));
  });

  it('updates global settings', async () => {
    await storage.updateGlobalSettings({ enabled: false, defaultDelay: 500 });
    const state = await storage.load();
    assert.equal(state.globalSettings.enabled, false);
    assert.equal(state.globalSettings.defaultDelay, 500);
  });

  it('generates unique IDs when none provided', async () => {
    const entry1 = await storage.addEntry({ urlMatch: { domain: 'a.com' }, type: ENTRY_TYPES.BUTTON_ONLY });
    const entry2 = await storage.addEntry({ urlMatch: { domain: 'b.com' }, type: ENTRY_TYPES.BUTTON_ONLY });
    assert.ok(entry1.id);
    assert.ok(entry2.id);
    assert.notEqual(entry1.id, entry2.id);
  });
});
