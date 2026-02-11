const STORAGE_KEY = 'formFillerData';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'form-filler-register',
    title: 'Register this element',
    contexts: ['page', 'link', 'editable'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'form-filler-register' && tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content/element-picker.js'],
      world: 'MAIN',
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_ENTRY') {
    saveEntry(message.entry)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'GET_ENTRIES') {
    getEntries(message.domain)
      .then(entries => sendResponse({ entries }))
      .catch(() => sendResponse({ entries: [] }));
    return true;
  }
  if (message.type === 'INJECT_PICKER') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ['src/content/element-picker.js'],
      world: 'MAIN',
    });
    sendResponse({ ok: true });
    return false;
  }
});

async function saveEntry(entry) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY] || {
    schemaVersion: 1,
    globalSettings: { enabled: true, defaultDelay: 300 },
    entries: [],
  };
  if (!entry.id) {
    entry.id = crypto.randomUUID();
  }
  state.entries.push(entry);
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function getEntries(domain) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY];
  if (!state) return [];
  return state.entries.filter(
    e => e.urlMatch?.domain?.toLowerCase() === domain.toLowerCase()
  );
}
