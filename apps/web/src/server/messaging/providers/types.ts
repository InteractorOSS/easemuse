// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** A message in a conversation, as far as reply detection needs it. */
export interface ThreadMessage {
  id: string;
  /** Lowercase address of the sender. */
  from: string;
  receivedAt: Date;
}

export interface MailToSend {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | undefined;
}

/** A mail account's API (Gmail, Microsoft Graph), called with the access token Interactor holds (T-5-12). */
export interface MailProvider {
  readonly name: 'gmail' | 'graph';
  /** The mailbox's own address. */
  address(token: string): Promise<string>;
  /** Sends as the person; returns the sent message's id and its conversation id. */
  send(token: string, mail: MailToSend): Promise<{ messageId: string; threadId: string }>;
  /** Everything in one conversation, to look for replies. */
  listThread(token: string, threadId: string): Promise<ThreadMessage[]>;
}

/** The provider refused the token: the person must connect the mailbox again. */
export class ProviderAuthError extends Error {
  constructor(message = 'The mail provider refused the access token') {
    super(message);
    this.name = 'ProviderAuthError';
  }
}

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** True for 429 and 5xx: worth retrying. */
    public readonly transient: boolean,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export type Fetch = typeof fetch;

/** One provider API call: JSON in and out, the token never logged, failures classified. */
export async function providerCall<T>(
  fetchImpl: Fetch,
  token: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) throw new ProviderAuthError();
    if (!res.ok) {
      throw new ProviderHttpError(
        `Mail provider request failed: ${res.status}`,
        res.status,
        res.status === 429 || res.status >= 500,
      );
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (error instanceof ProviderAuthError || error instanceof ProviderHttpError) throw error;
    const detail =
      error instanceof Error && error.name === 'AbortError' ? 'timed out' : String(error);
    throw new ProviderHttpError(`Mail provider request failed: ${detail}`, 0, true);
  } finally {
    clearTimeout(timer);
  }
}

/** The address inside `Name <a@b.test>` or a bare address; lowercase. Empty when none. */
export function addressOf(header: string): string {
  const angle = header.match(/<([^<>\s]+@[^<>\s]+)>/);
  const bare = header.match(/[^\s<>"',;]+@[^\s<>"',;]+/);
  return (angle?.[1] ?? bare?.[0] ?? '').toLowerCase();
}
