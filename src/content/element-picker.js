(function () {
  if (customElements.get('form-filler-picker') || document.querySelector('form-filler-picker')) return;

  const GENERATED_ID_PATTERN = /^[a-f0-9]{8,}$|^[a-z]+-[a-f0-9]{4,}/i;
  const ATTR_PRIORITY = ['name', 'type', 'role', 'aria-label', 'placeholder'];

  const SEMANTIC_TAGS = new Set([
    'input', 'textarea', 'select', 'button', 'a', 'label',
  ]);
  const SEMANTIC_ROLES = new Set([
    'button', 'textbox', 'link', 'checkbox', 'radio', 'combobox', 'searchbox', 'switch',
  ]);

  function isGeneratedId(id) {
    if (!id) return true;
    if (GENERATED_ID_PATTERN.test(id)) return true;
    if (id.length <= 3) return true;
    if (id.includes('-') || id.includes('_')) return false;
    if (/^[a-z]{4,}$/.test(id)) return false;
    if (id.length < 8 && /[A-Z]/.test(id) && /[a-z]/.test(id) && !id.includes('-') && !id.includes('_')) return true;
    return false;
  }

  function generateSelectorFor(el) {
    const tag = el.tagName.toLowerCase();
    const allUsed = [];
    const attrParts = [];

    const id = el.id;
    if (id && !isGeneratedId(id)) {
      allUsed.push('id');
      attrParts.push(`#${id}`);
    }

    for (const attr of ATTR_PRIORITY) {
      const val = el.getAttribute(attr);
      if (!val) continue;
      allUsed.push(attr);
      attrParts.push(`[${attr}="${val.replace(/"/g, '\\"')}"]`);
    }

    const text = el.textContent?.trim();
    let humanReadable = `${tag}`;
    if (allUsed.length) humanReadable += ` (${allUsed.join(', ')})`;
    if (text && text.length < 50) humanReadable = `'${text}' ${humanReadable}`;

    const doc = el.ownerDocument;
    try {
      if (doc.querySelectorAll(tag).length === 1) {
        return { selector: tag, humanReadable, usedAttributes: allUsed };
      }
    } catch (_) { /* continue */ }

    for (const part of attrParts) {
      const candidate = tag + part;
      try {
        if (doc.querySelectorAll(candidate).length === 1) {
          return { selector: candidate, humanReadable, usedAttributes: allUsed };
        }
      } catch (_) { /* continue */ }
    }

    return {
      selector: tag + attrParts.join(''),
      humanReadable,
      usedAttributes: allUsed,
    };
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
        if (isSemanticElement(child)) {
          results.push({ element: child, distance: depth });
        }
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
    const maxAncestors = 5;
    const maxDescendantDepth = 3;
    const maxCandidates = 8;

    const seen = new Set();
    const candidates = [];

    function addCandidate(element, distance) {
      if (seen.has(element)) return;
      seen.add(element);
      const score = scoreCandidate(element, distance);
      const info = generateSelectorFor(element);
      candidates.push({
        element,
        score,
        isSemantic: isSemanticElement(element),
        selector: info.selector,
        humanReadable: info.humanReadable,
        usedAttributes: info.usedAttributes,
        tag: element.tagName.toLowerCase(),
      });
    }

    addCandidate(clickTarget, 0);

    let parent = clickTarget.parentElement;
    for (let i = 1; i <= maxAncestors && parent; i++) {
      addCandidate(parent, i);
      parent = parent.parentElement;
    }

    const descendants = findSemanticDescendants(clickTarget, maxDescendantDepth);
    for (const { element, distance } of descendants) {
      addCandidate(element, distance);
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, maxCandidates);
  }

  class PickerHost extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._mode = 'input';
      this._inputData = null;
      this._buttonData = null;
      this._hoveredEl = null;
      this._selectedEl = null;
      this._candidates = [];
      this._selectedCandidateIdx = -1;
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onClick = this._onClick.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
    }

    connectedCallback() {
      this.shadowRoot.innerHTML = `
        <style>
          :host { all: initial; }
          .picker-panel {
            display: none;
            position: fixed;
            bottom: 16px;
            right: 16px;
            width: 360px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.15);
            padding: 16px;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            color: #333;
          }
          .picker-banner {
            position: fixed;
            top: 0; left: 0; right: 0;
            background: #4285f4;
            color: #fff;
            text-align: center;
            padding: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            z-index: 2147483647;
          }
          h3 { margin: 0 0 8px; font-size: 15px; }
          .candidate-list {
            max-height: 200px;
            overflow-y: auto;
            margin-bottom: 12px;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
          }
          .candidate-item {
            padding: 8px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            transition: background 0.1s;
          }
          .candidate-item:last-child { border-bottom: none; }
          .candidate-item:hover { background: #f5f8ff; }
          .candidate-item.selected {
            background: #e6f4ea;
            border-left: 3px solid #34a853;
            padding-left: 5px;
          }
          .candidate-tag {
            font-weight: 600;
            font-family: monospace;
            font-size: 12px;
          }
          .candidate-semantic-badge {
            display: inline-block;
            background: #e8f0fe;
            color: #1967d2;
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 3px;
            margin-left: 6px;
            vertical-align: middle;
          }
          .candidate-description {
            color: #666;
            font-size: 11px;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .candidate-selector {
            font-family: monospace;
            font-size: 11px;
            color: #888;
            margin-top: 1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          label { display: block; margin-bottom: 4px; font-weight: 500; }
          .value-input {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 13px;
            margin-bottom: 12px;
            box-sizing: border-box;
          }
          .btn-row { display: flex; gap: 8px; justify-content: flex-end; }
          button {
            padding: 6px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
          }
          .confirm-btn { background: #4285f4; color: #fff; }
          .cancel-btn { background: #e0e0e0; color: #333; }
          .mode-btn { background: #f0f0f0; color: #333; margin-bottom: 12px; }
          .mode-btn.active { background: #4285f4; color: #fff; }
        </style>
        <div class="picker-banner">
          Form Filler: Click an element to select it (Esc to cancel)
        </div>
        <div class="picker-panel">
          <h3>Selected Element</h3>
          <div class="candidate-list"></div>
          <div class="value-section" style="display:none">
            <label>Fill value:</label>
            <input class="value-input" type="text" placeholder="Value to fill">
          </div>
          <button class="mode-btn">Select Button &rarr;</button>
          <div class="btn-row">
            <button class="cancel-btn">Cancel</button>
            <button class="confirm-btn">Confirm</button>
          </div>
        </div>
      `;

      this._panel = this.shadowRoot.querySelector('.picker-panel');
      this._banner = this.shadowRoot.querySelector('.picker-banner');
      this._candidateListEl = this.shadowRoot.querySelector('.candidate-list');
      this._valueSection = this.shadowRoot.querySelector('.value-section');
      this._valueInput = this.shadowRoot.querySelector('.value-input');
      this._modeBtn = this.shadowRoot.querySelector('.mode-btn');
      this._confirmBtn = this.shadowRoot.querySelector('.confirm-btn');
      this._cancelBtn = this.shadowRoot.querySelector('.cancel-btn');

      this._modeBtn.addEventListener('click', () => this._switchMode());
      this._confirmBtn.addEventListener('click', () => this._confirm());
      this._cancelBtn.addEventListener('click', () => this._destroy());

      document.addEventListener('mousemove', this._onMouseMove, true);
      document.addEventListener('click', this._onClick, true);
      document.addEventListener('keydown', this._onKeyDown, true);
    }

    disconnectedCallback() {
      document.removeEventListener('mousemove', this._onMouseMove, true);
      document.removeEventListener('click', this._onClick, true);
      document.removeEventListener('keydown', this._onKeyDown, true);
      this._clearHighlight();
      this._clearAllCandidateHighlights();
    }

    _onMouseMove(e) {
      if (this._panel.style.display !== 'none' && this._panel.contains?.(e.target)) return;
      if (this.shadowRoot.contains(e.target)) return;
      if (e.target === this) return;

      this._clearHighlight();
      this._hoveredEl = e.target;
      e.target.style.outline = '2px solid #4285f4';
      e.target.style.outlineOffset = '-1px';
    }

    _onClick(e) {
      if (this.shadowRoot.contains(e.target)) return;
      if (e.target === this) return;

      e.preventDefault();
      e.stopPropagation();

      this._clearHighlight();
      this._clearAllCandidateHighlights();

      this._candidates = buildCandidateList(e.target);
      this._selectedCandidateIdx = 0;

      this._renderCandidateList();
      this._highlightSelectedCandidate();
      this._updateDataFromSelected();

      this._panel.style.display = 'block';
    }

    _renderCandidateList() {
      this._candidateListEl.innerHTML = '';
      this._candidates.forEach((c, idx) => {
        const item = document.createElement('div');
        item.className = 'candidate-item' + (idx === this._selectedCandidateIdx ? ' selected' : '');
        item.dataset.idx = idx;

        const tagLine = document.createElement('div');
        const tagSpan = document.createElement('span');
        tagSpan.className = 'candidate-tag';
        tagSpan.textContent = `<${c.tag}>`;
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

        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._selectCandidate(idx);
        });

        item.addEventListener('mouseenter', () => {
          if (idx !== this._selectedCandidateIdx) {
            this._clearAllCandidateHighlights();
            c.element.style.outline = '2px dashed #4285f4';
            c.element.style.outlineOffset = '-1px';
            if (this._selectedCandidateIdx >= 0) {
              const sel = this._candidates[this._selectedCandidateIdx];
              sel.element.style.outline = '2px solid #34a853';
              sel.element.style.outlineOffset = '-1px';
            }
          }
        });

        item.addEventListener('mouseleave', () => {
          if (idx !== this._selectedCandidateIdx) {
            c.element.style.outline = '';
            c.element.style.outlineOffset = '';
          }
          this._highlightSelectedCandidate();
        });

        this._candidateListEl.appendChild(item);
      });
    }

    _selectCandidate(idx) {
      this._clearAllCandidateHighlights();
      this._selectedCandidateIdx = idx;

      const items = this._candidateListEl.querySelectorAll('.candidate-item');
      items.forEach((item, i) => {
        item.classList.toggle('selected', i === idx);
      });

      this._highlightSelectedCandidate();
      this._updateDataFromSelected();
    }

    _highlightSelectedCandidate() {
      if (this._selectedCandidateIdx >= 0 && this._selectedCandidateIdx < this._candidates.length) {
        const c = this._candidates[this._selectedCandidateIdx];
        this._selectedEl = c.element;
        c.element.style.outline = '2px solid #34a853';
        c.element.style.outlineOffset = '-1px';
      }
    }

    _clearAllCandidateHighlights() {
      for (const c of this._candidates) {
        c.element.style.outline = '';
        c.element.style.outlineOffset = '';
      }
      this._selectedEl = null;
    }

    _updateDataFromSelected() {
      if (this._selectedCandidateIdx < 0 || this._selectedCandidateIdx >= this._candidates.length) return;
      const c = this._candidates[this._selectedCandidateIdx];
      const info = { selector: c.selector, humanReadable: c.humanReadable, usedAttributes: c.usedAttributes };

      if (this._mode === 'input') {
        this._inputData = { ...info, element: c.element };
        this._valueSection.style.display = 'block';
        this._modeBtn.textContent = 'Select Button \u2192';
      } else {
        this._buttonData = { ...info, element: c.element };
        this._modeBtn.textContent = '\u2713 Button selected';
        this._modeBtn.classList.add('active');
      }
    }

    _onKeyDown(e) {
      if (e.key === 'Escape') {
        this._destroy();
      }
    }

    _clearHighlight() {
      if (this._hoveredEl) {
        this._hoveredEl.style.outline = '';
        this._hoveredEl.style.outlineOffset = '';
        this._hoveredEl = null;
      }
    }

    _switchMode() {
      if (this._mode === 'input' && this._inputData) {
        this._mode = 'button';
        this._panel.style.display = 'none';
        this._banner.textContent = 'Form Filler: Now click a button element (Esc to cancel)';
        this._clearAllCandidateHighlights();
        this._candidates = [];
        this._selectedCandidateIdx = -1;
      }
    }

    _clearSelectionHighlight() {
      if (this._selectedEl) {
        this._selectedEl.style.outline = '';
        this._selectedEl.style.outlineOffset = '';
        this._selectedEl = null;
      }
    }

    _confirm() {
      const domain = window.location.hostname;
      const entry = {
        enabled: true,
        urlMatch: { domain, pathPrefix: null },
        type: this._inputData && this._buttonData ? 'input_and_button' :
              this._buttonData ? 'button_only' : 'strategy_only',
        input: this._inputData ? {
          selector: this._inputData.selector,
          selectorMeta: {
            usedAttributes: this._inputData.usedAttributes,
            humanReadable: this._inputData.humanReadable,
          },
          value: this._valueInput.value || '',
        } : null,
        button: this._buttonData ? {
          selector: this._buttonData.selector,
          selectorMeta: {
            usedAttributes: this._buttonData.usedAttributes,
            humanReadable: this._buttonData.humanReadable,
          },
        } : null,
        strategy: null,
        execution: {
          delayBeforeAction: 500,
          delayBetweenActions: 200,
          waitForElement: true,
          waitTimeout: 5000,
        },
      };

      window.postMessage({ source: 'form-filler-picker', type: 'SAVE_ENTRY', entry }, '*');
      this._destroy();
    }

    _destroy() {
      this._clearHighlight();
      this._clearAllCandidateHighlights();
      this.remove();
    }
  }

  customElements.define('form-filler-picker', PickerHost);
  document.body.appendChild(document.createElement('form-filler-picker'));
})();
