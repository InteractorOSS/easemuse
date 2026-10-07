// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from 'node:crypto';
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import { sanitizeFilename, readOriginal } from '@/server/documents/store';
import { generatedKey, keyBelongsToAgency, type ObjectStore } from './object-store';

/** Download links live this long; the route issues a fresh one on every authorized request. */
export const DOWNLOAD_URL_TTL_SEC = 60;

/**
 * Saves a generated file (rendered PDF/DOCX, logo) to object storage and records a `FileObject`
 * with its sha256 (ADR-011). Generated files may be regenerated, but a stored one is never changed
 * in place: a new render is a new file.
 */
export async function saveGeneratedFile(
  tx: ScopedTx,
  store: ObjectStore,
  input: {
    agencyId: string;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
    createdById: string | null;
  },
): Promise<{ id: string; sha256: string; sizeBytes: number }> {
  const id = randomUUID();
  const filename = sanitizeFilename(input.filename);
  const key = generatedKey(input.agencyId, id, filename);
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  // Upload first: if it fails, no FileObject points at a missing object.
  await store.put(key, input.bytes, input.contentType);
  await tx.fileObject.create({
    data: {
      id,
      agencyId: input.agencyId,
      store: 's3',
      externalRef: key,
      filename,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      sha256,
      createdById: input.createdById,
    },
  });
  return { id, sha256, sizeBytes: input.bytes.byteLength };
}

export type Download =
  | { kind: 'bytes'; filename: string; contentType: string; bytes: Buffer }
  | { kind: 'redirect'; url: string };

/**
 * Resolves an authorized download: originals stream from Postgres; generated files redirect to a
 * short-lived signed URL. Another agency's file id is a plain 404 (RLS hides it), and an object
 * key outside the caller's agency namespace is refused even if a row were corrupted.
 */
export async function openFileForDownload(
  tx: ScopedTx,
  store: ObjectStore | null,
  input: { agencyId: string; fileId: string },
): Promise<Download> {
  const file = await tx.fileObject.findUnique({ where: { id: input.fileId } });
  if (!file || file.agencyId !== input.agencyId) throw notFound('File');

  if (file.store === 'db') {
    const { bytes } = await readOriginal(tx, file.id);
    return { kind: 'bytes', filename: file.filename, contentType: file.contentType, bytes };
  }
  if (
    file.store === 's3' &&
    file.externalRef &&
    store &&
    keyBelongsToAgency(file.externalRef, input.agencyId)
  ) {
    const url = await store.presignGet(file.externalRef, {
      ttlSec: DOWNLOAD_URL_TTL_SEC,
      filename: file.filename,
    });
    return { kind: 'redirect', url };
  }
  throw notFound('File');
}
