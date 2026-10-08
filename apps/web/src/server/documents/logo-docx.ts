// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { AlignmentType, ImageRun, Paragraph } from 'docx';
import { readImageInfo } from '@/server/branding/image';

export interface DocxLogo {
  bytes: Uint8Array;
  /** Shown to screen readers; the agency's display name. */
  name: string;
}

const MAX_HEIGHT = 48;
const MAX_WIDTH = 160;

/** The agency logo as the first line of a Word file, right aligned, at most 160 x 48 px (FR-TEN-04). */
export function logoParagraph(logo: DocxLogo | null | undefined): Paragraph[] {
  const info = logo ? readImageInfo(logo.bytes) : null;
  if (!logo || !info) return [];
  const scale = Math.min(1, MAX_HEIGHT / info.height, MAX_WIDTH / info.width);
  return [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new ImageRun({
          type: info.contentType === 'image/png' ? 'png' : 'jpg',
          data: logo.bytes,
          transformation: {
            width: Math.max(1, Math.round(info.width * scale)),
            height: Math.max(1, Math.round(info.height * scale)),
          },
          altText: { name: logo.name, title: logo.name, description: logo.name },
        }),
      ],
    }),
  ];
}
