import { test, expect } from '../fixtures/extension.js';

const BASE_URL = 'http://localhost:3947/pages';

async function injectPicker(page, context, extensionId) {
  const sw = context.serviceWorkers().find(w => w.url().includes(extensionId));
  const pageUrl = page.url();

  const result = await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => t.url === url);
    if (!tab?.id) return { error: 'no tab', urls: tabs.map(t => t.url) };

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (document.querySelector('form-filler-picker')) return 'already_exists';

          const GENERATED_ID_PATTERN = /^[a-f0-9]{8,}$|^[a-z]+-[a-f0-9]{4,}/i;
          const ATTR_PRIORITY = ['aria-label', 'role', 'name', 'placeholder', 'type'];
          const SEMANTIC_TAGS = new Set(['input', 'textarea', 'select', 'button', 'a', 'label']);
          const SEMANTIC_ROLES = new Set(['button', 'textbox', 'link', 'checkbox', 'radio', 'combobox', 'searchbox', 'switch']);

          function isGeneratedId(id) { return !id || GENERATED_ID_PATTERN.test(id); }

          function generateSelectorFor(el) {
            const tag = el.tagName.toLowerCase();
            const parts = [tag];
            const used = [];
            const id = el.id;
            if (id && !isGeneratedId(id)) { parts.push('#' + id); used.push('id'); }
            for (const attr of ATTR_PRIORITY) {
              const val = el.getAttribute(attr);
              if (!val) continue;
              parts.push('[' + attr + '="' + val.replace(/"/g, '\\"') + '"]');
              used.push(attr);
            }
            const text = el.textContent?.trim();
            let humanReadable = tag;
            if (used.length) humanReadable += ' (' + used.join(', ') + ')';
            if (text && text.length < 50) humanReadable = "'" + text + "' " + humanReadable;
            return { selector: parts.join(''), humanReadable, usedAttributes: used };
          }

          function isSemanticElement(el) {
            const tag = el.tagName.toLowerCase();
            if (SEMANTIC_TAGS.has(tag)) return true;
            const role = el.getAttribute('role');
            if (role && SEMANTIC_ROLES.has(role)) return true;
            const ce = el.getAttribute('contenteditable');
            if (ce === 'true' || ce === '') return true;
            return false;
          }

          function findSemanticDescendants(root, maxDepth) {
            const results = [];
            function walk(el, depth) {
              if (depth > maxDepth) return;
              const children = el.children || [];
              for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (isSemanticElement(child)) results.push({ element: child, distance: depth });
                walk(child, depth + 1);
              }
            }
            walk(root, 1);
            return results;
          }

          function scoreCandidate(el, distance) {
            let score = 100 - (distance * 10);
            const tag = el.tagName.toLowerCase();
            if (SEMANTIC_TAGS.has(tag)) score += 50;
            const role = el.getAttribute('role');
            if (role && SEMANTIC_ROLES.has(role)) score += 40;
            const ce = el.getAttribute('contenteditable');
            if (ce === 'true' || ce === '') score += 45;
            if (el.id && !isGeneratedId(el.id)) score += 10;
            if (el.getAttribute('name')) score += 10;
            if (el.getAttribute('aria-label')) score += 10;
            return score;
          }

          function buildCandidateList(clickTarget) {
            const maxAncestors = 5, maxDescendantDepth = 3, maxCandidates = 8;
            const seen = new Set();
            const candidates = [];
            function addCandidate(element, distance) {
              if (seen.has(element)) return;
              seen.add(element);
              const score = scoreCandidate(element, distance);
              const info = generateSelectorFor(element);
              candidates.push({ element, score, isSemantic: isSemanticElement(element), selector: info.selector, humanReadable: info.humanReadable, usedAttributes: info.usedAttributes, tag: element.tagName.toLowerCase() });
            }
            addCandidate(clickTarget, 0);
            let parent = clickTarget.parentElement;
            for (let i = 1; i <= maxAncestors && parent; i++) { addCandidate(parent, i); parent = parent.parentElement; }
            const descendants = findSemanticDescendants(clickTarget, maxDescendantDepth);
            for (const { element, distance } of descendants) addCandidate(element, distance);
            candidates.sort((a, b) => b.score - a.score);
            return candidates.slice(0, maxCandidates);
          }

          const host = document.createElement('form-filler-picker');
          const shadow = host.attachShadow({ mode: 'open' });

          let mode = 'input';
          let inputData = null;
          let buttonData = null;
          let hoveredEl = null;
          let selectedEl = null;
          let candidates = [];
          let selectedCandidateIdx = -1;

          shadow.innerHTML = '<style>:host{all:initial}.picker-panel{display:none;position:fixed;bottom:16px;right:16px;width:360px;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.15);padding:16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:13px;color:#333}.picker-banner{position:fixed;top:0;left:0;right:0;background:#4285f4;color:#fff;text-align:center;padding:8px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;z-index:2147483647}h3{margin:0 0 8px;font-size:15px}.candidate-list{max-height:200px;overflow-y:auto;margin-bottom:12px;border:1px solid #e0e0e0;border-radius:4px}.candidate-item{padding:8px;cursor:pointer;border-bottom:1px solid #f0f0f0}.candidate-item:last-child{border-bottom:none}.candidate-item.selected{background:#e6f4ea;border-left:3px solid #34a853;padding-left:5px}.candidate-tag{font-weight:600;font-family:monospace;font-size:12px}.candidate-semantic-badge{display:inline-block;background:#e8f0fe;color:#1967d2;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:6px}.candidate-description{color:#666;font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.candidate-selector{font-family:monospace;font-size:11px;color:#888;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}label{display:block;margin-bottom:4px;font-weight:500}.value-input{width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;margin-bottom:12px;box-sizing:border-box}.btn-row{display:flex;gap:8px;justify-content:flex-end}button{padding:6px 16px;border:none;border-radius:4px;cursor:pointer;font-size:13px}.confirm-btn{background:#4285f4;color:#fff}.cancel-btn{background:#e0e0e0;color:#333}.mode-btn{background:#f0f0f0;color:#333;margin-bottom:12px}.mode-btn.active{background:#4285f4;color:#fff}</style><div class="picker-banner">Form Filler: Click an element to select it (Esc to cancel)</div><div class="picker-panel"><h3>Selected Element</h3><div class="candidate-list"></div><div class="value-section" style="display:none"><label>Fill value:</label><input class="value-input" type="text" placeholder="Value to fill"></div><button class="mode-btn">Select Button \u2192</button><div class="btn-row"><button class="cancel-btn">Cancel</button><button class="confirm-btn">Confirm</button></div></div>';

          const panel = shadow.querySelector('.picker-panel');
          const candidateListEl = shadow.querySelector('.candidate-list');
          const valueSection = shadow.querySelector('.value-section');
          const valueInput = shadow.querySelector('.value-input');
          const modeBtn = shadow.querySelector('.mode-btn');
          const confirmBtn = shadow.querySelector('.confirm-btn');
          const cancelBtn = shadow.querySelector('.cancel-btn');

          function clearHighlight() {
            if (hoveredEl) { hoveredEl.style.outline = ''; hoveredEl.style.outlineOffset = ''; hoveredEl = null; }
          }
          function clearAllCandidateHighlights() {
            for (const c of candidates) { c.element.style.outline = ''; c.element.style.outlineOffset = ''; }
            selectedEl = null;
          }
          function highlightSelectedCandidate() {
            if (selectedCandidateIdx >= 0 && selectedCandidateIdx < candidates.length) {
              const c = candidates[selectedCandidateIdx];
              selectedEl = c.element;
              c.element.style.outline = '2px solid #34a853';
              c.element.style.outlineOffset = '-1px';
            }
          }
          function updateDataFromSelected() {
            if (selectedCandidateIdx < 0 || selectedCandidateIdx >= candidates.length) return;
            const c = candidates[selectedCandidateIdx];
            const info = { selector: c.selector, humanReadable: c.humanReadable, usedAttributes: c.usedAttributes };
            if (mode === 'input') {
              inputData = { ...info, element: c.element };
              valueSection.style.display = 'block';
              modeBtn.textContent = 'Select Button \u2192';
            } else {
              buttonData = { ...info, element: c.element };
              modeBtn.textContent = '\u2713 Button selected';
              modeBtn.classList.add('active');
            }
          }
          function renderCandidateList() {
            candidateListEl.innerHTML = '';
            candidates.forEach(function(c, idx) {
              const item = document.createElement('div');
              item.className = 'candidate-item' + (idx === selectedCandidateIdx ? ' selected' : '');
              item.dataset.idx = idx;

              const tagLine = document.createElement('div');
              const tagSpan = document.createElement('span');
              tagSpan.className = 'candidate-tag';
              tagSpan.textContent = '<' + c.tag + '>';
              tagLine.appendChild(tagSpan);
              if (c.isSemantic) {
                const badge = document.createElement('span');
                badge.className = 'candidate-semantic-badge';
                badge.textContent = 'semantic';
                tagLine.appendChild(badge);
              }
              item.appendChild(tagLine);

              const desc = document.createElement('div');
              desc.className = 'candidate-description';
              desc.textContent = c.humanReadable;
              item.appendChild(desc);

              const sel = document.createElement('div');
              sel.className = 'candidate-selector';
              sel.textContent = c.selector;
              item.appendChild(sel);

              item.addEventListener('click', function(ev) {
                ev.stopPropagation();
                clearAllCandidateHighlights();
                selectedCandidateIdx = idx;
                const items = candidateListEl.querySelectorAll('.candidate-item');
                items.forEach(function(it, i) { it.classList.toggle('selected', i === idx); });
                highlightSelectedCandidate();
                updateDataFromSelected();
              });

              candidateListEl.appendChild(item);
            });
          }
          function destroy() { clearHighlight(); clearAllCandidateHighlights(); host.remove(); }

          document.addEventListener('mousemove', function(e) {
            if (shadow.contains(e.target) || e.target === host) return;
            clearHighlight();
            hoveredEl = e.target;
            e.target.style.outline = '2px solid #4285f4';
            e.target.style.outlineOffset = '-1px';
          }, true);

          document.addEventListener('click', function(e) {
            if (shadow.contains(e.target) || e.target === host) return;
            e.preventDefault();
            e.stopPropagation();
            clearHighlight();
            clearAllCandidateHighlights();

            candidates = buildCandidateList(e.target);
            selectedCandidateIdx = 0;
            renderCandidateList();
            highlightSelectedCandidate();
            updateDataFromSelected();
            panel.style.display = 'block';
          }, true);

          document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') destroy();
          }, true);

          modeBtn.addEventListener('click', function() {
            if (mode === 'input' && inputData) {
              mode = 'button';
              panel.style.display = 'none';
              clearAllCandidateHighlights();
              candidates = [];
              selectedCandidateIdx = -1;
            }
          });

          cancelBtn.addEventListener('click', function() { destroy(); });

          confirmBtn.addEventListener('click', function() {
            const domain = window.location.hostname;
            const entry = {
              enabled: true,
              urlMatch: { domain, pathPrefix: null },
              type: inputData && buttonData ? 'input_and_button' : buttonData ? 'button_only' : 'strategy_only',
              input: inputData ? { selector: inputData.selector, selectorMeta: { usedAttributes: inputData.usedAttributes, humanReadable: inputData.humanReadable }, value: valueInput.value || '' } : null,
              button: buttonData ? { selector: buttonData.selector, selectorMeta: { usedAttributes: buttonData.usedAttributes, humanReadable: buttonData.humanReadable } } : null,
              strategy: null,
              execution: { delayBeforeAction: 500, delayBetweenActions: 200, waitForElement: true, waitTimeout: 5000 },
            };
            chrome.runtime.sendMessage({ type: 'SAVE_ENTRY', entry });
            destroy();
          });

          document.body.appendChild(host);
          return 'injected';
        },
      });
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  }, pageUrl);

  if (result?.error) throw new Error('Injection failed: ' + result.error);
  await page.waitForSelector('form-filler-picker', { state: 'attached', timeout: 5000 });
}

