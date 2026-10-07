// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { renderToStaticMarkup } from 'react-dom/server';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import { createClient } from '@/server/clients/service';
import { createPosition } from '@/server/positions/service';
import { signRenderToken } from '@/server/documents/render/token';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { approveStructuredJd, structuredJdContent } from '@/test/jd-fixtures';
import positions from '../../../messages/en/positions.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const parts = namespace.split('.').slice(1);
    const node = parts.reduce<Record<string, unknown>>(
      (acc, p) => acc[p] as Record<string, unknown>,
      positions as Record<string, unknown>,
    );
    return (key: string) => node[key] as string;
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return { ...actual, getEnv: () => ({ ...actual.getEnv(), AUTH_SECRET: 'test-secret' }) };
});

describe.skipIf(!dbAvailable())('print page for the improved JD (T-1-12)', () => {
  let admin: pg.Client;
  let handle: ReturnType<typeof appHandle>;
  let agencyId: string;
  let versionId: string;
  let Page: typeof import('./jd/[versionId]/page').default;
  const render = async (
    over: { agency?: string; token?: string | undefined; version?: string } = {},
  ) => {
    const v = over.version ?? versionId;
    const token =
      'token' in over
        ? over.token
        : signRenderToken({ secret: 'test-secret', agencyId, versionId: v });
    const element = await Page({
      params: Promise.resolve({ versionId: v }),
      searchParams: Promise.resolve({
        agency: over.agency ?? agencyId,
        ...(token ? { token } : {}),
      }),
    });
    return renderToStaticMarkup(element);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Print A');
    const userId = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
      [agencyId, userId],
    );
    await admin.query(
      `UPDATE "Agency" SET branding = '{"displayName":"Acme Search","primaryColor":"#123456"}'::jsonb WHERE id = $1`,
      [agencyId],
    );
    const actor: AgencyActor = { kind: 'agency', userId, agencyId, role: 'recruiter' };
    type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
    const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
    const client = (await run((tx) => createClient(tx, actor, { name: 'Northwind' }))).client;
    const positionId = (
      await run((tx) =>
        createPosition(tx, actor, {
          clientId: client.id,
          title: 'Staff Engineer',
          location: 'Seoul',
        }),
      )
    ).id;
    const content = structuredJdContent([
      { id: crypto.randomUUID(), text: 'Go, 5+ years', category: 'must_have' },
      { id: crypto.randomUUID(), text: 'Kubernetes', category: 'preferred' },
      { id: crypto.randomUUID(), text: 'No agency submissions', category: 'disqualifying' },
    ]);
    (content.sections as Record<string, { status: string; summary: string }>).compensation = {
      status: 'missing',
      summary: '',
    };
    versionId = await approveStructuredJd(run, actor, positionId, content);
    Page = (await import('./jd/[versionId]/page')).default;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('shows the agency name and colour, the position, the sections that were found and requirements by priority', async () => {
    const html = await render();
    expect(html).toContain('Acme Search');
    expect(html).toContain('#123456');
    expect(html).toContain('Staff Engineer');
    expect(html).toContain('Northwind');
    expect(html).toContain('Go, 5+ years');
    expect(html).toContain('Kubernetes');
    expect(html).toContain('Must-have');
    expect(html).toContain('Preferred');
  });

  it('leaves out deal-breakers and sections the JD did not cover', async () => {
    const html = await render();
    expect(html).not.toContain('No agency submissions');
    expect(html).not.toContain('Disqualifying');
    expect(html).not.toContain('Compensation');
  });

  it('is a 404 without a valid token, for another version or agency, or with a bad id', async () => {
    await expect(render({ token: undefined })).rejects.toThrow('NOT_FOUND');
    await expect(render({ token: 'x.y' })).rejects.toThrow('NOT_FOUND');
    await expect(render({ version: crypto.randomUUID() })).rejects.toThrow('NOT_FOUND');
    await expect(render({ agency: crypto.randomUUID() })).rejects.toThrow('NOT_FOUND');
    await expect(render({ agency: 'not-a-uuid' })).rejects.toThrow('NOT_FOUND');
  });
});
