// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { createHttpBillingClient } from './http-client';
import { BillingError } from './types';

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
const json = (data: unknown, status = 200) => Response.json({ data }, { status });

function setup(routes: Record<string, Handler>) {
  const calls: { method: string; url: URL; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    calls.push({ method: init.method ?? 'GET', url, init });
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(url, init);
  });
  const client = createHttpBillingClient({
    baseUrl: () => 'https://billing.test',
    getToken: async () => 'tok',
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return { client, calls };
}

describe('live Billing Server client (shapes as product-manager reads them)', () => {
  it('lists plans with their metrics and limits', async () => {
    const { client, calls } = setup({
      'GET /api/public/plans': () =>
        json([
          {
            id: 'p1',
            role: 'easemuse_team',
            name: 'Team',
            base_price: '399.00',
            currency: 'USD',
            billing_period: 'monthly',
            metrics: [
              { name: 'seats', display_name: 'Seats', limit: 10, limit_type: 'hard' },
              { name: 'ai_cost_cents', display_name: 'AI', limit: null, limit_type: null },
            ],
          },
        ]),
    });
    const [plan] = await client.listPlans();
    expect(plan).toMatchObject({ id: 'p1', role: 'easemuse_team', basePrice: '399.00' });
    expect(plan!.metrics).toEqual([
      { name: 'seats', displayName: 'Seats', limit: 10, limitType: 'hard' },
      { name: 'ai_cost_cents', displayName: 'AI', limit: null, limitType: null },
    ]);
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('reads the subscription and the limits of an agency as a subscriber', async () => {
    const { client, calls } = setup({
      'GET /api/service/subscriptions/check': () =>
        json({
          has_active_subscription: true,
          subscriptions: [{ id: 's1', plan_id: 'p1', status: 'active' }],
        }),
      'GET /api/service/limits': () =>
        json({
          subscriber_id: 'a1',
          limits: {
            seats: { limit: 10, used: 3, type: 'hard' },
            ai_cost_cents: { limit: null, used: 120, type: 'unlimited' },
          },
        }),
    });
    const state = await client.getState('agency-1');
    expect(state).toEqual({
      subscription: { id: 's1', planId: 'p1', status: 'active' },
      limits: [
        { metric: 'seats', limit: 10, used: 3, type: 'hard' },
        { metric: 'ai_cost_cents', limit: null, used: 120, type: 'unlimited' },
      ],
    });
    expect(calls[0]!.url.search).toBe('?subscriber_id=agency-1&subscriber_type=organization');
  });

  it('says "none" for an agency with no subscription, and "unreadable" for an error or a payload it cannot act on', async () => {
    const none = setup({
      'GET /api/service/subscriptions/check': () =>
        json({ has_active_subscription: false, subscriptions: [] }),
      'GET /api/service/limits': () => json({ limits: {} }),
    });
    expect(await none.client.getState('a')).toEqual({ subscription: null, limits: [] });

    const down = setup({
      'GET /api/service/subscriptions/check': () => new Response('', { status: 503 }),
      'GET /api/service/limits': () => new Response('', { status: 503 }),
    });
    expect(await down.client.getState('a')).toBeNull();

    const contradictory = setup({
      'GET /api/service/subscriptions/check': () =>
        json({ has_active_subscription: true, subscriptions: [] }),
      'GET /api/service/limits': () => json({ limits: {} }),
    });
    expect(await contradictory.client.getState('a')).toBeNull();
  });

  it('creates a subscription, treats 409 as already there, and reports other refusals with the server code', async () => {
    const ok = setup({ 'POST /api/service/subscriptions': () => json({ id: 's9' }, 201) });
    expect(await ok.client.createSubscription('a1', 'p1')).toEqual({
      status: 'created',
      subscriptionId: 's9',
    });
    expect(JSON.parse(String(ok.calls[0]!.init.body))).toEqual({
      subscriber_id: 'a1',
      subscriber_type: 'organization',
      plan_id: 'p1',
    });
    const exists = setup({
      'POST /api/service/subscriptions': () => new Response('{}', { status: 409 }),
    });
    expect(await exists.client.createSubscription('a1', 'p1')).toEqual({
      status: 'already_exists',
    });
    const refused = setup({
      'POST /api/service/subscriptions': () =>
        Response.json(
          { error: { code: 'unknown_plan', message: 'secret detail' } },
          { status: 404 },
        ),
    });
    const error = (await refused.client
      .createSubscription('a1', 'p1')
      .catch((e) => e)) as BillingError;
    expect(error).toBeInstanceOf(BillingError);
    expect(error.status).toBe(404);
    expect(error.message).toContain('unknown_plan');
    expect(error.message).not.toContain('secret detail');
  });

  it('reports usage with the idempotency key, and fails loudly so the caller can retry', async () => {
    const ok = setup({ 'POST /api/service/usage': () => json({}) });
    await ok.client.reportUsage({
      agencyId: 'a1',
      metric: 'ai_cost_cents',
      quantity: 42,
      idempotencyKey: 'k1',
    });
    expect(JSON.parse(String(ok.calls[0]!.init.body))).toEqual({
      subscriber_id: 'a1',
      subscriber_type: 'organization',
      metric_name: 'ai_cost_cents',
      count: 42,
      idempotency_key: 'k1',
    });
    const down = setup({ 'POST /api/service/usage': () => new Response('x', { status: 500 }) });
    await expect(
      down.client.reportUsage({
        agencyId: 'a1',
        metric: 'seats',
        quantity: 1,
        idempotencyKey: 'k',
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('lists invoices newest first as the server sends them, and null when it cannot read them', async () => {
    const { client } = setup({
      'GET /api/service/charges': () =>
        json([
          {
            id: 'c1',
            kind: 'subscription',
            amount: '399.00',
            currency: 'USD',
            status: 'paid',
            period: { start: '2026-09-01', end: '2026-10-01' },
            issued_at: '2026-10-01',
            paid_at: '2026-10-02',
          },
        ]),
    });
    expect(await client.listInvoices('a1')).toEqual([
      {
        id: 'c1',
        kind: 'subscription',
        amount: '399.00',
        currency: 'USD',
        status: 'paid',
        periodStart: '2026-09-01',
        periodEnd: '2026-10-01',
        issuedAt: '2026-10-01',
        paidAt: '2026-10-02',
      },
    ]);
    const down = setup({ 'GET /api/service/charges': () => new Response('', { status: 500 }) });
    expect(await down.client.listInvoices('a1')).toBeNull();
  });

  it('turns a network failure into a BillingError with status 0', async () => {
    const client = createHttpBillingClient({
      baseUrl: () => 'https://billing.test',
      getToken: async () => 'tok',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });
    await expect(client.listPlans()).rejects.toMatchObject({ status: 0 });
  });
});
