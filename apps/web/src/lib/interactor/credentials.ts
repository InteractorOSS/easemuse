// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getServiceToken } from './service-token';
import { interactorCoreUrl } from './service-urls';

/**
 * Client for Interactor's credential service (ADR-014): OAuth connections to a person's external
 * accounts, with the tokens stored and refreshed by Interactor. Here it is used for a recruiter's
 * mailbox. Every call carries the app's service token; the person is named by `external_user_id`.
 */
export class CredentialsError extends Error {
  constructor(
    message: string,
    /** True for network errors, timeouts, 429 and 5xx: worth retrying. */
    public readonly transient: boolean,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'CredentialsError';
  }
}

export interface CredentialInfo {
  id: string;
  externalUserId: string;
  serviceId: string;
  status: string;
  scopes: string[];
}

export interface CredentialsClient {
  /** Starts the sign-in; send the person to `authorizationUrl`. */
  initiateOAuth(input: {
    serviceId: string;
    externalUserId: string;
    scopes: string[];
    successRedirectUrl: string;
  }): Promise<{ flowId: string; authorizationUrl: string }>;
  getCredential(credentialId: string): Promise<CredentialInfo>;
  /** A current access token for the external service (Interactor refreshes it as needed). */
  getAccessToken(credentialId: string): Promise<string>;
  deleteCredential(credentialId: string): Promise<void>;
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 10_000;

export function createCredentialsClient(
  options: {
    baseUrl?: () => string;
    token?: () => Promise<string>;
    fetch?: Fetch;
  } = {},
): CredentialsClient {
  const baseUrl = options.baseUrl ?? interactorCoreUrl;
  const token = options.token ?? getServiceToken;
  const fetchImpl = options.fetch ?? fetch;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${baseUrl()}/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (res.status === 204) return undefined as T;
      if (!res.ok) {
        // The body can echo what was sent; only the status is kept.
        throw new CredentialsError(
          `Interactor credentials request failed: ${res.status}`,
          res.status === 429 || res.status >= 500,
          res.status,
        );
      }
      return ((await res.json()) as { data: T }).data;
    } catch (error) {
      if (error instanceof CredentialsError) throw error;
      const detail =
        error instanceof Error && error.name === 'AbortError' ? 'timed out' : String(error);
      throw new CredentialsError(`Interactor credentials request failed: ${detail}`, true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async initiateOAuth(input) {
      const data = await call<{ flow_id: string; authorization_url: string }>(
        'POST',
        '/oauth/initiate',
        {
          service_id: input.serviceId,
          external_user_id: input.externalUserId,
          scopes: input.scopes,
          success_redirect_url: input.successRedirectUrl,
        },
      );
      return { flowId: data.flow_id, authorizationUrl: data.authorization_url };
    },
    async getCredential(credentialId) {
      const data = await call<{
        id: string;
        external_user_id: string;
        service_id: string;
        status: string;
        scopes?: string[];
      }>('GET', `/credentials/${encodeURIComponent(credentialId)}`);
      return {
        id: data.id,
        externalUserId: data.external_user_id,
        serviceId: data.service_id,
        status: data.status,
        scopes: data.scopes ?? [],
      };
    },
    async getAccessToken(credentialId) {
      const data = await call<{ access_token: string }>(
        'GET',
        `/credentials/${encodeURIComponent(credentialId)}/token`,
      );
      return data.access_token;
    },
    async deleteCredential(credentialId) {
      await call<void>('DELETE', `/credentials/${encodeURIComponent(credentialId)}`);
    },
  };
}
