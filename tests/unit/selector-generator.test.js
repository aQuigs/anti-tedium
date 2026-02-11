import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSelector, isSemanticElement, buildCandidateList, isGeneratedId } from '../../src/content/selector-generator.js';

function mockElement(tag, attrs = {}, textContent = '', parent = null, children = [], qsaResult = null) {
  const el = {
    tagName: tag.toUpperCase(),
    getAttribute: (name) => attrs[name] ?? null,
    hasAttribute: (name) => name in attrs,
    textContent: textContent.trim(),
    parentElement: parent,
    closest: () => parent,
    id: attrs.id || '',
    children,
    ownerDocument: {
      querySelectorAll: qsaResult ? () => qsaResult : () => [{}],
    },
  };
  for (const child of children) {
    child.parentElement = el;
  }
  return el;
}

describe('Selector Generator', { timeout: 50 }, () => {
  it('returns tag alone when unique', () => {
    const el = mockElement('input', { 'aria-label': 'Email', type: 'email' });
    const result = generateSelector(el);
    assert.equal(result.selector, 'input');
    assert.ok(result.selectorMeta.usedAttributes.includes('aria-label'));
  });

  it('stops at first unique attribute (name)', () => {
    const el = mockElement('input', { name: 'username', type: 'text' }, '', null, [], [{}, {}]);
    el.ownerDocument.querySelectorAll = (sel) => sel === 'input' ? [{}, {}] : [{}];
    const result = generateSelector(el);
    assert.equal(result.selector, 'input[name="username"]');
    assert.ok(result.selectorMeta.usedAttributes.includes('name'));
  });

  it('uses placeholder when other attrs do not uniquify', () => {
    const el = mockElement('input', { placeholder: 'Enter your email', type: 'email' });
    el.ownerDocument.querySelectorAll = (sel) => {
      if (sel === 'input' || sel.includes('type=')) return [{}, {}];
      return [{}];
    };
    const result = generateSelector(el);
    assert.ok(result.selector.includes('placeholder='));
  });

  it('uses text content for buttons in humanReadable', () => {
    const el = mockElement('button', { type: 'submit' }, 'Sign In');
    const result = generateSelector(el);
    assert.ok(result.humanReadable.toLowerCase().includes('sign in'));
  });

  it('filters out hashed/generated IDs', () => {
    const el = mockElement('input', {
      id: 'a1b2c3d4e5',
      name: 'email',
      type: 'email',
    });
    el.ownerDocument.querySelectorAll = (sel) => sel === 'input' ? [{}, {}] : [{}];
    const result = generateSelector(el);
    assert.ok(!result.selector.includes('#a1b2c3d4e5'));
  });

  it('filters out CSS-in-JS class patterns', () => {
    const el = mockElement('button', {
      class: 'css-1a2b3c sc-fAbCdE',
      type: 'submit',
    }, 'Continue');
    const result = generateSelector(el);
    assert.ok(!result.selector.includes('css-'));
  });

  it('generates human-readable description', () => {
    const el = mockElement('input', { 'aria-label': 'Password', type: 'password' });
    const result = generateSelector(el);
    assert.ok(result.humanReadable.length > 0);
    assert.ok(typeof result.humanReadable === 'string');
  });

  it('respects disabled attributes via options', () => {
    const el = mockElement('input', {
      'aria-label': 'Email',
      name: 'email',
      placeholder: 'Enter email',
      type: 'email',
    });
    const result = generateSelector(el, { disabledAttributes: ['aria-label'] });
    assert.ok(!result.selectorMeta.usedAttributes.includes('aria-label'));
  });

  it('includes role in selector when needed for uniqueness', () => {
    const el = mockElement('div', { role: 'button' }, 'Submit');
    el.ownerDocument.querySelectorAll = (sel) => sel === 'div' ? [{}, {}] : [{}];
    const result = generateSelector(el);
    assert.ok(result.selector.includes('role='));
  });

  it('returns tag + type when tag alone is not unique', () => {
    const el = mockElement('input', { type: 'text' });
    el.ownerDocument.querySelectorAll = (sel) => sel === 'input' ? [{}, {}] : [{}];
    const result = generateSelector(el);
    assert.ok(result.selector.includes('input'));
    assert.ok(result.selector.includes('type='));
  });

  it('produces minimal selector for multi-attribute element', () => {
    const el = mockElement('textarea', {
      id: 'APjFqb',
      'aria-label': 'Search',
      role: 'combobox',
      name: 'q',
    });
    el.ownerDocument.querySelectorAll = (sel) => sel === 'textarea' ? [{}, {}] : [{}];
    const result = generateSelector(el);
    assert.equal(result.selector, 'textarea[name="q"]');
    assert.ok(result.selectorMeta.usedAttributes.includes('name'));
    assert.ok(result.selectorMeta.usedAttributes.includes('role'));
    assert.ok(result.selectorMeta.usedAttributes.includes('aria-label'));
  });

  it('falls back to full selector when nothing is unique', () => {
    const el = mockElement('div', { role: 'button', 'aria-label': 'Click' });
    el.ownerDocument.querySelectorAll = () => [{}, {}];
    const result = generateSelector(el);
    assert.ok(result.selector.includes('role='));
    assert.ok(result.selector.includes('aria-label='));
  });
});

