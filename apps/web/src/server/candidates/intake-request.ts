// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  candidateIntakeSchema,
  candidateIntakeTextSchema,
  type CandidateIntake,
  type CandidateSourceValue,
} from '@easemuse/core';
import { ApiError } from '@/lib/http/errors';
import { zodFields } from '@/lib/http/responses';
import type { IntakeFile } from './intake';

/**
 * Reads an intake request: multipart (`file`, `source`, optional `profileUrl`) or JSON (`profileText`,
 * `source`, optional `profileUrl`). `forcedSource` replaces whatever the caller sent, for entry points
 * that know where the profile came from (the profile link is only stored, never fetched).
 */
export async function parseIntakeRequest(
  req: Request,
  forcedSource?: CandidateSourceValue,
): Promise<{ intake: CandidateIntake; file: IntakeFile }> {
  const invalid = (error: Parameters<typeof zodFields>[0]) =>
    new ApiError('invalid_input', 'Invalid input', { fields: zodFields(error) });

  if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const upload = form?.get('file');
    if (!(upload instanceof File)) {
      throw new ApiError('invalid_input', 'Attach a file', { fields: { file: 'Attach a file' } });
    }
    const parsed = candidateIntakeSchema.safeParse({
      source: forcedSource ?? form?.get('source') ?? undefined,
      profileUrl: form?.get('profileUrl')?.toString() || undefined,
    });
    if (!parsed.success) throw invalid(parsed.error);
    return {
      intake: parsed.data,
      file: {
        filename: upload.name,
        bytes: new Uint8Array(await upload.arrayBuffer()),
        kind: 'resume',
      },
    };
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = candidateIntakeTextSchema.safeParse(
    forcedSource && body && typeof body === 'object' ? { ...body, source: forcedSource } : body,
  );
  if (!parsed.success) throw invalid(parsed.error);
  return {
    intake: parsed.data,
    file: {
      filename: 'profile.txt',
      bytes: new TextEncoder().encode(parsed.data.profileText),
      kind: 'profile_text',
    },
  };
}
