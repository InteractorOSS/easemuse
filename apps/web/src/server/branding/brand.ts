// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { parseBranding } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';

/** How an agency presents itself outside the workbench: name, colour and a logo address (FR-TEN-04). */
export interface Brand {
  name: string;
  color: string;
  /** Absolute URL for emails, root-relative for pages; null when the agency has no logo. */
  logoUrl: string | null;
}

/** The public address of the logo. The file id in the query makes a new logo bypass caches. */
export function logoPath(slug: string, logoFileId: string): string {
  return `/api/public/agencies/${encodeURIComponent(slug)}/logo?v=${logoFileId}`;
}

/** Pure: builds the brand from an agency row. `baseUrl` makes the logo address absolute (for email). */
export function brandOf(
  agency: { slug: string; name: string; branding: unknown },
  baseUrl?: string,
): Brand {
  const branding = parseBranding(agency.branding);
  return {
    name: branding.displayName ?? agency.name,
    color: branding.primaryColor,
    logoUrl: branding.logoFileId
      ? `${baseUrl ? baseUrl.replace(/\/+$/, '') : ''}${logoPath(agency.slug, branding.logoFileId)}`
      : null,
  };
}

export async function loadBrand(tx: ScopedTx, agencyId: string, baseUrl?: string): Promise<Brand> {
  const agency = await tx.agency.findUnique({
    where: { id: agencyId },
    select: { slug: true, name: true, branding: true },
  });
  return brandOf(agency ?? { slug: '', name: '', branding: null }, baseUrl);
}
