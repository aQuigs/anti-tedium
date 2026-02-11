export function matchesUrl(rule, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.hostname.toLowerCase() !== rule.domain.toLowerCase()) {
    return false;
  }

  if (rule.pathPrefix) {
    return parsed.pathname.startsWith(rule.pathPrefix);
  }

  return true;
}
