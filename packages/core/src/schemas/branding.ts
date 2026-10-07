// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const DEFAULT_BRAND_COLOR = '#1f2937';

/** What `Agency.branding` may hold (FR-TEN-04): used on every generated document. */
export const agencyBrandingSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default(DEFAULT_BRAND_COLOR),
  /** A `FileObject` (the logo image). */
  logoFileId: z.guid().optional(),
});
export type AgencyBranding = z.infer<typeof agencyBrandingSchema>;

/** Reads the stored JSON; anything invalid falls back to the defaults rather than breaking a render. */
export function parseBranding(raw: unknown): AgencyBranding {
  const result = agencyBrandingSchema.safeParse(raw ?? {});
  return result.success ? result.data : agencyBrandingSchema.parse({});
}
