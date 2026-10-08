// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAND_COLOR,
  agencyBrandingPatchSchema,
  contrastWithWhite,
  parseBranding,
} from './branding';

describe('brand colour contrast', () => {
  it('is 21 for black, 1 for white and passes for the default colour', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 1);
    expect(contrastWithWhite(DEFAULT_BRAND_COLOR)).toBeGreaterThan(4.5);
  });
});

describe('agencyBrandingPatchSchema (FR-TEN-04)', () => {
  it('accepts a readable colour and a display name', () => {
    expect(
      agencyBrandingPatchSchema.safeParse({
        displayName: ' Acme Search ',
        primaryColor: '#1d4ed8',
      }),
    ).toMatchObject({ success: true, data: { displayName: 'Acme Search' } });
  });
  it('rejects a colour too light to read on white, and malformed colours', () => {
    expect(agencyBrandingPatchSchema.safeParse({ primaryColor: '#ffff00' }).success).toBe(false);
    expect(agencyBrandingPatchSchema.safeParse({ primaryColor: 'blue' }).success).toBe(false);
  });
  it('lets a null display name go back to the agency name, and rejects an empty patch', () => {
    expect(agencyBrandingPatchSchema.safeParse({ displayName: null }).success).toBe(true);
    expect(agencyBrandingPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('parseBranding', () => {
  it('falls back to the defaults for anything invalid', () => {
    expect(parseBranding({ primaryColor: 'nope' })).toEqual({ primaryColor: DEFAULT_BRAND_COLOR });
    expect(parseBranding(null).primaryColor).toBe(DEFAULT_BRAND_COLOR);
  });
});
