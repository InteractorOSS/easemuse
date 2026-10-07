// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** Design tokens. Rendered to CSS custom properties by `tokensToCss` (T-F-20 wires the UI kit). */
export const tokens = {
  color: {
    background: '#ffffff',
    foreground: '#111827',
    muted: '#6b7280',
    border: '#e5e7eb',
    primary: '#2563eb',
    primaryForeground: '#ffffff',
    draftBadge: '#b45309',
  },
  radius: { sm: '4px', md: '8px' },
} as const;

type TokenTree = { readonly [key: string]: string | TokenTree };

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function flatten(tree: TokenTree, prefix: string, out: string[]): void {
  for (const [key, value] of Object.entries(tree)) {
    const name = `${prefix}-${kebab(key)}`;
    if (typeof value === 'string') out.push(`  ${name}: ${value};`);
    else flatten(value, name, out);
  }
}

export function tokensToCss(tree: TokenTree = tokens): string {
  const lines: string[] = [];
  flatten(tree, '-', lines);
  return `:root {\n${lines.join('\n')}\n}\n`;
}
