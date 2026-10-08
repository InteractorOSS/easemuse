// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { AgencyBranding, TailoredResumeContent } from '@easemuse/core';
import { logoParagraph, type DocxLogo } from './logo-docx';

export interface ResumeLabels {
  roles: string;
  education: string;
  skills: string;
  present: string;
}

/** Date range as printed on a role line ("2019 - present"). Shared by the PDF page and the Word file. */
export function roleRange(
  role: Pick<TailoredResumeContent['roles'][number], 'start' | 'end' | 'current'>,
  present: string,
): string {
  const end = role.current ? present : role.end;
  return [role.start, end].filter(Boolean).join(' - ');
}

/**
 * The approved tailored resume as an editable DOCX (T-7-03, ADR-011): the same content as the PDF.
 * A blind resume has no name or contact details (the header is empty in the content itself).
 */
export async function buildResumeDocx(input: {
  content: TailoredResumeContent;
  branding: AgencyBranding;
  logo?: DocxLogo | null;
  labels: ResumeLabels;
}): Promise<Buffer> {
  const { content, labels } = input;
  const color = input.branding.primaryColor.replace('#', '');
  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text, bold: true, color })],
    });
  const contact = [content.header.email, content.header.phone, content.header.location].filter(
    (v): v is string => Boolean(v),
  );

  const children: Paragraph[] = [
    ...logoParagraph(input.logo),
    ...(content.header.name
      ? [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: content.header.name, bold: true })],
          }),
        ]
      : []),
    ...(content.headline
      ? [new Paragraph({ children: [new TextRun({ text: content.headline, bold: true, color })] })]
      : []),
    ...(contact.length
      ? [
          new Paragraph({
            children: [new TextRun({ text: contact.join('  |  '), color: '666666' })],
          }),
        ]
      : []),
    ...(content.summary
      ? [
          new Paragraph({
            spacing: { before: 160, after: 80 },
            children: [new TextRun(content.summary)],
          }),
        ]
      : []),
    ...(content.roles.length ? [heading(labels.roles)] : []),
    ...content.roles.flatMap((role) => [
      new Paragraph({
        spacing: { before: 120 },
        children: [
          new TextRun({ text: `${role.title}, ${role.company}`, bold: true }),
          new TextRun({ text: `   ${roleRange(role, labels.present)}`, color: '666666' }),
        ],
      }),
      ...role.bullets.map(
        (b) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b)] }),
      ),
    ]),
    ...(content.education.length ? [heading(labels.education)] : []),
    ...content.education.map(
      (e) =>
        new Paragraph({
          children: [new TextRun([e.degree, e.school, e.year].filter(Boolean).join(', '))],
        }),
    ),
    ...(content.skills.length
      ? [
          heading(labels.skills),
          new Paragraph({ children: [new TextRun(content.skills.join(', '))] }),
        ]
      : []),
  ];
  const doc = new Document({
    creator: 'EaseMuse',
    title: content.header.name ?? content.headline ?? 'Resume',
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
