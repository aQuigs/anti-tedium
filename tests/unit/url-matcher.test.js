import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesUrl } from '../../src/shared/url-matcher.js';

describe('URL Matcher', { timeout: 50 }, () => {
  it('matches exact domain', () => {
    const rule = { domain: 'login.microsoft.com', pathPrefix: null };
    assert.ok(matchesUrl(rule, 'https://login.microsoft.com/some/path'));
  });

  it('rejects different domain', () => {
    const rule = { domain: 'login.microsoft.com', pathPrefix: null };
    assert.ok(!matchesUrl(rule, 'https://github.com/login'));
  });

  it('matches regardless of path when pathPrefix is null', () => {
    const rule = { domain: 'example.com', pathPrefix: null };
    assert.ok(matchesUrl(rule, 'https://example.com/foo/bar?q=1'));
  });

  it('matches with pathPrefix', () => {
    const rule = { domain: 'example.com', pathPrefix: '/login' };
    assert.ok(matchesUrl(rule, 'https://example.com/login'));
    assert.ok(matchesUrl(rule, 'https://example.com/login/step2'));
    assert.ok(!matchesUrl(rule, 'https://example.com/dashboard'));
  });

  it('handles URLs with ports', () => {
    const rule = { domain: 'localhost', pathPrefix: null };
    assert.ok(matchesUrl(rule, 'http://localhost:3000/login'));
  });

  it('is case-insensitive for domain', () => {
    const rule = { domain: 'GitHub.com', pathPrefix: null };
    assert.ok(matchesUrl(rule, 'https://github.com/login'));
  });

  it('handles invalid URLs gracefully', () => {
    const rule = { domain: 'example.com', pathPrefix: null };
    assert.ok(!matchesUrl(rule, 'not a url'));
  });
});
