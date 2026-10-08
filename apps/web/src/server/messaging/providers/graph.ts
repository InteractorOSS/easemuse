// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { providerCall, type Fetch, type MailProvider } from './types';

const BASE = 'https://graph.microsoft.com/v1.0/me';

/**
 * Microsoft 365 through Microsoft Graph (T-5-12). A message is created as a draft first, because the
 * send call itself returns nothing, and the draft carries the conversation id replies are matched on.
 */
export function createGraphProvider(fetchImpl: Fetch = fetch): MailProvider {
  return {
    name: 'graph',
    async address(token) {
      const me = await providerCall<{ mail?: string | null; userPrincipalName?: string }>(
        fetchImpl,
        token,
        'GET',
        `${BASE}?$select=mail,userPrincipalName`,
      );
      return (me.mail || me.userPrincipalName || '').toLowerCase();
    },
    async send(token, mail) {
      const draft = await providerCall<{ id: string; conversationId: string }>(
        fetchImpl,
        token,
        'POST',
        `${BASE}/messages`,
        {
          subject: mail.subject,
          body: { contentType: 'HTML', content: mail.html },
          toRecipients: [{ emailAddress: { address: mail.to } }],
          ...(mail.replyTo ? { replyTo: [{ emailAddress: { address: mail.replyTo } }] } : {}),
        },
      );
      await providerCall<void>(
        fetchImpl,
        token,
        'POST',
        `${BASE}/messages/${encodeURIComponent(draft.id)}/send`,
      );
      return { messageId: draft.id, threadId: draft.conversationId };
    },
    async listThread(token, threadId) {
      const filter = encodeURIComponent(`conversationId eq '${threadId.replace(/'/g, "''")}'`);
      const list = await providerCall<{
        value?: {
          id: string;
          receivedDateTime?: string;
          from?: { emailAddress?: { address?: string } };
        }[];
      }>(
        fetchImpl,
        token,
        'GET',
        `${BASE}/messages?$filter=${filter}&$select=id,from,receivedDateTime&$top=50`,
      );
      return (list.value ?? []).map((m) => ({
        id: m.id,
        from: (m.from?.emailAddress?.address ?? '').toLowerCase(),
        receivedAt: new Date(m.receivedDateTime ?? 0),
      }));
    },
  };
}
