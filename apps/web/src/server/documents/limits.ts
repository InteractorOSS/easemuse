// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** Upload limit per file (ADR-010): resumes and JDs are typically under 1 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Longest PDF read page by page; anything beyond this is not a resume or a JD. */
export const MAX_PDF_PAGES = 40;
