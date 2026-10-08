// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * The agency logo on a printed page (FR-TEN-04). The image arrives as a data URI, so the print worker
 * needs no second request; its name is read out as the alternative text.
 */
export function LogoMark({ src, name }: { src: string | null; name: string | null }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- a print page: the image is inline data, not a route
  return <img src={src} alt={name ?? ''} className="ml-auto max-h-14 max-w-48 object-contain" />;
}
