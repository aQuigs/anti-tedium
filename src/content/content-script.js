const STORAGE_KEY = 'formFillerData';

async function run() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const state = result[STORAGE_KEY];
    if (!state || !state.globalSettings?.enabled) return;

    const domain = window.location.hostname;
    const entries = state.entries.filter(
      e => e.enabled && e.urlMatch?.domain?.toLowerCase() === domain.toLowerCase()
    );

    for (const entry of entries) {
      await executeEntry(entry);
    }
  } catch (err) {
    console.error('[Form Filler]', err);
  }
}

async function executeEntry(entry) {
  const delay = entry.execution?.delayBeforeAction ?? 500;
  await sleep(delay);

  if (entry.type === 'input_and_button' || entry.type === 'strategy_only') {
    if (entry.strategy !== 'click_only' && entry.input) {
      const input = await waitForElement(entry.input.selector, entry.execution);
      if (input) {
        setNativeValue(input, entry.input.value);
      }
    }
  }

  const betweenDelay = entry.execution?.delayBetweenActions ?? 200;
  await sleep(betweenDelay);

  if (entry.strategy === 'fill_no_click') return;

  if (entry.button) {
    const button = await waitForElement(entry.button.selector, entry.execution);
    if (button) {
      button.click();
    }
  }
}

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function waitForElement(selector, execution) {
  const shouldWait = execution?.waitForElement ?? true;
  const timeout = execution?.waitTimeout ?? 5000;

  let el = document.querySelector(selector);
  if (el || !shouldWait) return el;

  return new Promise((resolve) => {
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      el = document.querySelector(selector);
      elapsed += interval;
      if (el || elapsed >= timeout) {
        clearInterval(timer);
        resolve(el || null);
      }
    }, interval);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Relay messages from the picker (MAIN world) to the service worker
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'form-filler-picker') return;
  chrome.runtime.sendMessage({ type: event.data.type, entry: event.data.entry });
});

run();
