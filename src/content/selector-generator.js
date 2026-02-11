const GENERATED_ID_PATTERN = /^[a-f0-9]{8,}$|^[a-z]+-[a-f0-9]{4,}/i;

const SEMANTIC_TAGS = new Set([
  'input', 'textarea', 'select', 'button', 'a', 'label',
]);

const SEMANTIC_ROLES = new Set([
  'button', 'textbox', 'link', 'checkbox', 'radio', 'combobox', 'searchbox', 'switch',
]);

const ATTRIBUTE_PRIORITY = [
  'name',
  'type',
  'role',
  'aria-label',
  'placeholder',
];

export function isGeneratedId(id) {
  if (!id) return true;
  if (GENERATED_ID_PATTERN.test(id)) return true;
  if (id.length <= 3) return true;
  if (id.includes('-') || id.includes('_')) return false;
  if (/^[a-z]{4,}$/.test(id)) return false;
  if (id.length < 8 && /[A-Z]/.test(id) && /[a-z]/.test(id) && !id.includes('-') && !id.includes('_')) return true;
  return false;
}

function escapeAttrValue(val) {
  return val.replace(/"/g, '\\"');
}

export function generateSelector(element, options = {}) {
  const disabledAttrs = new Set(options.disabledAttributes || []);
  const tag = element.tagName.toLowerCase();
  const allUsedAttributes = [];
  const descriptionParts = [];

  const id = element.id || element.getAttribute('id');
  if (id && !isGeneratedId(id) && !disabledAttrs.has('id')) {
    allUsedAttributes.push('id');
    descriptionParts.push(`#${id}`);
  }

  for (const attr of ATTRIBUTE_PRIORITY) {
    if (disabledAttrs.has(attr)) continue;
    const val = element.getAttribute(attr);
    if (!val) continue;
    allUsedAttributes.push(attr);
    descriptionParts.push(`${attr}="${val}"`);
  }

  const textContent = element.textContent?.trim();
  if (textContent && textContent.length < 50 && !disabledAttrs.has('textContent')) {
    descriptionParts.push(`'${textContent}'`);
    if (allUsedAttributes.length === 0 || (allUsedAttributes.length === 1 && allUsedAttributes[0] === 'type')) {
      allUsedAttributes.push('textContent');
    }
  }

  const doc = element.ownerDocument;
  const attrParts = [];

  if (allUsedAttributes.includes('id')) {
    attrParts.push(`#${id}`);
  }
  for (const attr of ATTRIBUTE_PRIORITY) {
    if (!allUsedAttributes.includes(attr)) continue;
    const val = element.getAttribute(attr);
    attrParts.push(`[${attr}="${escapeAttrValue(val)}"]`);
  }

  let selector = tag;
  if (doc) {
    try {
      if (doc.querySelectorAll(tag).length === 1) {
        const humanReadable = buildHumanReadable(tag, descriptionParts, textContent);
        return { selector: tag, selectorMeta: { usedAttributes: allUsedAttributes, humanReadable }, humanReadable };
      }
    } catch (_) { /* invalid selector, continue */ }

    for (const part of attrParts) {
      const candidate = tag + part;
      try {
        if (doc.querySelectorAll(candidate).length === 1) {
          selector = candidate;
          const humanReadable = buildHumanReadable(tag, descriptionParts, textContent);
          return { selector, selectorMeta: { usedAttributes: allUsedAttributes, humanReadable }, humanReadable };
        }
      } catch (_) { /* continue */ }
    }
  }

  selector = tag + attrParts.join('');
  const humanReadable = buildHumanReadable(tag, descriptionParts, textContent);

  return {
    selector,
    selectorMeta: { usedAttributes: allUsedAttributes, humanReadable },
    humanReadable,
  };
}

function buildHumanReadable(tag, descriptionParts, textContent) {
  const parts = [];

  if (textContent && textContent.length < 50) {
    parts.push(`'${textContent}'`);
  }

  const tagLabel = tag === 'input' ? 'input' : tag === 'button' ? 'button' : tag;
  parts.push(tagLabel);

  if (descriptionParts.length > 0) {
    const attrInfo = descriptionParts.filter(p => !p.startsWith("'")).join(', ');
    if (attrInfo) {
      parts.push(`(${attrInfo})`);
    }
  }

  return parts.join(' ');
}

export function isSemanticElement(element) {
  const tag = element.tagName.toLowerCase();
  if (SEMANTIC_TAGS.has(tag)) return true;

  const role = element.getAttribute('role');
  if (role && SEMANTIC_ROLES.has(role)) return true;

  const ce = element.getAttribute('contenteditable');
  if (ce === 'true' || ce === '') return true;

  return false;
}

function findSemanticDescendants(root, maxDepth = 3) {
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

function scoreCandidate(element, distance) {
  let score = 100 - (distance * 10);
  const tag = element.tagName.toLowerCase();

  if (SEMANTIC_TAGS.has(tag)) score += 50;

  const role = element.getAttribute('role');
  if (role && SEMANTIC_ROLES.has(role)) score += 40;

  const ce = element.getAttribute('contenteditable');
  if (ce === 'true' || ce === '') score += 45;

  if (element.id && !isGeneratedId(element.id)) score += 10;
  if (element.getAttribute('name')) score += 10;
  if (element.getAttribute('aria-label')) score += 10;

  return score;
}

export function buildCandidateList(clickTarget, options = {}) {
  const maxAncestors = options.maxAncestors ?? 5;
  const maxDescendantDepth = options.maxDescendantDepth ?? 3;
  const maxCandidates = options.maxCandidates ?? 8;

  const seen = new Set();
  const candidates = [];

  function addCandidate(element, distance) {
    if (seen.has(element)) return;
    seen.add(element);
    const score = scoreCandidate(element, distance);
    const info = generateSelector(element);
    candidates.push({
      element,
      score,
      isSemantic: isSemanticElement(element),
      selector: info.selector,
      humanReadable: info.humanReadable,
      usedAttributes: info.selectorMeta.usedAttributes,
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
