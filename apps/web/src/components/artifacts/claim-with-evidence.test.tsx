// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClaimWithEvidence } from './claim-with-evidence';

const wrap = (ui: React.ReactElement) =>
  renderWithIntl(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

describe('ClaimWithEvidence', () => {
  it('shows an Inferred label, always visible, for a claim with no citation', () => {
    wrap(
      <ClaimWithEvidence
        claim={{ text: 'Likely motivated by growth', evidence: [{ type: 'inferred' }] }}
      />,
    );
    expect(screen.getByText('Likely motivated by growth')).toBeTruthy();
    expect(screen.getByText('Inferred')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the quoted source on keyboard focus for a cited claim', async () => {
    const user = userEvent.setup();
    wrap(
      <ClaimWithEvidence
        claim={{
          text: 'Led a team of 8',
          evidence: [
            {
              type: 'quote',
              source: 'resume',
              excerpt: 'Led a team of 8 engineers',
              location: 'Acme Corp',
            },
            { type: 'quote', source: 'notes', excerpt: 'confirmed team size on the call' },
          ],
        }}
      />,
    );
    expect(screen.queryByText('Inferred')).toBeNull();
    expect(screen.getByRole('button', { name: 'Evidence (2)' })).toBeTruthy();
    await user.tab();
    expect((await screen.findAllByText('Led a team of 8 engineers')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('From Resume · Acme Corp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('From Notes').length).toBeGreaterThan(0);
  });

  it('treats a claim with both a citation and an inference as cited', () => {
    wrap(
      <ClaimWithEvidence
        claim={{
          text: 'x',
          evidence: [{ type: 'inferred' }, { type: 'quote', source: 'jd', excerpt: 'y' }],
        }}
      />,
    );
    expect(screen.queryByText('Inferred')).toBeNull();
    expect(screen.getByRole('button', { name: 'Evidence (1)' })).toBeTruthy();
  });
});