test('picker overlay appears when injected', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/simple-login.html`);
  await injectPicker(page, context, extensionId);
  const picker = page.locator('form-filler-picker');
  await expect(picker).toBeAttached();
});

test('hovering highlights elements', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/simple-login.html`);
  await injectPicker(page, context, extensionId);

  const emailInput = page.locator('input[name="email"]');
  await emailInput.hover();
  await page.waitForTimeout(200);

  const outlineStyle = await emailInput.evaluate(el => el.style.outline);
  expect(outlineStyle).toContain('2px');
});

test('clicking an element selects it and shows panel', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/simple-login.html`);
  await injectPicker(page, context, extensionId);

  await page.locator('input[name="email"]').click();
  await page.waitForTimeout(300);

  const panelVisible = await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    if (!host || !host.shadowRoot) return false;
    const panel = host.shadowRoot.querySelector('.picker-panel');
    return panel && panel.style.display !== 'none';
  });
  expect(panelVisible).toBe(true);
});

test('cancel dismisses picker', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/simple-login.html`);
  await injectPicker(page, context, extensionId);

  await page.locator('input[name="email"]').click();
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const cancelBtn = host.shadowRoot.querySelector('.cancel-btn');
    cancelBtn.click();
  });
  await page.waitForTimeout(300);

  const pickerExists = await page.evaluate(() => !!document.querySelector('form-filler-picker'));
  expect(pickerExists).toBe(false);
});

