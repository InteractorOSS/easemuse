// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { LogoContentType } from '@easemuse/core';

export interface ImageInfo {
  contentType: LogoContentType;
  width: number;
  height: number;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Reads the type and size of a PNG or JPEG from its BYTES (never from the declared type or the file
 * name, both client-controlled). Returns null for anything else, including SVG, which can carry
 * scripts and cannot be drawn into a DOCX.
 */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length > 24 && PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // The first chunk of a PNG is IHDR: width and height are its first two 32-bit fields.
    if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
    return { contentType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1]!;
      if (marker === 0xff) {
        offset += 1; // fill byte
        continue;
      }
      // Start-of-frame markers (not DHT 0xC4, JPG 0xC8, DAC 0xCC) carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          contentType: 'image/jpeg',
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return null;
}
