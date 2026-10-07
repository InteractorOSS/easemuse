// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react';
import { afterEach, describe, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { OutboxList } from './outbox-list';
import { PrivacyRequests } from './privacy-requests';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown) => Response.json({ data: body });
const api = '/api/v1/agencies/a1';

describe('settings screens pass axe (T-QA-07)', () => {
  it('privacy requests, with an open, an overdue and a finished request', async () => {
    const row = (id: string, status: string, kind: string, overdue = false) => ({
      id,
      candidateId: 'c',
      candidateName: 'Jane Doe',
      kind,
      status,
      source: 'agency',
      note: 'By email',
      requestedAt: '2026-09-01T00:00:00Z',
      deadlineAt: '2026-10-15T00:00:00Z',
      completedAt: null,
      decisionNote: null,
      fileId: status === 'completed' ? 'f1' : null,
      overdue,
    });
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/privacy-requests`]: () =>
          json([
            row('1', 'requested', 'delete'),
            row('2', 'requested', 'export', true),
            row('3', 'completed', 'export'),
          ]),
      }).impl,
    );
    const { container } = renderApp(<PrivacyRequests agencyId="a1" isAdmin />);
    await screen.findByRole('heading', { name: 'Privacy requests' });
    await screen.findAllByText('Jane Doe', { exact: false });
    await expectNoA11yViolations(container);
  });

  it('the outbox', async () => {
    const message = (id: string, status: string) => ({
      id,
      toAddress: 'jane@example.com',
      subject: `Subject ${id}`,
      bodyText: 'Hello',
      kind: 'outreach',
      transport: 'dev-capture',
      status,
      attempts: 1,
      lastError: status === 'failed' ? 'Timeout' : null,
      sentAt: null,
      createdAt: '2026-10-07T00:00:00Z',
    });
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/outbox`]: () =>
          json({ items: [message('1', 'captured'), message('2', 'failed')], nextCursor: null }),
      }).impl,
    );
    const { container } = renderApp(<OutboxList agencyId="a1" />);
    await screen.findByText('Subject 1');
    await expectNoA11yViolations(container);
  });
});
