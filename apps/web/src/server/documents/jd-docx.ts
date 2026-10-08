// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { AgencyBranding } from '@easemuse/core';
import type { JdDocumentModel } from './jd-document';
import { logoParagraph, type DocxLogo } from './logo-docx';

/**
 * The improved JD as an editable DOCX (T-1-12, ADR-011): the same content as the PDF, with the
 * agency name and colour on the headings. Recruiters may tweak this file before sending it.
 */
export async function buildJdDocx(input: {
  title: string;
  subtitle: string | null;
  agencyName: string | null;
  branding: AgencyBranding;
  logo?: DocxLogo | null;
  model: JdDocumentModel;
}): Promise<Buffer> {
  const color = input.branding.primaryColor.replace('#', '');
  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text, bold: true, color })],
    });
  const body = (text: string) =>
    text
      .split('\n')
      .map((line) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun(line)] }));

  const children: Paragraph[] = [
    ...logoParagraph(input.logo),
    ...((input.branding.displayName ?? input.agencyName)
      ? [
          new Paragraph({
            children: [
              new TextRun({
                text: (input.branding.displayName ?? input.agencyName)!,
                bold: true,
                color,
              }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: input.title, bold: true })],
    }),
    ...(input.subtitle
      ? [new Paragraph({ children: [new TextRun({ text: input.subtitle, color: '666666' })] })]
      : []),
    ...input.model.sections.flatMap((s) => [heading(s.heading), ...body(s.text)]),
    ...input.model.requirements.flatMap((group) => [
      heading(group.heading),
      ...group.items.map(
        (item) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(item)] }),
      ),
    ]),
  ];
  const doc = new Document({
    creator: input.agencyName ?? 'EaseMuse',
    title: input.title,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
