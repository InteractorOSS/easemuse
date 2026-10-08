# First-customer (internal use) resumes for the AI evaluation set (request and handling rules)

**Status**: Request drafted 2026-10-06. The first customer is **Team of Wakers' internal use** (Q-29), so "the agency" below means Team of Wakers' own recruiting team. Consent and anonymization rules still apply: these are real candidates.
**Owner**: Team of Wakers (EaseMuse).
**Purpose**: Real-world resumes complement the synthetic set (`../resumes-synthetic/`) and test extraction and matching on documents written by real candidates (NFR-AI01, task T-QA-04).

## What we ask the internal recruiting team for

- **Up to 50 resumes** from past or current searches, ideally matched to **10–15 positions** whose JDs the agency can share, with the recruiter's actual outcome (shortlisted, submitted, interviewed, hired, or rejected and why). Outcomes give us real answer keys for match analysis.
- Original file formats as received (PDF, DOCX, including scanned PDFs), because extraction quality is part of the test.

## Consent (required before anything is shared)

- Use only resumes whose candidates have **given written consent** for their resume to be used to test recruiting software. A sample consent line:
  > "I agree that [Agency] may share my resume, with my name and contact details removed, with Team of Wakers to test the quality of its recruiting software. It will not be used for any other purpose and will be deleted by [date]. I can withdraw this consent at any time by contacting [email]."
- The agency keeps the consent records; Team of Wakers keeps a list of consent reference ids only.
- A data-sharing agreement between the agency and Team of Wakers covers purpose limitation, security, retention (deleted after the evaluation, by a fixed date) and deletion on request.

## Anonymization (done by the agency before sharing)

Remove or replace: name → `Candidate <id>`; email, phone, street address, LinkedIn and other profile URLs; photos; date of birth and age; any mention of gender, nationality, marital status, religion, disability. **Keep** employers, titles, dates, skills, education and achievements, since those are what the AI is tested on. A quick checklist and a redaction script can be provided by Team of Wakers on request.

## Handling at Team of Wakers

- Stored only in this folder, which is **excluded from git** (see `../.gitignore`), on encrypted disks; access limited to the evaluation team.
- Used only for the evaluation set; never for training models, never sent to services other than the AI providers already listed as sub-processors (Anthropic, Voyage AI).
- Deleted by the agreed date; deletion confirmed to the agency in writing.
