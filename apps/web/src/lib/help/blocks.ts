// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * A help article body is an object in the message catalog, so translators see plain strings and the
 * i18n guard checks every key. The key says what the string is: `h1` a heading, `p1` a paragraph,
 * `li1` a bullet, `ol1` a numbered step, `note1` a call-out. The number only keeps keys unique;
 * the order in the file is the order on the page.
 */
export type HelpBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'steps'; items: string[] };

const KIND_BY_PREFIX: Record<string, HelpBlock['kind'] | 'bullet' | 'step'> = {
  h: 'heading',
  p: 'paragraph',
  note: 'note',
  li: 'bullet',
  ol: 'step',
};

/** Turns the catalog object into renderable blocks; consecutive bullets (or steps) form one list. */
export function toBlocks(raw: unknown): HelpBlock[] {
  if (!raw || typeof raw !== 'object') return [];
  const blocks: HelpBlock[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const kind = KIND_BY_PREFIX[key.replace(/\d+$/, '')];
    if (!kind) continue;
    const last = blocks[blocks.length - 1];
    if (kind === 'bullet' || kind === 'step') {
      const listKind = kind === 'bullet' ? 'bullets' : 'steps';
      if (last && last.kind === listKind) last.items.push(value);
      else blocks.push({ kind: listKind, items: [value] });
    } else {
      blocks.push({ kind: kind as 'heading' | 'paragraph' | 'note', text: value });
    }
  }
  return blocks;
}