describe('isSemanticElement', { timeout: 50 }, () => {
  it('returns true for input', () => {
    assert.ok(isSemanticElement(mockElement('input', { type: 'text' })));
  });

  it('returns true for textarea', () => {
    assert.ok(isSemanticElement(mockElement('textarea')));
  });

  it('returns true for button', () => {
    assert.ok(isSemanticElement(mockElement('button')));
  });

  it('returns true for anchor tag', () => {
    assert.ok(isSemanticElement(mockElement('a', { href: '/' })));
  });

  it('returns true for role=button', () => {
    assert.ok(isSemanticElement(mockElement('div', { role: 'button' })));
  });

  it('returns true for role=textbox', () => {
    assert.ok(isSemanticElement(mockElement('div', { role: 'textbox' })));
  });

  it('returns true for contenteditable=true', () => {
    assert.ok(isSemanticElement(mockElement('div', { contenteditable: 'true' })));
  });

  it('returns false for plain div', () => {
    assert.equal(isSemanticElement(mockElement('div')), false);
  });

  it('returns false for span', () => {
    assert.equal(isSemanticElement(mockElement('span')), false);
  });
});

describe('isGeneratedId', { timeout: 50 }, () => {
  it('treats empty/null as generated', () => {
    assert.equal(isGeneratedId(''), true);
    assert.equal(isGeneratedId(null), true);
    assert.equal(isGeneratedId(undefined), true);
  });

  it('treats hex hashes as generated', () => {
    assert.equal(isGeneratedId('a1b2c3d4e5'), true);
  });

  it('treats short IDs (≤3 chars) as generated', () => {
    assert.equal(isGeneratedId('q2'), true);
    assert.equal(isGeneratedId('gb'), true);
  });

  it('treats mixed-case minified IDs as generated', () => {
    assert.equal(isGeneratedId('APjFqb'), true);
    assert.equal(isGeneratedId('Tg7LZd'), true);
  });

  it('treats hyphenated IDs as stable', () => {
    assert.equal(isGeneratedId('search-form'), false);
    assert.equal(isGeneratedId('nav-bar'), false);
  });

  it('treats underscored IDs as stable', () => {
    assert.equal(isGeneratedId('login_btn'), false);
  });

  it('treats lowercase word IDs as stable', () => {
    assert.equal(isGeneratedId('email'), false);
    assert.equal(isGeneratedId('sidebar'), false);
    assert.equal(isGeneratedId('search'), false);
  });
});

describe('buildCandidateList', { timeout: 50 }, () => {
  it('returns click target as a candidate', () => {
    const el = mockElement('input', { name: 'email', type: 'text' });
    const candidates = buildCandidateList(el);
    assert.ok(candidates.length >= 1);
    assert.equal(candidates[0].element, el);
  });

  it('includes parent elements in candidate list', () => {
    const grandparent = mockElement('form', { id: 'login' });
    const parent = mockElement('div', {}, '', grandparent);
    const child = mockElement('input', { name: 'email', type: 'text' }, '', parent);
    const candidates = buildCandidateList(child);
    const elements = candidates.map(c => c.element);
    assert.ok(elements.includes(parent));
    assert.ok(elements.includes(grandparent));
  });

  it('ranks semantic elements higher than non-semantic wrappers', () => {
    const wrapper = mockElement('div');
    const input = mockElement('input', { name: 'email', type: 'text' }, '', wrapper);
    wrapper.children = [input];
    const candidates = buildCandidateList(wrapper);
    assert.equal(candidates[0].tag, 'input');
    assert.ok(candidates[0].isSemantic);
  });

  it('finds semantic descendants when clicking a wrapper', () => {
    const textarea = mockElement('textarea', { 'aria-label': 'Search' });
    const inner = mockElement('div', {}, '', null, [textarea]);
    const outer = mockElement('div', {}, '', null, [inner]);
    const candidates = buildCandidateList(outer);
    const tags = candidates.map(c => c.tag);
    assert.ok(tags.includes('textarea'));
  });

  it('respects maxCandidates option', () => {
    const el = mockElement('input', { type: 'text' });
    const candidates = buildCandidateList(el, { maxCandidates: 1 });
    assert.equal(candidates.length, 1);
  });

  it('respects maxAncestors depth limit', () => {
    let current = mockElement('div', { id: 'root' });
    for (let i = 0; i < 10; i++) {
      const child = mockElement('div', {}, '', current);
      current = child;
    }
    const leaf = mockElement('input', { type: 'text' }, '', current);
    const candidates = buildCandidateList(leaf, { maxAncestors: 2 });
    // click target + 2 ancestors = 3 max from ancestor walk
    const ancestorCount = candidates.filter(c => c.element !== leaf).length;
    assert.ok(ancestorCount <= 2);
  });
});
