// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { brandOf, logoPath } from './brand';

const agency = { slug: 'acme', name: 'Acme Talent' };
const fileId = '11111111-1111-4111-8111-111111111111';

describe('brandOf', () => {
  it('uses the agency name and the default colour when nothing is set', () => {
    expect(brandOf({ ...agency, branding: {} })).toEqual({
      name: 'Acme Talent',
      color: '#1f2937',
      logoUrl: null,
    });
  });
  it('prefers the display name and builds a relative or absolute logo address', () => {
    const branding = { displayName: 'Acme Search', primaryColor: '#1d4ed8', logoFileId: fileId };
    expect(brandOf({ ...agency, branding })).toMatchObject({
      name: 'Acme Search',
      logoUrl: logoPath('acme', fileId),
    });
    expect(brandOf({ ...agency, branding }, 'https://app.test/').logoUrl).toBe(
      `https://app.test/api/public/agencies/acme/logo?v=${fileId}`,
    );
  });
  it('ignores a stored value that is not valid branding', () => {
    expect(brandOf({ ...agency, branding: { primaryColor: 'red' } }).color).toBe('#1f2937');
  });
});
