# ADR-011: Generated documents (PDF/DOCX) and agency branding

## Status
Accepted (2026-10-06, product owner)

## Date
2026-10-06

## Context
Outputs that go to clients and candidates need rendering: improved JD (DOCX/PDF, brief §3.3–3.4), tailored resume (DOCX/PDF, §9.1) and Candidate Submission Report (PDF, §10). All are agency-branded (FR-TEN-04), and the content must match the approved version exactly.

## Options
1. **HTML → PDF with headless Chromium** (Playwright is already a dev dependency). High fidelity, and the same React components can render the page; needs a browser in the worker.
2. **@react-pdf/renderer.** No browser, but its own layout model and a second set of components.
3. **DOCX templates** (docx library) for everything, converted to PDF. Recruiters can edit DOCX, but PDF conversion needs LibreOffice.

## Decision
- **PDF:** Option 1. A `documents.render` job renders a print route (`/render/<kind>/<versionId>`, worker-only auth) with Playwright Chromium and stores the result in an S3-compatible bucket (`easemuse/<agencyId>/generated/...`) as a `FileObject`. A `content hash = hash(approved version content + branding)` is stored, and the PDF is regenerated only when the hash changes.
- **DOCX** (tailored resume, improved JD, which recruiters may want to tweak): generate with the `docx` library from the same zod content.
- Branding (logo, colors) comes from `Agency.branding`. Team of Wakers supplies the default template (Q-15).

## Consequences
The worker image must include Chromium (infrastructure concern, out of scope here). Rendering is asynchronous (`202 jobRunId`).

## Related
ADR-006, ADR-010. FR-INT-08, FR-RES-02, FR-SUB-02, FR-TEN-04.

## Decision record
| Date | Author | Action |
|------|--------|--------|
| 2026-10-06 | Claude (AI-assisted) | Created |
| 2026-10-06 | Product owner | Accepted |
