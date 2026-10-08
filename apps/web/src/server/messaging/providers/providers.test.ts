// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { createGmailProvider } from './gmail';
import { createGraphProvider } from './graph';
import { ProviderAuthError, ProviderHttpError, addressOf } from './types';

const json = (body: unknown, status = 200) => Response.json(body, { status });
const mail = {
  to: 'jane@example.com',
  subject: 'A role for you',
  text: 'Hi Jane',
  html: '<p>Hi Jane</p>',
  replyTo: 'sam@agency.test',
};

describe('Gmail provider (T-5-12)', () => {
  it('sends a base64url RFC 822 message as the mailbox owner and returns the ids', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(input), init });
      return String(input).endsWith('/profile')
        ? json({ emailAddress: 'Sam@Agency.test' })
        : json({ id: 'm1', threadId: 't1' });
    };
    const sent = await createGmailProvider(fetchImpl as never).send('tok', mail);
    expect(sent).toEqual({ messageId: 'm1', threadId: 't1' });
    const send = calls.find((c) => c.url.endsWith('/messages/send'))!;
    expect((send.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const raw = JSON.parse(String(send.init.body)).raw as string;
    expect(raw).not.toMatch(/[+/=]/);
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    expect(text).toContain('From: sam@agency.test');
    expect(text).toContain('To: jane@example.com');
    expect(text).toContain('Reply-To: sam@agency.test');
    expect(text).toContain('Subject: A role for you');
    expect(text).toContain('Hi Jane');
  });

  it('lists a thread with who wrote each message and when', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>
      json({
        messages: [
          {
            id: 'a',
            internalDate: '1760000000000',
            payload: { headers: [{ name: 'From', value: 'Sam <sam@agency.test>' }] },
          },
          {
            id: 'b',
            internalDate: '1760003600000',
            payload: { headers: [{ name: 'from', value: 'Jane Doe <JANE@example.com>' }] },
          },
        ],
      }),
    );
    const thread = await createGmailProvider(fetchImpl as never).listThread('tok', 't/1');
    expect(thread).toEqual([
      { id: 'a', from: 'sam@agency.test', receivedAt: new Date(1760000000000) },
      { id: 'b', from: 'jane@example.com', receivedAt: new Date(1760003600000) },
    ]);
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('/threads/t%2F1?format=metadata');
  });

  it('says the sign-in is no good on 401 and 403, and classifies other failures', async () => {
    const provider = (status: number) =>
      createGmailProvider((async () => new Response('x', { status })) as never);
    await expect(provider(401).address('t')).rejects.toBeInstanceOf(ProviderAuthError);
    await expect(provider(403).address('t')).rejects.toBeInstanceOf(ProviderAuthError);
    await expect(provider(400).address('t')).rejects.toMatchObject({
      status: 400,
      transient: false,
    });
    const server = await provider(503)
      .address('t')
      .catch((e: ProviderHttpError) => e);
    expect(server).toMatchObject({ status: 503, transient: true });
  });
});

describe('Microsoft Graph provider (T-5-12)', () => {
  it('creates a draft, sends it, and returns the conversation id', async () => {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({
        url: String(input),
        method: init.method ?? 'GET',
        ...(init.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return String(input).endsWith('/send')
        ? new Response(null, { status: 202 })
        : json({ id: 'draft1', conversationId: 'conv1' });
    };
    const sent = await createGraphProvider(fetchImpl as never).send('tok', mail);
    expect(sent).toEqual({ messageId: 'draft1', threadId: 'conv1' });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://graph.microsoft.com/v1.0/me/messages',
      body: {
        subject: 'A role for you',
        body: { contentType: 'HTML', content: '<p>Hi Jane</p>' },
        toRecipients: [{ emailAddress: { address: 'jane@example.com' } }],
        replyTo: [{ emailAddress: { address: 'sam@agency.test' } }],
      },
    });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://graph.microsoft.com/v1.0/me/messages/draft1/send',
    });
  });

  it('reads the mailbox address and a conversation', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/messages?')
        ? json({
            value: [
              {
                id: 'x',
                from: { emailAddress: { address: 'Jane@Example.com' } },
                receivedDateTime: '2026-10-09T10:00:00Z',
              },
            ],
          })
        : json({ mail: null, userPrincipalName: 'Sam@Agency.test' }),
    );
    const provider = createGraphProvider(fetchImpl as never);
    expect(await provider.address('tok')).toBe('sam@agency.test');
    expect(await provider.listThread('tok', "conv'1")).toEqual([
      { id: 'x', from: 'jane@example.com', receivedAt: new Date('2026-10-09T10:00:00Z') },
    ]);
    expect(decodeURIComponent(String(fetchImpl.mock.calls[1]![0]))).toContain(
      "conversationId eq 'conv''1'",
    );
  });
});

describe('addressOf', () => {
  it('finds the address in the forms a From header takes', () => {
    expect(addressOf('Jane <Jane@Example.com>')).toBe('jane@example.com');
    expect(addressOf('"Doe, Jane" <j@x.test>')).toBe('j@x.test');
    expect(addressOf('plain@x.test')).toBe('plain@x.test');
    expect(addressOf('no address')).toBe('');
  });
});
