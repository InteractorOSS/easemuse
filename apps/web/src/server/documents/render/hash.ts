// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import type { AgencyBranding } from '@easemuse/core';

/** Change this when a print template changes, so documents rendered with the old one are redone. */
export const TEMPLATE_VERSIONS = { jd: 'jd-print-v1', resume: 'resume-print-v1' } as const;
export type RenderKind = keyof typeof TEMPLATE_VERSIONS;

/** JSON with object keys sorted, so the same content always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The content hash of a render (ADR-011): the approved content, the agency branding and the
 * template version. A stored PDF is reused while this stays the same.
 */
export function renderHash(input: {
  kind: RenderKind;
  content: unknown;
  branding: AgencyBranding;
  /** Anything else on the page that comes from other records (position title, client name...). */
  context?: unknown;
}): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        template: TEMPLATE_VERSIONS[input.kind],
        content: input.content,
        branding: input.branding,
        context: input.context ?? null,
      }),
    )
    .digest('hex');
}
