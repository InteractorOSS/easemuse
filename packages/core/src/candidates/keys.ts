// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
/**
 * Match keys for duplicate detection (T-2-04, FR-SRC-04). Two records that mean the same person
 * should produce the same key even when typed differently: "+82 (10) 1234-5678" and "01012345678",
 * "https://www.linkedin.com/in/Alex-Kim/?utm=x" and "linkedin.com/in/alex-kim".
 */

export const MIN_PHONE_DIGITS = 7;

/** Lowercased, trimmed; null when it is not plausibly an address. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

/**
 * The last ten digits of the number, so "+82 10-1234-5678", "010 1234 5678" and "1012345678"
 * compare equal. Too-short numbers give null (they would match anyone).
 */
export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= MIN_PHONE_DIGITS ? digits.slice(-10) : null;
}

/** `host/path` without scheme, "www.", query, fragment or trailing slash; lowercase. Null if empty. */
export function profileUrlKey(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  // Done by hand: this package has no URL global, and only host and path matter here.
  const match = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').match(/^([^/?#\s]+)([^?#\s]*)/);
  if (!match) return null;
  const host = match[1]!.toLowerCase().replace(/^www\./, '');
  if (!/^[\p{L}\p{N}.-]+$/u.test(host) || !host.includes('.')) return null;
  const path = (match[2] ?? '').replace(/\/+$/, '').toLowerCase();
  // LinkedIn profiles are identified by the slug after /in/, whatever the country subdomain.
  const linkedin = path.match(/^\/in\/([^/]+)/);
  if (host.endsWith('linkedin.com') && linkedin) {
    try {
      return `linkedin.com/in/${decodeURIComponent(linkedin[1]!)}`;
    } catch {
      return `linkedin.com/in/${linkedin[1]}`;
    }
  }
  return `${host}${path}`;
}

const COMPANY_SUFFIX =
  /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|pte|sa)\b\.?/gi;
const KOREAN_COMPANY = /(주식회사|\(주\)|㈜)/g;

/** A company name reduced to letters and digits without legal suffixes: "Acme, Inc." ≈ "ACME". */
export function employerKey(name: string | null | undefined): string | null {
  const value = (name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(KOREAN_COMPANY, ' ')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return value.length >= 2 ? value : null;
}

export function employerKeys(names: (string | null | undefined)[]): string[] {
  return [...new Set(names.map(employerKey).filter((k): k is string => k !== null))];
}

/** Name as comparable tokens: lowercase letters and digits, sorted, so "Kim, Alex" ≈ "Alex Kim". */
export function nameTokens(name: string | null | undefined): string[] {
  return (name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .sort();
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * Similarity of two names from 0 to 1. Order and punctuation do not matter; a one-letter typo
 * still scores high. Korean names written without spaces compare as one token.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const joinedA = nameTokens(a).join('');
  const joinedB = nameTokens(b).join('');
  if (!joinedA || !joinedB) return 0;
  const longest = Math.max(joinedA.length, joinedB.length);
  return 1 - editDistance(joinedA, joinedB) / longest;
}

/** Names at or above this are "the same person" when an employer also matches. */
export const NAME_MATCH_THRESHOLD = 0.85;

export type DuplicateReason = 'email' | 'phone' | 'profile_url' | 'name_employer';
