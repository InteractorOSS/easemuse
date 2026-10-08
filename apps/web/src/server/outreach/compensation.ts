// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** A number or a Prisma Decimal. */
type Amount = number | { toString(): string } | null;

/** "100,000 to 120,000 USD", "from 100,000 USD", "up to 120,000 USD"; null when no amount is set. */
export function formatCompensation(min: Amount, max: Amount, currency: string): string | null {
  const n = (v: Exclude<Amount, null>) => Number(v.toString()).toLocaleString('en-US');
  if (min !== null && max !== null) return `${n(min)} to ${n(max)} ${currency}`;
  if (min !== null) return `from ${n(min)} ${currency}`;
  if (max !== null) return `up to ${n(max)} ${currency}`;
  return null;
}
