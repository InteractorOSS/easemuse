// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** One CSV cell. Quotes when needed, and defuses spreadsheet formulas (a leading = + - @ becomes text). */
function cell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text (CRLF line ends, UTF-8 BOM so spreadsheets read Korean names correctly). */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
