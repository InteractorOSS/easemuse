// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { resolveServiceUrl, SERVICE_FALLBACK_URLS } from './service-urls';

describe('resolveServiceUrl', () => {
  it('uses the fallback for unset and blank values', () => {
    expect(resolveServiceUrl(undefined, SERVICE_FALLBACK_URLS.billingServer)).toBe(
      'https://billing.interactor.com',
    );
    expect(resolveServiceUrl('', 'https://x.test')).toBe('https://x.test');
  });

  it('strips trailing slashes', () => {
    expect(resolveServiceUrl('https://host.test//', 'https://x.test')).toBe('https://host.test');
  });
});
