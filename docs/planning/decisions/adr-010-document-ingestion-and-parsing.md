# ADR-010: Document ingestion, storage and text extraction

## Status

Accepted (2026-10-06, product owner). **Revised:** the first draft proposed Interactor userdb. The product owner decided (Q-34) not to use userdb and to keep documents in EaseMuse's own database.

## Date

2026-10-06

## Context

Recruiters upload resumes and JDs (PDF, DOCX) or paste text (brief §3.2, §4.1–4.2). Originals must be preserved unchanged (§9.1, FR-PLT-05), deleted completely when a candidate asks (FR-PLT-08), and kept inside the agency's isolation boundary (ADR-001). Scanned PDFs need OCR (TR-006).

## Options

1. ~~Interactor userdb for storage + extraction~~. Rejected by the product owner (Q-34).
2. **EaseMuse's own PostgreSQL for originals + in-app text extraction**, with a PDF-to-model fallback for scans. Chosen.
3. Object storage (S3) for originals. Adds a second store for candidate data, outside RLS.

## Decision

**Option 2.**

- **Storage:** originals go in a `FileBlob` table (`bytea`), one row per `FileObject` with `store = "db"`, both carrying `agencyId` under **RLS** (ADR-001). Blob bytes are in their own table so main tables stay small, and they are read only through the authorized download route. Upload limit: 10 MB per file (resumes and JDs are typically < 1 MB). Duplicate uploads are detected by `sha256`.
- **Extraction (worker, `documents` queue):**
  - PDF: text-layer extraction with a pdf.js-based library.
  - DOCX: conversion to text/HTML with a DOCX converter library (e.g., mammoth).
  - Pasted text is used as is.
  - Results are stored in `CandidateDocument.extractedText` / `JobDescription.text`.
- **Scans and low-quality text** (< 200 characters for a resume, or a high ratio of non-text characters): send the PDF to Claude as a document block (Anthropic API, already a sub-processor) to extract the text. The result is marked "parsed from image" for closer recruiter review.
- **Deletion:** candidate anonymization (ADR-016) deletes `FileBlob` rows in the same transaction as the documents, so there is no external store to clean up.
- Generated outputs (PDF/DOCX) follow ADR-011.

## Consequences

**Positive:** candidate files never leave EaseMuse's database plus the AI provider; RLS covers files too; deletion is transactional; one less external dependency.
**Negative:** database size grows with files (≈ 100k resumes × ~300 KB ≈ 30 GB per large agency). Mitigation: blobs in a separate table (TOAST-compressed), excluded from hot queries; backups sized accordingly (infrastructure, out of scope here). We also own the parsing code. Mitigation: libraries plus the model fallback; extraction quality measured on the eval set.

## Related

ADR-001, ADR-011, ADR-016. FR-INT-03, FR-SRC-02/03/10, FR-PLT-05/08; risk TR-006; Q-34.

## Decision record

| Date       | Author               | Action                                            |
| ---------- | -------------------- | ------------------------------------------------- |
| 2026-10-06 | Claude (AI-assisted) | Created (userdb)                                  |
| 2026-10-06 | Product owner        | Revised: no userdb; own database (Q-34). Accepted |
