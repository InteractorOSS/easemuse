// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { extractText as pdfExtractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import { ApiError } from '@/lib/http/errors';
import { detectFileType, type FileType } from './detect';
import { MAX_PDF_PAGES, MAX_UPLOAD_BYTES } from './limits';
import { assessTextQuality, type DocumentKind, type TextQuality } from './quality';

export type ExtractionMethod = 'pdf_text' | 'docx' | 'text' | 'pdf_model';

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  fileType: FileType;
  quality: TextQuality;
  /** True when the text came from the model reading page images: review it more closely (ADR-010). */
  parsedFromImage: boolean;
  /** Model usage when the fallback ran, so the caller can record it in the LlmCall ledger. */
  usage?: { inputTokens: number; outputTokens: number; model: string };
}

/** Reads a PDF with a vision-capable model. Injected so tests and the AI gateway can supply it. */
export type PdfReader = (pdf: Uint8Array) => Promise<{
  text: string;
  usage: { inputTokens: number; outputTokens: number; model: string };
}>;

export interface ExtractDeps {
  /** Used when the text layer is missing or unreliable. Without one such a PDF is rejected. */
  pdfReader?: PdfReader;
}

export interface ExtractInput {
  bytes: Uint8Array;
  filename: string;
  kind: DocumentKind;
}

const unreadable = (message: string) =>
  new ApiError('unreadable_document', message, { status: 422 });

async function readPdfTextLayer(bytes: Uint8Array): Promise<string> {
  // pdf.js transfers the buffer it is given; hand it a copy so the caller's bytes stay intact.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > MAX_PDF_PAGES) throw unreadable(`PDF has more than ${MAX_PDF_PAGES} pages`);
  const { text } = await pdfExtractText(pdf, { mergePages: true });
  return text;
}

/**
 * Extracts plain text (ADR-010): PDF text layer, DOCX conversion, or UTF-8 text. When the text is
 * too short, mostly non-text characters or missing word breaks (a scan, or broken font encoding)
 * and a `pdfReader` is available, the PDF is read by the model instead and marked as parsed from
 * an image. Pasted text should skip this and be used as is.
 */
export async function extractDocument(
  input: ExtractInput,
  deps: ExtractDeps = {},
): Promise<ExtractionResult> {
  const { bytes, filename, kind } = input;
  if (bytes.byteLength === 0) throw unreadable('The file is empty');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError('file_too_large', 'Files can be at most 10 MB', { status: 413 });
  }
  const fileType = detectFileType(bytes, filename);
  if (!fileType) {
    throw new ApiError('unsupported_type', 'Upload a PDF, DOCX or plain text file', {
      status: 415,
    });
  }

  if (fileType === 'text') {
    const text = new TextDecoder().decode(bytes);
    return finish(text, 'text', fileType, kind);
  }

  if (fileType === 'docx') {
    let text: string;
    try {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } catch {
      throw unreadable('The DOCX file could not be read');
    }
    return finish(text, 'docx', fileType, kind);
  }

  let layer = '';
  try {
    layer = await readPdfTextLayer(bytes);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // A damaged PDF may still be readable by the model; without one, give up clearly.
    if (!deps.pdfReader) throw unreadable('The PDF file could not be read');
  }
  const quality = assessTextQuality(layer, kind);
  if (quality.ok || !deps.pdfReader) {
    if (!quality.ok) throw unreadable('The PDF has no readable text layer (is it a scan?)');
    return { text: layer.trim(), method: 'pdf_text', fileType, quality, parsedFromImage: false };
  }

  const read = await deps.pdfReader(bytes);
  const modelQuality = assessTextQuality(read.text, kind);
  if (!modelQuality.ok) throw unreadable('No readable text could be extracted from the PDF');
  return {
    text: read.text.trim(),
    method: 'pdf_model',
    fileType,
    quality: modelQuality,
    parsedFromImage: true,
    usage: read.usage,
  };
}

function finish(
  text: string,
  method: ExtractionMethod,
  fileType: FileType,
  kind: DocumentKind,
): ExtractionResult {
  const quality = assessTextQuality(text, kind);
  if (!quality.ok) throw unreadable('The file contains too little readable text');
  return { text: text.trim(), method, fileType, quality, parsedFromImage: false };
}
