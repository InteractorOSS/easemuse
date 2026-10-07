// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '@/lib/env';

/** S3-compatible object storage for GENERATED files only (PDF/DOCX, logos; ADR-011). Originals stay in Postgres. */
export interface ObjectStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** A short-lived URL that downloads the object as `filename`. */
  presignGet(key: string, options: { ttlSec: number; filename: string }): Promise<string>;
  delete(key: string): Promise<void>;
}

/** Keys are namespaced by agency so a key can be checked against the caller's agency. */
export function generatedKey(agencyId: string, fileId: string, filename: string): string {
  return `easemuse/${agencyId}/generated/${fileId}/${filename}`;
}

export function keyBelongsToAgency(key: string, agencyId: string): boolean {
  return key.startsWith(`easemuse/${agencyId}/`) && !key.includes('..');
}

export function createS3Store(options: { client: S3Client; bucket: string }): ObjectStore {
  const { client, bucket } = options;
  return {
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          ServerSideEncryption: undefined,
        }),
      );
    },
    presignGet(key, { ttlSec, filename }) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        }),
        { expiresIn: ttlSec },
      );
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/** In-memory store for tests and local development without S3. */
export function createMemoryObjectStore(): ObjectStore & {
  objects: Map<string, { bytes: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, bytes, contentType) {
      objects.set(key, { bytes, contentType });
    },
    async presignGet(key, { ttlSec }) {
      if (!objects.has(key)) throw new Error(`No such object: ${key}`);
      return `memory://${key}?expires=${ttlSec}`;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

let processStore: ObjectStore | undefined;

/** The configured S3 store; throws a clear error when S3 is not configured. */
export function getObjectStore(): ObjectStore {
  if (!processStore) {
    const env = getEnv();
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error(
        'Object storage is not configured (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)',
      );
    }
    processStore = createS3Store({
      bucket: env.S3_BUCKET,
      client: new S3Client({
        region: env.S3_REGION ?? 'us-east-1',
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      }),
    });
  }
  return processStore;
}
