const STORAGE_KEY = 'formFillerData';
const TYPE_LABELS = {
  input_and_button: 'input + button',
  button_only: 'button only',
  strategy_only: 'strategy',
};

const entriesContainer = document.getElementById('entries');
const emptyState = document.querySelector('.empty-state');
const globalToggle = document.getElementById('global-toggle');
const addBtn = document.getElementById('add-btn');

async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {
    schemaVersion: 1,
    globalSettings: { enabled: true, defaultDelay: 300 },
    entries: [],
  };
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderEntries(entries) {
  entriesContainer.innerHTML = '';

  if (entries.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  for (const entry of entries) {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.dataset.id = entry.id;

    const selectorText = entry.input?.selector || entry.button?.selector || '';
    const description = entry.input?.selectorMeta?.humanReadable ||
                       entry.button?.selectorMeta?.humanReadable || '';

    card.innerHTML = `
      <div class="entry-header">
        <span class="entry-domain">${esc(entry.urlMatch?.domain || 'unknown')}</span>
        <span class="type-badge">${esc(TYPE_LABELS[entry.type] || entry.type)}</span>
      </div>
      <div class="entry-selector">${esc(selectorText)}</div>
      ${description ? `<div class="entry-description">${esc(description)}</div>` : ''}
      <div class="entry-actions">
        <label>
          <input type="checkbox" class="entry-toggle" ${entry.enabled ? 'checked' : ''}>
          <span>${entry.enabled ? 'Active' : 'Inactive'}</span>
        </label>
        <button class="delete-btn">Delete</button>
      </div>
    `;

    card.querySelector('.entry-toggle').addEventListener('change', async (e) => {
      const state = await loadState();
      const target = state.entries.find(en => en.id === entry.id);
      if (target) {
        target.enabled = e.target.checked;
        await saveState(state);
        e.target.nextElementSibling.textContent = e.target.checked ? 'Active' : 'Inactive';
      }
    });

    card.querySelector('.delete-btn').addEventListener('click', async () => {
      const state = await loadState();
      state.entries = state.entries.filter(en => en.id !== entry.id);
      await saveState(state);
      render(state);
    });

    entriesContainer.appendChild(card);
  }
}

function render(state) {
  globalToggle.checked = state.globalSettings.enabled;
  renderEntries(state.entries);
}

globalToggle.addEventListener('change', async () => {
  const state = await loadState();
  state.globalSettings.enabled = globalToggle.checked;
  await saveState(state);
});

addBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content/element-picker.js'],
      world: 'MAIN',
    });
    window.close();
  }
});

// Initial render
loadState().then(render);
