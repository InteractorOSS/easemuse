// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { ApiError } from '@/lib/http/errors';
import { recordLlmCall } from '@/server/ai/ledger';
import { extractDocument, type PdfReader } from '@/server/documents/extract';
import { readOriginal } from '@/server/documents/store';
import type { JobContext } from '@/worker/registry';

const dataSchema = z.object({ documentId: z.guid() });

/**
 * Worker job `documents:candidate.extract` (T-2-02): reads the stored resume or profile and saves its
 * text on the document. A file that cannot be read is recorded with the reason and not retried; the
 * recruiter can paste the text instead. Any other failure is retried by the queue.
 */
export async function extractCandidateDocument(
  ctx: JobContext,
  deps: { pdfReader?: PdfReader | undefined } = {},
): Promise<void> {
  const { documentId } = dataSchema.parse(ctx.data);
  const source = await ctx.withAgency(async (tx) => {
    const doc = await tx.candidateDocument.findUnique({
      where: { id: documentId },
      select: { fileId: true, candidateId: true, extractionStatus: true },
    });
    if (!doc || doc.extractionStatus !== 'pending') return null; // gone or already done
    return { candidateId: doc.candidateId, ...(await readOriginal(tx, doc.fileId)) };
  });
  if (!source) return;

  try {
    const result = await extractDocument(
      { bytes: source.bytes, filename: source.file.filename, kind: 'resume' },
      { pdfReader: deps.pdfReader },
    );
    await ctx.withAgency(async (tx) => {
      await tx.candidateDocument.update({
        where: { id: documentId },
        data: {
          extractedText: result.text,
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
          positionId: null,
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
    await ctx.progress({ status: 'ready', candidateId: source.candidateId });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) throw error;
    await ctx.withAgency((tx) =>
      tx.candidateDocument.update({
        where: { id: documentId },
        data: { extractionStatus: 'failed', extractionError: error.message },
      }),
    );
    await ctx.progress({ status: 'failed', candidateId: source.candidateId });
  }
}