test('candidate list shows items when element selected', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/simple-login.html`);
  await injectPicker(page, context, extensionId);

  await page.locator('input[name="email"]').click();
  await page.waitForTimeout(300);

  const candidateCount = await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const items = host.shadowRoot.querySelectorAll('.candidate-item');
    return items.length;
  });
  expect(candidateCount).toBeGreaterThan(0);

  const firstTag = await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const tag = host.shadowRoot.querySelector('.candidate-tag');
    return tag?.textContent;
  });
  expect(firstTag).toContain('input');
});

test('confirm saves entry to storage', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/simple-login.html`);
  await injectPicker(page, context, extensionId);

  await page.locator('input[name="email"]').click();
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const valueInput = host.shadowRoot.querySelector('.value-input');
    if (valueInput) {
      valueInput.value = 'picked@test.com';
      valueInput.dispatchEvent(new Event('input'));
    }
  });

  await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const modeBtn = host.shadowRoot.querySelector('.mode-btn');
    if (modeBtn) modeBtn.click();
  });
  await page.waitForTimeout(200);

  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const confirmBtn = host.shadowRoot.querySelector('.confirm-btn');
    confirmBtn.click();
  });
  await page.waitForTimeout(500);

  const sw = context.serviceWorkers().find(w => w.url().includes(extensionId));
  const stored = await sw.evaluate(() => chrome.storage.local.get('formFillerData'));
  const entries = stored.formFillerData?.entries || [];
  expect(entries.length).toBeGreaterThan(0);
  expect(entries[0].input.value).toBe('picked@test.com');
});

