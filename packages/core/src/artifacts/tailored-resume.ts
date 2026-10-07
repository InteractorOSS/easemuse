// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);

/**
 * What the model writes (brief 9.1): emphasis and wording only. Employers, titles, dates and
 * education are not in the output at all; code copies them from the confirmed profile, so the model
 * cannot change a fact about the candidate's career.
 */
export const tailoredResumeModelOutputSchema = z.object({
  summary: text(800),
  roles: z
    .array(
      z.object({
        /** 1-based number of the role in the profile, as listed in the prompt. */
        index: z.number().int().min(1).max(40),
        bullets: z.array(text(320).min(1)).max(8),
      }),
    )
    .max(40),
  /** Skills worth showing first; only skills already in the profile survive. */
  skills: z.array(text(80).min(1)).max(30),
});
export type TailoredResumeModelOutput = z.infer<typeof tailoredResumeModelOutputSchema>;

const role = z.object({
  company: text(160),
  title: text(160),
  start: text(40).nullable().default(null),
  end: text(40).nullable().default(null),
  current: z.boolean().default(false),
  /** The wording in the confirmed profile, shown next to the tailored text. Not edited. */
  original: text(1500).default(''),
  bullets: z.array(text(400)).max(12).default([]),
});

/** The tailored resume (FR-RES-01, FR-RES-02). The original resume is stored separately and never changed. */
export const tailoredResumeContentSchema = z.object({
  /** A blind resume leaves out the name and contact details (header is empty). */
  blind: z.boolean().default(false),
  header: z
    .object({
      name: text(160).nullable().default(null),
      email: text(254).nullable().default(null),
      phone: text(40).nullable().default(null),
      location: text(160).nullable().default(null),
    })
    .default({ name: null, email: null, phone: null, location: null }),
  headline: text(200).default(''),
  summary: text(1200).default(''),
  roles: z.array(role).max(40).default([]),
  education: z
    .array(
      z.object({
        school: text(160),
        degree: text(160),
        year: text(20).nullable().default(null),
      }),
    )
    .max(15)
    .default([]),
  skills: z.array(text(80)).max(40).default([]),
});
export type TailoredResumeContent = z.infer<typeof tailoredResumeContentSchema>;

/** The resume as plain text: what the fact check reads, and what a plain-text export would show. */
export function tailoredResumeText(c: TailoredResumeContent): string {
  const range = (r: TailoredResumeContent['roles'][number]) =>
    `${r.start ?? '?'} to ${r.current ? 'present' : (r.end ?? '?')}`;
  return [
    c.headline,
    c.summary,
    ...c.roles.flatMap((r) => [`${r.title}, ${r.company}, ${range(r)}`, ...r.bullets]),
    ...c.education.map((e) => `${e.degree}, ${e.school}${e.year ? `, ${e.year}` : ''}`),
    c.skills.length ? `Skills: ${c.skills.join(', ')}` : '',
  ]
    .filter((l) => l.trim() !== '')
    .join('\n');
}

/** `POST /pipeline/:id/tailored-resume` */
export const tailorInputSchema = z.object({ blind: z.boolean().default(false) });
export type TailorInput = z.infer<typeof tailorInputSchema>;
