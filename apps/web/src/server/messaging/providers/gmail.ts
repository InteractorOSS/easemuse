// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import MailComposer from 'nodemailer/lib/mail-composer';
import { addressOf, providerCall, type Fetch, type MailProvider } from './types';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** The message as the RFC 822 text Gmail's send endpoint wants. */
function buildRaw(mail: Parameters<MailProvider['send']>[1], from: string): Promise<Buffer> {
  const composer = new MailComposer({
    from,
    to: mail.to,
    ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return new Promise((resolve, reject) =>
    composer.compile().build((error, message) => (error ? reject(error) : resolve(message))),
  );
}

/** Gmail through its REST API, with the token Interactor holds for the recruiter (T-5-12). */
export function createGmailProvider(fetchImpl: Fetch = fetch): MailProvider {
  const address = async (token: string) => {
    const profile = await providerCall<{ emailAddress: string }>(
      fetchImpl,
      token,
      'GET',
      `${BASE}/profile`,
    );
    return profile.emailAddress.toLowerCase();
  };
  return {
    name: 'gmail',
    address,
    async send(token, mail) {
      const from = await address(token);
      const raw = (await buildRaw(mail, from)).toString('base64url');
      const sent = await providerCall<{ id: string; threadId: string }>(
        fetchImpl,
        token,
        'POST',
        `${BASE}/messages/send`,
        { raw },
      );
      return { messageId: sent.id, threadId: sent.threadId };
    },
    async listThread(token, threadId) {
      const thread = await providerCall<{
        messages?: {
          id: string;
          internalDate?: string;
          payload?: { headers?: { name: string; value: string }[] };
        }[];
      }>(
        fetchImpl,
        token,
        'GET',
        `${BASE}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From`,
      );
      return (thread.messages ?? []).map((m) => ({
        id: m.id,
        from: addressOf(
          m.payload?.headers?.find((h) => h.name.toLowerCase() === 'from')?.value ?? '',
        ),
        receivedAt: new Date(Number(m.internalDate ?? 0)),
      }));
    },
  };
}
