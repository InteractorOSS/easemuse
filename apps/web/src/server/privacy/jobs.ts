// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import { dataRightsScope } from '@/lib/db';
import { getObjectStore, type ObjectStore } from '@/server/files/object-store';
import type { JobContext } from '@/worker/registry';
import { anonymizeCandidate, deleteObjects, s3KeysOf } from './anonymize';
import { buildCandidateZip, collectCandidateData, fileSourceFor, storeExportZip } from './export';
import { collectCandidateScope } from './scope';
import { finishPrivacyRequest } from './service';

const dataSchema = z.object({ requestId: z.guid() });

function configuredStore(): ObjectStore | null {
  try {
    return getObjectStore();
  } catch {
    return null; // S3 not configured: generated files are kept in the database (development)
  }
}

async function loadRequest(ctx: JobContext, kind: 'export' | 'delete') {
  const { requestId } = dataSchema.parse(ctx.data);
  const request = await ctx.withAgency((tx) =>
    tx.privacyRequest.findUnique({ where: { id: requestId } }),
  );
  if (!request) throw new UnrecoverableError('privacy_request_not_found');
  if (request.kind !== kind) throw new UnrecoverableError('privacy_request_kind_mismatch');
  return request;
}

/**
 * Worker job `documents:privacy.export` (T-0-04): builds the candidate's ZIP (JSON and files), stores
 * it for the admin and closes the request. Read-only on tenant data.
 */
export async function runExportJob(
  ctx: JobContext,
  overrides: { store?: ObjectStore | null; now?: Date } = {},
): Promise<void> {
  const request = await loadRequest(ctx, 'export');
  if (request.status === 'completed') return;
  if (!ctx.agencyId) throw new UnrecoverableError('A privacy job needs an agency');
  const agencyId = ctx.agencyId;
  const now = overrides.now ?? new Date();
  const store = overrides.store === undefined ? configuredStore() : overrides.store;
  const zip = await ctx.withAgency(async (tx) =>
    buildCandidateZip(
      await collectCandidateData(tx, request.candidateId),
      fileSourceFor(tx, store),
      now,
    ),
  );
  await ctx.withAgency(async (tx) => {
    const file = await storeExportZip(tx, {
      agencyId,
      bytes: zip,
      createdById: ctx.requestedById,
      now,
    });
    await finishPrivacyRequest(tx, request.id, { fileId: file.id }, now);
  });
  await ctx.progress({ bytes: zip.byteLength });
}

/**
 * Worker job `documents:privacy.anonymize` (T-0-05): removes the candidate's personal data as the
 * data-rights role, then closes the request. Safe to run again after a failure.
 */
export async function runAnonymizeJob(
  ctx: JobContext,
  overrides: { store?: ObjectStore | null; now?: Date; scope?: typeof dataRightsScope } = {},
): Promise<void> {
  const request = await loadRequest(ctx, 'delete');
  if (request.status === 'completed') return;
  if (!ctx.agencyId) throw new UnrecoverableError('A privacy job needs an agency');
  const agencyId = ctx.agencyId;
  const scope = overrides.scope ?? dataRightsScope;
  const now = overrides.now ?? new Date();
  const store = overrides.store === undefined ? configuredStore() : overrides.store;

  // Objects first: if the database step then fails, the retry deletes the rows that point at them.
  const keys = await scope.withAgency(agencyId, async (tx) =>
    s3KeysOf(tx, (await collectCandidateScope(tx, request.candidateId)).fileIds),
  );
  const failed = await deleteObjects(store, keys);
  const result = await scope.withAgency(agencyId, (tx) =>
    anonymizeCandidate(tx, request.candidateId, now),
  );
  await ctx.withAgency((tx) => finishPrivacyRequest(tx, request.id, {}, now));
  await ctx.progress({ ...result, objectsNotRemoved: failed.length });
}
