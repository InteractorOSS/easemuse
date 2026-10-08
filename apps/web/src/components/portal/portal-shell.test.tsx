// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderWithIntl } from '@/test/render';
import { PortalShell } from './portal-shell';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe('PortalShell branding (T-14-06, FR-CDP-07)', () => {
  const props = { agencyName: 'Acme Search', color: '#1d4ed8', slug: 'acme', prefix: 'c' as const };

  it('shows the agency logo next to its name, in its colour', () => {
    const { container } = renderWithIntl(
      <PortalShell {...props} signedIn={false} logoUrl="/api/public/agencies/acme/logo?v=f1">
        <p>Hello</p>
      </PortalShell>,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/api/public/agencies/acme/logo?v=f1',
    );
    expect(screen.getByRole('link', { name: 'Acme Search' })).toBeTruthy();
    expect(container.firstElementChild?.getAttribute('style')).toContain('#1d4ed8');
  });

  it('shows no image without a logo, and passes axe with one', async () => {
    const without = renderWithIntl(
      <PortalShell {...props} signedIn={false}>
        <p>Hello</p>
      </PortalShell>,
    );
    expect(without.container.querySelector('img')).toBeNull();
    without.unmount();
    const withLogo = renderWithIntl(
      <PortalShell {...props} signedIn logoUrl="/logo.png">
        <p>Hello</p>
      </PortalShell>,
    );
    await expectNoA11yViolations(withLogo.container);
  });
});