test('production injection via files creates picker element', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/simple-login.html`);

  const sw = context.serviceWorkers().find(w => w.url().includes(extensionId));
  const pageUrl = page.url();

  await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => t.url === url);
    if (!tab?.id) throw new Error('tab not found');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content/element-picker.js'],
      world: 'MAIN',
    });
  }, pageUrl);

  await page.waitForSelector('form-filler-picker', { state: 'attached', timeout: 5000 });
});

test('candidate list shows multiple candidates for nested elements', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/nested-elements.html`);
  await injectPicker(page, context, extensionId);

  // Click the outer wrapper div (search-wrapper), which has a textarea descendant
  await page.locator('#search-wrapper').click();
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const items = host.shadowRoot.querySelectorAll('.candidate-item');
    const tags = [];
    items.forEach(item => {
      const tagEl = item.querySelector('.candidate-tag');
      if (tagEl) tags.push(tagEl.textContent);
    });
    return { count: items.length, tags };
  });

  expect(result.count).toBeGreaterThan(1);
  expect(result.tags).toContain('<textarea>');
});

test('auto-selects semantic element over non-semantic wrapper', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/nested-elements.html`);
  await injectPicker(page, context, extensionId);

  // Click the outer wrapper div which contains a textarea
  await page.locator('#search-wrapper').click();
  await page.waitForTimeout(300);

  const selectedTag = await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const selected = host.shadowRoot.querySelector('.candidate-item.selected .candidate-tag');
    return selected?.textContent;
  });

  // The textarea should be auto-selected as best candidate, not the wrapper div
  expect(selectedTag).toContain('<textarea>');
});

test('clicking a candidate in the list changes page highlight', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/nested-elements.html`);
  await injectPicker(page, context, extensionId);

  // Click an element to get a candidate list
  await page.locator('#search-wrapper').click();
  await page.waitForTimeout(300);

  // Find a non-selected candidate and click it
  const clicked = await page.evaluate(() => {
    const host = document.querySelector('form-filler-picker');
    const items = host.shadowRoot.querySelectorAll('.candidate-item');
    // Click the second item (index 1) if it exists
    if (items.length < 2) return { success: false };
    items[1].click();
    // Check that the second item is now selected
    const nowSelected = host.shadowRoot.querySelector('.candidate-item.selected');
    const selectedIdx = nowSelected?.dataset?.idx;
    return { success: true, selectedIdx };
  });

  expect(clicked.success).toBe(true);
  expect(clicked.selectedIdx).toBe('1');
});
