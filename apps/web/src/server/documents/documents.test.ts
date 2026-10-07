// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { makeDocx, makePdf, RESUME_LINES } from '@/test/fixtures';
import { createClaudePdfReader, PDF_READER_MODEL, type MessagesClient } from './claude-pdf-reader';
import { detectFileType } from './detect';
import { extractDocument, type PdfReader } from './extract';
import { MAX_UPLOAD_BYTES } from './limits';
import { assessTextQuality } from './quality';
import { sanitizeFilename } from './store';

const utf8 = (s: string) => new TextEncoder().encode(s);
const RESUME_TEXT = RESUME_LINES.join('\n');

describe('detectFileType', () => {
  it('detects by content, not by name', async () => {
    expect(detectFileType(makePdf(['x']), 'whatever.txt')).toBe('pdf');
    expect(detectFileType(await makeDocx(['x']), 'cv.docx')).toBe('docx');
    expect(detectFileType(utf8('plain text'), 'cv.txt')).toBe('text');
    expect(detectFileType(utf8('한국어 이력서'), 'cv.txt')).toBe('text');
  });

  it('rejects zips that are not .docx, legacy .doc and binary data', async () => {
    expect(detectFileType(await makeDocx(['x']), 'archive.zip')).toBeNull();
    expect(detectFileType(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2]), 'cv.doc')).toBeNull();
    expect(detectFileType(Uint8Array.from([0, 1, 2, 3, 255]), 'x.bin')).toBeNull();
    expect(detectFileType(Uint8Array.from([0xff, 0xfe, 0xfd]), 'x.txt')).toBeNull();
  });
});

describe('assessTextQuality', () => {
  it('accepts a normal resume', () => {
    expect(assessTextQuality(RESUME_TEXT, 'resume')).toMatchObject({ ok: true, issues: [] });
  });

  it('accepts Korean text (letters in any script count)', () => {
    const ko =
      '김민수 시니어 소프트웨어 엔지니어. 결제 인프라 팀을 이끌었고 지연 시간을 크게 줄였습니다. '.repeat(
        5,
      );
    expect(assessTextQuality(ko, 'resume').ok).toBe(true);
  });

  it('flags short, symbol-heavy and glued-together text', () => {
    expect(assessTextQuality('Jane Doe', 'resume').issues).toContain('too_short');
    expect(assessTextQuality('\uFFFD\u0001■□▯'.repeat(80), 'resume').issues).toContain(
      'high_non_text',
    );
    expect(assessTextQuality('a'.repeat(400), 'jd').issues).toContain('no_word_breaks');
    expect(assessTextQuality('', 'jd')).toMatchObject({ ok: false, chars: 0 });
  });
});

