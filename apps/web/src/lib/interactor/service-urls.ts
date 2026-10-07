// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getEnv } from '../env';

/**
 * The base URL of every Interactor service this app calls, declared once (ADR-014). A guard test
 * fails if one of these literals or env vars is read anywhere else, so two call sites can never
 * dial different hosts for the same service.
 */
export const SERVICE_FALLBACK_URLS = {
  accountServer: 'https://auth.interactor.com',
  billingServer: 'https://billing.interactor.com',
  core: 'http://localhost:4002',
  userDb: 'https://userdb.interactor.com',
  knowledgeBase: 'http://localhost:4005',
} as const;

/** A blank value counts as unset; trailing slashes are stripped so `${base}/path` is always safe. */
export function resolveServiceUrl(raw: string | undefined, fallback: string): string {
  return (raw || fallback).replace(/\/+$/, '');
}

export const accountServerUrl = (): string =>
  resolveServiceUrl(getEnv().ACCOUNT_SERVER_URL, SERVICE_FALLBACK_URLS.accountServer);
export const billingServerUrl = (): string =>
  resolveServiceUrl(getEnv().BILLING_SERVER_URL, SERVICE_FALLBACK_URLS.billingServer);
export const interactorCoreUrl = (): string =>
  resolveServiceUrl(getEnv().INTERACTOR_CORE_URL, SERVICE_FALLBACK_URLS.core);
export const interactorUserDbUrl = (): string =>
  resolveServiceUrl(getEnv().INTERACTOR_USERDB_URL, SERVICE_FALLBACK_URLS.userDb);
export const userKnowledgeBaseUrl = (): string =>
  resolveServiceUrl(getEnv().UKB_URL, SERVICE_FALLBACK_URLS.knowledgeBase);
