// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Anthropic from '@anthropic-ai/sdk';
import type { PdfReader } from '@/server/documents/extract';

/** Sonnet 5.5 for high-volume extraction (ADR-005). */
export const PDF_READER_MODEL = 'claude-sonnet-5-5';

const PROMPT =
  'Transcribe all the text in this document exactly as written, in reading order. ' +
  'Preserve headings, bullet points, dates, numbers and names. Output only the document text: ' +
  'no commentary, no summary, and never add or correct anything.';

/** The slice of the Anthropic client this reader needs; lets tests inject a fake. */
export interface MessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/**
 * PDF-to-text fallback for scans (ADR-010): sends the PDF to Claude as a document block. Anthropic
 * is already a sub-processor for AI features, so no new data recipient is added. Retried by the
 * queue, not here.
 */
export function createClaudePdfReader(options: {
  apiKey?: string;
  client?: MessagesClient;
  model?: string;
}): PdfReader {
  const client: MessagesClient =
    options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 2 });
  const model = options.model ?? PDF_READER_MODEL;

  return async (pdf) => {
    const response = await client.messages.create({
      model,
      max_tokens: 16_000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: Buffer.from(pdf).toString('base64'),
              },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal')
      throw new Error('The model declined to read this document');
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n');
    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model,
      },
    };
  };
}
