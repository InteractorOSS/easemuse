// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { ApiError } from '@/lib/http/errors';
import { extractDocument, type PdfReader } from '@/server/documents/extract';
import { readOriginal } from '@/server/documents/store';
import { recordLlmCall } from '@/server/ai/ledger';
import type { JobContext } from '@/worker/registry';

const dataSchema = z.object({ jobDescriptionId: z.guid() });

/**
 * Worker job `documents:jd.extract` (T-1-05): reads the stored original and saves its text. A file
 * that cannot be read is recorded on the original (so the recruiter sees why and can paste the text
 * instead) and is not retried: the same bytes would fail the same way. Anything else is retried.
 */
export async function extractJd(
  ctx: JobContext,
  deps: { pdfReader?: PdfReader | undefined } = {},
): Promise<void> {
  const { jobDescriptionId } = dataSchema.parse(ctx.data);
  const source = await ctx.withAgency(async (tx) => {
    const jd = await tx.jobDescription.findUnique({
      where: { id: jobDescriptionId },
      select: { fileId: true, positionId: true, extractionStatus: true },
    });
    if (!jd?.fileId || jd.extractionStatus !== 'pending') return null; // gone, pasted, or already done
    return { positionId: jd.positionId, ...(await readOriginal(tx, jd.fileId)) };
  });
  if (!source) return;

  try {
    const result = await extractDocument(
      { bytes: source.bytes, filename: source.file.filename, kind: 'jd' },
      { pdfReader: deps.pdfReader },
    );
    await ctx.withAgency(async (tx) => {
      await tx.jobDescription.update({
        where: { id: jobDescriptionId },
        data: {
          text: result.text,
          extractionStatus: 'ready',
          extractionMethod: result.method,
          extractionError: null,
          parsedFromImage: result.parsedFromImage,
        },
      });
      if (result.usage && ctx.agencyId) {
        await recordLlmCall(tx, {
          agencyId: ctx.agencyId,
          aiGenerationId: null,
          requestedById: ctx.requestedById,
          positionId: source.positionId,
          purpose: 'document.parse',
          model: result.usage.model,
          promptVersion: 'pdf-reader-1',
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cachedTokens: 0,
          },
          latencyMs: 0,
        });
      }
    });
    await ctx.progress({ status: 'ready' });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) throw error;
    await ctx.withAgency((tx) =>
      tx.jobDescription.update({
        where: { id: jobDescriptionId },
        data: { extractionStatus: 'failed', extractionError: error.message },
      }),
    );
    await ctx.progress({ status: 'failed' });
  }
}
