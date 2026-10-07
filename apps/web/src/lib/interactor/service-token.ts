// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getEnv } from '../env';
import { accountServerUrl } from './service-urls';

/**
 * App-level access token from the Account Server (OAuth 2.0 client_credentials, ADR-014), for the
 * worker and for server routes that call Interactor services on a user's behalf. Tokens live about
 * 15 minutes; they are cached with a safety margin and concurrent callers share one mint.
 */
export class ServiceTokenError extends Error {
  constructor(
    message: string,
    /** True for network errors, timeouts, 429 and 5xx: worth retrying, not a credentials problem. */
    public readonly transient: boolean,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ServiceTokenError';
  }
}

const REFRESH_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 300;
const DEFAULT_TTL_SECONDS = 900;

type Fetch = typeof fetch;
interface Cached {
  token: string;
  expiresAt: number;
}

async function mintOnce(fetchImpl: Fetch, baseUrl: string, clientId: string, clientSecret: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Never echo the response body: it can contain the submitted client id.
      throw new ServiceTokenError(
        `Account Server token request failed: ${res.status}`,
        res.status === 429 || res.status >= 500,
        res.status,
      );
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new ServiceTokenError(
        'Account Server token response had no access_token',
        false,
        res.status,
      );
    }
    return { token: json.access_token, ttl: json.expires_in ?? DEFAULT_TTL_SECONDS };
  } catch (error) {
    if (error instanceof ServiceTokenError) throw error;
    const detail =
      error instanceof Error && error.name === 'AbortError' ? 'timed out' : String(error);
    throw new ServiceTokenError(`Account Server token request failed: ${detail}`, true);
  } finally {
    clearTimeout(timer);
  }
}

export interface ServiceTokenSource {
  getToken(): Promise<string>;
  /** Drops the cached token (after a 401 from a service). */
  invalidate(): void;
}

export function createServiceTokenSource(options: {
  clientId: string | undefined;
  clientSecret: string | undefined;
  baseUrl: () => string;
  fetch?: Fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): ServiceTokenSource {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let cached: Cached | null = null;
  let inflight: Promise<string> | null = null;

  async function mint(): Promise<string> {
    if (!options.clientId || !options.clientSecret) {
      throw new ServiceTokenError(
        'INTERACTOR_AUTH_CLIENT_ID and INTERACTOR_AUTH_CLIENT_SECRET must be set to call Interactor services',
        false,
      );
    }
    let lastError: ServiceTokenError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { token, ttl } = await mintOnce(
          fetchImpl,
          options.baseUrl(),
          options.clientId,
          options.clientSecret,
        );
        cached = { token, expiresAt: now() + ttl * 1000 };
        return token;
      } catch (error) {
        lastError = error as ServiceTokenError;
        if (!lastError.transient || attempt === MAX_ATTEMPTS) break;
        await sleep(RETRY_DELAY_MS);
      }
    }
    throw lastError!;
  }

  return {
    async getToken() {
      if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now()) return cached.token;
      inflight ??= mint().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    invalidate() {
      cached = null;
    },
  };
}

let processSource: ServiceTokenSource | undefined;

/** The process-wide token source, built from validated env on first use. */
export function getServiceToken(): Promise<string> {
  processSource ??= createServiceTokenSource({
    clientId: getEnv().INTERACTOR_AUTH_CLIENT_ID,
    clientSecret: getEnv().INTERACTOR_AUTH_CLIENT_SECRET,
    baseUrl: accountServerUrl,
  });
  return processSource.getToken();
}
