// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const DEFAULT_BRAND_COLOR = '#1f2937';

/** The colour is used as text and as a rule on white pages, so it has to be readable there (WCAG AA). */
export const MIN_BRAND_CONTRAST = 4.5;

/** Logo limits: small raster images only, so every document and email can draw them. */
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_MAX_PIXELS = 4000;
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

/** Contrast ratio of a `#rrggbb` colour against white (WCAG 2.1 relative luminance). */
export function contrastWithWhite(hex: string): number {
  const channel = (offset: number) => {
    const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05);
}

const brandColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1f2937')
  .refine(
    (value) => contrastWithWhite(value) >= MIN_BRAND_CONTRAST,
    'This colour is too light to read on white',
  );

/** What `Agency.branding` may hold (FR-TEN-04): used on every generated document, portal and email. */
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

/** `PATCH /api/v1/agencies/:id/branding`: a null display name goes back to the agency name. */
export const agencyBrandingPatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
    primaryColor: brandColor.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.primaryColor !== undefined, 'Nothing to change');
export type AgencyBrandingPatch = z.infer<typeof agencyBrandingPatchSchema>;

/** Reads the stored JSON; anything invalid falls back to the defaults rather than breaking a render. */
export function parseBranding(raw: unknown): AgencyBranding {
  const result = agencyBrandingSchema.safeParse(raw ?? {});
  return result.success ? result.data : agencyBrandingSchema.parse({});
}
