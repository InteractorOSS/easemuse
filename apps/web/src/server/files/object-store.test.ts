// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryObjectStore,
  createS3Store,
  generatedKey,
  keyBelongsToAgency,
} from './object-store';

function s3() {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://localhost:9000',
    forcePathStyle: true,
    credentials: { accessKeyId: 'AKIATEST', secretAccessKey: 'secret' },
  });
  return client;
}

describe('object keys', () => {
  it('namespaces generated files by agency', () => {
    expect(generatedKey('agency-1', 'file-1', 'report.pdf')).toBe(
      'easemuse/agency-1/generated/file-1/report.pdf',
    );
  });

  it('accepts only keys inside the agency namespace and refuses traversal', () => {
    expect(keyBelongsToAgency('easemuse/a1/generated/f/x.pdf', 'a1')).toBe(true);
    expect(keyBelongsToAgency('easemuse/a2/generated/f/x.pdf', 'a1')).toBe(false);
    expect(keyBelongsToAgency('easemuse/a1/../a2/x.pdf', 'a1')).toBe(false);
    expect(keyBelongsToAgency('other/a1/x.pdf', 'a1')).toBe(false);
    expect(keyBelongsToAgency('easemuse/a10/x.pdf', 'a1')).toBe(false);
  });
});

describe('S3 store', () => {
  it('puts an object with its content type', async () => {
    const client = s3();
    const send = vi.spyOn(client, 'send').mockImplementation(async () => ({}) as never);
    await createS3Store({ client, bucket: 'b' }).put(
      'k',
      new Uint8Array([1, 2]),
      'application/pdf',
    );
    const command = send.mock.calls[0]![0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'b', Key: 'k', ContentType: 'application/pdf' });
  });

  it('presigns a short-lived download URL that forces an attachment filename', async () => {
    const url = new URL(
      await createS3Store({ client: s3(), bucket: 'b' }).presignGet('easemuse/a/x.pdf', {
        ttlSec: 60,
        filename: 'Jane Doe.pdf',
      }),
    );
    expect(url.pathname).toBe('/b/easemuse/a/x.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.searchParams.get('response-content-disposition')).toContain('Jane%20Doe.pdf');
  });
});

describe('memory store', () => {
  it('stores, presigns and deletes', async () => {
    const store = createMemoryObjectStore();
    await store.put('k', new Uint8Array([1]), 'text/plain');
    expect(await store.presignGet('k', { ttlSec: 5, filename: 'f' })).toContain('memory://k');
    await store.delete('k');
    await expect(store.presignGet('k', { ttlSec: 5, filename: 'f' })).rejects.toThrow();
  });
});
