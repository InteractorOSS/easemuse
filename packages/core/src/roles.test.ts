// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { AGENCY_ROLES, PLATFORM_ROLES } from './index';

describe('roles', () => {
  it('lists agency roles from most to least privileged', () => {
    expect(AGENCY_ROLES).toEqual(['admin', 'lead', 'recruiter']);
  });

  it('lists platform roles', () => {
    expect(PLATFORM_ROLES).toEqual(['owner', 'admin', 'support']);
  });
});
