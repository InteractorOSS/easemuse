// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

export type FileType = 'pdf' | 'docx' | 'text';

export const CONTENT_TYPES: Record<FileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  text: 'text/plain',
};

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (DOCX is a zip)
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .doc

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

/**
 * Decides the file type from the BYTES, never from the declared MIME type or the extension alone
 * (both are client-controlled). Returns null for anything we cannot read, including legacy .doc.
 */
export function detectFileType(bytes: Uint8Array, filename: string): FileType | null {
  if (startsWith(bytes, PDF_MAGIC)) return 'pdf';
  if (startsWith(bytes, ZIP_MAGIC)) return /\.docx$/i.test(filename) ? 'docx' : null;
  if (startsWith(bytes, OLE_MAGIC)) return null;
  // Plain text: no NUL bytes in the first KB and valid UTF-8.
  const head = bytes.subarray(0, 1024);
  if (head.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'text';
  } catch {
    return null;
  }
}
