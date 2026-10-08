// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { listActiveAgencyIds, withAgency } from '@/lib/db';
import { enqueue } from '@/lib/queue';
import { getGateway } from '@/server/ai';
import { createVoyageClient } from '@/server/ai/voyage';
import { embedJob, runEmbeddingCatchUp } from '@/server/embeddings/indexing';
import { queueEmbedding } from '@/server/embeddings/trigger';
import { extractCandidateDocument } from '@/server/candidates/extract';
import { structureCandidateJob } from '@/server/candidates/structure';
import { runBatchJob } from '@/server/matching/batch';
import { runRenderJob } from '@/server/documents/render/job';
import { createClaudePdfReader } from '@/server/ai/pdf-reader';
import { extractJd } from '@/server/positions/jd-extract';
import { runOrphanReport } from '@/server/artifacts/orphans';
import { runAnonymizeJob, runExportJob } from '@/server/privacy/jobs';
import { resolveAnthropicKey } from '@/server/platform/secrets';
import { sendOutboxMessage } from '@/server/messaging/send';
import type { JobRegistry } from '../registry';

/** Modules add their job handlers here as they land (AI gateway, document parsing, messaging...). */
export function registerHandlers(registry: JobRegistry): JobRegistry {
  // Smoke-test job: proves a worker is alive and wired to the queue (no data, no agency needed).
  registry.register('maintenance', 'health.ping', async (ctx) => {
    await ctx.progress({ pong: true });
  });
  registry.register('messaging', 'send', (ctx) => sendOutboxMessage(ctx));
  // Reads an uploaded original JD. Scans fall back to the model only when an API key is configured.
  registry.register('documents', 'jd.extract', async (ctx) => {
    const apiKey = await resolveAnthropicKey();
    return extractJd(ctx, { pdfReader: apiKey ? createClaudePdfReader({ apiKey }) : undefined });
  });
  // Reads an uploaded resume or profile (same scan fallback as the JD).
  registry.register('documents', 'candidate.extract', async (ctx) => {
    const apiKey = await resolveAnthropicKey();
    return extractCandidateDocument(ctx, {
      pdfReader: apiKey ? createClaudePdfReader({ apiKey }) : undefined,
      // Uploading a resume is the recruiter's request for a structured profile (FR-AI-01).
      afterRead: async ({ candidateId, documentId }) => {
        await enqueue({
          queue: 'ai',
          name: 'profile.structure',
          agencyId: ctx.agencyId,
          requestedById: ctx.requestedById,
          data: { candidateId },
          idempotencyKey: `profile.structure:${documentId}`,
        });
      },
    });
  });
  // AI profile structuring for a candidate draft (A7).
  registry.register('ai', 'profile.structure', (ctx) =>
    structureCandidateJob(ctx, getGateway().run),
  );
  // Match analysis for several candidates of one position (A10).
  registry.register('ai', 'match.batch', async (ctx) => {
    await runBatchJob(ctx, getGateway().run);
  });
  // Prints an approved version to PDF with headless Chromium (ADR-011).
  registry.register('documents', 'render', (ctx) => runRenderJob(ctx));
  // Candidate data rights (ADR-016): the export builds a ZIP; the deletion runs as the data-rights role.
  registry.register('documents', 'privacy.export', (ctx) => runExportJob(ctx));
  registry.register('documents', 'privacy.anonymize', (ctx) => runAnonymizeJob(ctx));
  // Nightly (see scheduler.ts): artifacts whose subject no longer exists (ADR-006).
  registry.register('maintenance', 'artifacts.orphan_report', async (ctx) => {
    const summary = await runOrphanReport({
      agencyIds: listActiveAgencyIds,
      withAgency,
      log: (message, data) => console.warn(JSON.stringify({ message, ...data })),
    });
    await ctx.progress({ ...summary });
  });
  // Indexing after an approval (ADR-008): the one job that runs without a person asking.
  registry.register('indexing', 'embed', (ctx) => embedJob(ctx, createVoyageClient()));
  // Nightly: profiles approved while Voyage, the key or the budget was unavailable.
  registry.register('maintenance', 'embeddings.catch_up', async (ctx) => {
    const summary = await runEmbeddingCatchUp({
      agencyIds: listActiveAgencyIds,
      withAgency,
      schedule: queueEmbedding,
    });
    await ctx.progress({ ...summary });
  });
  return registry;
}