describe('extractDocument', () => {
  it('reads a PDF text layer', async () => {
    const result = await extractDocument({
      bytes: makePdf(RESUME_LINES),
      filename: 'cv.pdf',
      kind: 'resume',
    });
    expect(result).toMatchObject({ method: 'pdf_text', fileType: 'pdf', parsedFromImage: false });
    expect(result.text).toContain('Staff Engineer at Acme Corp');
    expect(result.text).toContain('240 ms');
  });

  it('does not consume the caller bytes (pdf.js transfers its buffer)', async () => {
    const bytes = makePdf(RESUME_LINES);
    const before = bytes.byteLength;
    await extractDocument({ bytes, filename: 'cv.pdf', kind: 'resume' });
    expect(bytes.byteLength).toBe(before);
  });

  it('converts a DOCX', async () => {
    const result = await extractDocument({
      bytes: await makeDocx(RESUME_LINES),
      filename: 'cv.docx',
      kind: 'resume',
    });
    expect(result).toMatchObject({ method: 'docx', fileType: 'docx' });
    expect(result.text).toContain('Globex');
  });

  it('uses plain text as is', async () => {
    const result = await extractDocument({
      bytes: utf8(RESUME_TEXT),
      filename: 'cv.txt',
      kind: 'resume',
    });
    expect(result).toMatchObject({ method: 'text', parsedFromImage: false });
  });

  describe('scans and low-quality text layers', () => {
    const scan = makePdf([]); // a page with no text at all
    const reader: PdfReader = vi.fn(async () => ({
      text: RESUME_TEXT,
      usage: { inputTokens: 1200, outputTokens: 400, model: 'claude-sonnet-5-5' },
    }));

    it('rejects a scan with a clear 422 when no model fallback is available', async () => {
      await expect(
        extractDocument({ bytes: scan, filename: 'scan.pdf', kind: 'resume' }),
      ).rejects.toMatchObject({
        status: 422,
        code: 'unreadable_document',
      });
    });

    it('falls back to the model, marks the text as parsed from an image and reports usage', async () => {
      const result = await extractDocument(
        { bytes: scan, filename: 'scan.pdf', kind: 'resume' },
        { pdfReader: reader },
      );
      expect(result).toMatchObject({
        method: 'pdf_model',
        parsedFromImage: true,
        usage: { inputTokens: 1200, outputTokens: 400 },
      });
      expect(result.text).toContain('Acme Corp');
    });

    it('does not call the model when the text layer is good', async () => {
      const spy: PdfReader = vi.fn(async () => ({
        text: RESUME_TEXT,
        usage: { inputTokens: 1, outputTokens: 1, model: 'm' },
      }));
      await extractDocument(
        { bytes: makePdf(RESUME_LINES), filename: 'cv.pdf', kind: 'resume' },
        { pdfReader: spy },
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it('still rejects when the model returns nothing usable', async () => {
      const junk: PdfReader = async () => ({
        text: '  ',
        usage: { inputTokens: 1, outputTokens: 1, model: 'm' },
      });
      await expect(
        extractDocument({ bytes: scan, filename: 'scan.pdf', kind: 'resume' }, { pdfReader: junk }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('sends a damaged PDF to the model when one is available', async () => {
      const damaged = utf8('%PDF-1.4 this is not really a pdf');
      const result = await extractDocument(
        { bytes: damaged, filename: 'x.pdf', kind: 'resume' },
        { pdfReader: reader },
      );
      expect(result.method).toBe('pdf_model');
      await expect(
        extractDocument({ bytes: damaged, filename: 'x.pdf', kind: 'resume' }),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  it('enforces size, type and emptiness', async () => {
    await expect(
      extractDocument({ bytes: new Uint8Array(0), filename: 'a.pdf', kind: 'jd' }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      extractDocument({
        bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1),
        filename: 'a.pdf',
        kind: 'jd',
      }),
    ).rejects.toMatchObject({ status: 413, code: 'file_too_large' });
    await expect(
      extractDocument({ bytes: Uint8Array.from([0, 1, 2]), filename: 'a.bin', kind: 'jd' }),
    ).rejects.toMatchObject({
      status: 415,
      code: 'unsupported_type',
    });
  });

  it('rejects a DOCX that is really not one, and too-short text', async () => {
    const fakeDocx = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    await expect(
      extractDocument({ bytes: fakeDocx, filename: 'x.docx', kind: 'resume' }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      extractDocument({ bytes: utf8('hi'), filename: 'x.txt', kind: 'resume' }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('createClaudePdfReader', () => {
  function fakeClient(response: unknown) {
    const create = vi.fn(async () => response);
    return { client: { messages: { create } } as unknown as MessagesClient, create };
  }

  it('sends the PDF as a document block to Sonnet and returns text and usage', async () => {
    const { client, create } = fakeClient({
      stop_reason: 'end_turn',
      content: [
        { type: 'text', text: 'line one' },
        { type: 'text', text: 'line two' },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const result = await createClaudePdfReader({ client })(makePdf(['x']));
    expect(result).toEqual({
      text: 'line one\nline two',
      usage: { inputTokens: 10, outputTokens: 5, model: PDF_READER_MODEL },
    });
    const params = (
      create.mock.calls[0] as unknown as [
        {
          model: string;
          messages: {
            content: { type: string; source?: { media_type: string; data: string } }[];
          }[];
        },
      ]
    )[0];
    expect(params.model).toBe('claude-sonnet-5-5');
    const doc = params.messages[0]!.content[0]!;
    expect(doc.type).toBe('document');
    expect(doc.source?.media_type).toBe('application/pdf');
    expect(Buffer.from(doc.source!.data, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('surfaces a refusal as an error rather than empty text', async () => {
    const { client } = fakeClient({
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    });
    await expect(createClaudePdfReader({ client })(makePdf(['x']))).rejects.toThrow(/declined/);
  });
});

describe('sanitizeFilename', () => {
  it('keeps the base name and safe characters only', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\a\\Jane Doe (final).pdf')).toBe('Jane Doe (final).pdf');
    expect(sanitizeFilename('이력서.pdf')).toBe('이력서.pdf');
    expect(sanitizeFilename('..hidden<script>.pdf')).toBe('hidden_script_.pdf');
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('a'.repeat(500)).length).toBe(200);
  });
});
