// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Design tokens, the single source for colors and radii. `scripts/build-css.mjs` renders them to a
 * Tailwind 4 `@theme` block (dist/theme.css), so `bg-primary`, `text-muted` and friends exist as
 * utilities and every value traces back to this file.
 */
export const tokens = {
  color: {
    background: '#ffffff',
    foreground: '#111827',
    surface: '#f9fafb',
    muted: '#4b5563',
    border: '#d1d5db',
    // Brand green (build prompt §2). White text on it fails WCAG AA, so it carries dark text, and
    // `primaryStrong` is the shade for green text, borders and focus rings on white.
    primary: '#4cd964',
    primaryForeground: '#0b2d14',
    primaryStrong: '#15803d',
    danger: '#b91c1c',
    dangerForeground: '#ffffff',
    // The "AI draft" badge (brief §1.1: AI output is a draft until the recruiter approves it).
    draftBadge: '#92400e',
    draftBadgeBackground: '#fef3c7',
  },
  radius: { sm: '4px', md: '8px', lg: '12px', card: '16px' },
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

function declarations(tree: TokenTree): string {
  const lines: string[] = [];
  flatten(tree, '-', lines);
  return lines.join('\n');
}

/** Plain CSS custom properties on `:root`. */
export function tokensToCss(tree: TokenTree = tokens): string {
  return `:root {\n${declarations(tree)}\n}\n`;
}

/** Tailwind 4 theme block: `--color-x` becomes `bg-x` / `text-x`, `--radius-x` becomes `rounded-x`. */
export function tokensToTheme(tree: TokenTree = tokens): string {
  return `@theme {\n${declarations(tree)}\n}\n`;
}
