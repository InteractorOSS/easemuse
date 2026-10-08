// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** `POST /clients`. */
export const clientInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /** A short description of the company; outreach may use it, so keep to facts. */
  description: optionalText(600),
});
export type ClientInput = z.infer<typeof clientInputSchema>;

/** `PATCH /clients/:id`: rename, or archive/restore (archived clients stay on their positions). */
export const clientPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: optionalText(600),
    archived: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type ClientPatch = z.infer<typeof clientPatchSchema>;

/** `GET /clients` query filters, on top of the page query. */
export const clientListFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[0-9+()\-.\s]*$/, 'Use digits, spaces and + ( ) - . only');

/** `POST /clients/:id/contacts`. */
export const contactInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  title: optionalText(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(254))
    .or(z.literal('').transform(() => null))
    .nullable()
    .optional(),
  phone: phoneSchema
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

/** `PATCH /clients/:id/contacts/:contactId`: any subset of the contact fields. */
export const contactPatchSchema = contactInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type ContactPatch = z.infer<typeof contactPatchSchema>;
