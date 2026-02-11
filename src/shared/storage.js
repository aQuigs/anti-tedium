import { SCHEMA_VERSION, DEFAULT_SETTINGS } from './constants.js';

const STORAGE_KEY = 'formFillerData';

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    globalSettings: { ...DEFAULT_SETTINGS },
    entries: [],
  };
}

export function createStorage(chromeStorage) {
  const api = chromeStorage.local;

  async function load() {
    const result = await api.get(STORAGE_KEY);
    return result[STORAGE_KEY] || defaultState();
  }

  async function save(state) {
    await api.set({ [STORAGE_KEY]: state });
  }

  async function addEntry(entry) {
    const state = await load();
    if (!entry.id) {
      entry.id = crypto.randomUUID();
    }
    if (entry.enabled === undefined) {
      entry.enabled = true;
    }
    state.entries.push(entry);
    await save(state);
    return entry;
  }

  async function removeEntry(id) {
    const state = await load();
    state.entries = state.entries.filter(e => e.id !== id);
    await save(state);
  }

  async function updateEntry(id, updates) {
    const state = await load();
    const idx = state.entries.findIndex(e => e.id === id);
    if (idx !== -1) {
      Object.assign(state.entries[idx], updates);
      await save(state);
    }
  }

  async function getEntriesForDomain(domain) {
    const state = await load();
    return state.entries.filter(
      e => e.urlMatch?.domain?.toLowerCase() === domain.toLowerCase()
    );
  }

  async function updateGlobalSettings(settings) {
    const state = await load();
    Object.assign(state.globalSettings, settings);
    await save(state);
  }

  return { load, save, addEntry, removeEntry, updateEntry, getEntriesForDomain, updateGlobalSettings };
}
