// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { CONTENT_TYPES, detectFileType } from './detect';
import { MAX_UPLOAD_BYTES } from './limits';

export interface StoredFile {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  /** True when an identical file (same bytes) already existed in this agency: nothing new was stored. */
  duplicate: boolean;
}

/**
 * Stores an original upload in the agency's own database (ADR-010): a `FileObject` row plus the
 * bytes in `FileBlob`, both under RLS. Originals are immutable and never overwritten (FR-PLT-05);
 * the same bytes uploaded again return the existing file instead of a second copy.
 */
export async function storeOriginal(
  tx: ScopedTx,
  input: { agencyId: string; filename: string; bytes: Uint8Array; createdById: string | null },
): Promise<StoredFile> {
  const { agencyId, bytes } = input;
  if (bytes.byteLength === 0)
    throw new ApiError('unreadable_document', 'The file is empty', { status: 422 });
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError('file_too_large', 'Files can be at most 10 MB', { status: 413 });
  }
  const type = detectFileType(bytes, input.filename);
  if (!type)
    throw new ApiError('unsupported_type', 'Upload a PDF, DOCX or plain text file', {
      status: 415,
    });

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const existing = await tx.fileObject.findFirst({ where: { agencyId, sha256, store: 'db' } });
  if (existing) {
    return {
      id: existing.id,
      filename: existing.filename,
      contentType: existing.contentType,
      sizeBytes: existing.sizeBytes,
      sha256,
      duplicate: true,
    };
  }

  const file = await tx.fileObject.create({
    data: {
      agencyId,
      store: 'db',
      filename: sanitizeFilename(input.filename),
      contentType: CONTENT_TYPES[type],
      sizeBytes: bytes.byteLength,
      sha256,
      createdById: input.createdById,
    },
  });
  await tx.fileBlob.create({ data: { agencyId, fileId: file.id, bytes: Buffer.from(bytes) } });
  return {
    id: file.id,
    filename: file.filename,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    sha256,
    duplicate: false,
  };
}

/** Reads the bytes of a stored original. Another agency's file is simply not found (RLS). */
export async function readOriginal(
  tx: ScopedTx,
  fileId: string,
): Promise<{
  file: { id: string; filename: string; contentType: string; sizeBytes: number };
  bytes: Buffer;
}> {
  const file = await tx.fileObject.findUnique({ where: { id: fileId } });
  if (!file || file.store !== 'db') throw notFound('File');
  const blob = await tx.fileBlob.findUnique({ where: { fileId } });
  if (!blob) throw notFound('File');
  return {
    file: {
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
    },
    bytes: Buffer.from(blob.bytes),
  };
}

/** Keeps only the base name and safe characters; the name is shown to users and used in downloads. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[^\p{L}\p{N}._ ()-]/gu, '_')
    .replace(/^\.+/, '')
    .trim();
  return (cleaned || 'file').slice(0, 200);
}
