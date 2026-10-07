// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { getObjectStore } from '@/server/files/object-store';
import type { JobContext } from '@/worker/registry';
import { createChromiumRenderer, type PdfRenderer } from './renderer';
import { renderDocument, type RenderDeps } from './service';

const dataSchema = z.object({ kind: z.enum(['jd', 'resume', 'report']), versionId: z.guid() });

/** Enqueue payload for `documents:render`. */
export type RenderJobData = z.infer<typeof dataSchema>;

function configuredStore() {
  try {
    return getObjectStore();
  } catch {
    return null; // S3 not configured: the PDF is kept in the database (development)
  }
}

/**
 * Worker job `documents:render` (T-1-11): prints one approved version to PDF. Needs the agency of
 * the job and `AUTH_SECRET` (for the print token). A failed render is retried by the queue.
 */
export async function runRenderJob(
  ctx: JobContext,
  overrides: {
    renderer?: PdfRenderer;
    store?: RenderDeps['store'];
    baseUrl?: string;
    secret?: string;
  } = {},
): Promise<void> {
  const data = dataSchema.parse(ctx.data);
  if (!ctx.agencyId) throw new Error('documents:render needs an agency');
  const env = getEnv();
  const secret = overrides.secret ?? env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is required to render documents');
  const result = await renderDocument(
    {
      withAgency: ctx.withAgency,
      renderer: overrides.renderer ?? createChromiumRenderer({ executablePath: env.CHROMIUM_PATH }),
      store: overrides.store === undefined ? configuredStore() : overrides.store,
      baseUrl: overrides.baseUrl ?? env.RENDER_BASE_URL ?? env.APP_URL,
      secret,
    },
    {
      agencyId: ctx.agencyId,
      requestedById: ctx.requestedById,
      kind: data.kind,
      versionId: data.versionId,
    },
  );
  await ctx.progress({ fileId: result.fileId, reused: result.reused });
}
