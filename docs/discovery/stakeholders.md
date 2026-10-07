# Step 2: Stakeholder Analysis

| Field | Value |
|-------|-------|
| **Project** | EaseMuse AI-Assisted Recruiter Workbench |
| **Date** | 2026-10-06 |
| **Status** | v0.2: updated 2026-10-06 for SaaS model and portals. Names and contacts to fill in |

The brief (§15) names three actors. The recruiter is at the center.

```
        Client / Hiring Manager  ──decides──►  hiring decision
                 ▲   │
       submits,  │   │ JD, feedback
       reports   │   ▼
             ┌──────────────┐  asks for drafts  ┌──────────────────┐
             │  RECRUITER   │ ────────────────► │ AI support layer │
             │ (decides all │ ◄──────────────── │ (drafts only)    │
             │  candidate   │   drafts, lists   └──────────────────┘
             │  actions)    │
             └──────────────┘
                 ▲   │
        replies, │   │ outreach, calls,
        approval │   ▼ resume for approval
                Candidate
```

---

## Stakeholder register

> **Model change (2026-10-06):** Team of Wakers owns and maintains EaseMuse and sells it to recruiting agencies. Team of Wakers is the **vendor**; each agency is a **customer (tenant)**; hiring managers and candidates are **portal users** of the agency that invited them.

### Internal (Team of Wakers, vendor)

| Name | Role | Interest | Influence | Engagement |
|------|------|----------|-----------|------------|
| [TBD] | Executive sponsor / Team of Wakers leadership | High | High | Manage closely |
| [TBD] | Product owner (owns this brief) | High | High | Manage closely |
| [TBD] | Team of Wakers internal recruiters and recruiting lead (first customer, tenant #1, Q-29) | High | Medium | Manage closely: co-design, pilot |
| [TBD] | Tech lead / engineering | High | Medium | Keep informed |
| [TBD] | Legal / privacy / compliance advisor | Medium | High | Keep satisfied: required sign-off on candidate data and AI use |
| [TBD] | Platform operations / support (tenant onboarding, billing, support) | Medium | Low | Keep informed |
| [TBD] | Sales / customer success (agency customers) | Medium | Medium | Keep informed: pricing, onboarding, design partners |

### External

| Group | Role | Interest | Influence | Engagement |
|-------|------|----------|-----------|------------|
| Agency customers: owners/admins | Buy, configure, administer their workspace | High | High (revenue) | Manage closely: design partners (Q-30) |
| Agency recruiters | Primary daily users | High | Medium (adoption) | Manage closely: pilot, feedback |
| Agency recruiting leads | Optional role per agency: team pipeline, KPIs | High | Medium | Keep satisfied |
| Client companies / hiring managers | Define needs, approve JD, review submissions, give feedback, decide hires **in the HM portal** | High | High (they pay the agency) | Keep satisfied: portal must be simple, no training needed |
| Candidates | Data subjects; receive outreach; **use the candidate portal** to approve resumes, update profile, give consent, make privacy requests | High (personal data, career) | Medium (can decline, request deletion) | Keep informed: privacy notice, consent, data rights |
| AI model provider (e.g., Anthropic) | LLM for drafting and analysis | Low | Medium (cost, availability, data terms) | Monitor: contract and data-processing terms |
| Other vendors (email, file storage, hosting) | Infrastructure | Low | Low–Medium | Monitor |
| Regulators | Privacy and AI-in-hiring rules | Low | High | Keep satisfied via compliance review ([research-notes.md §3](./research-notes.md#3-regulatory-and-compliance-notes)) |

---

## Stakeholder matrix

```
                    INFLUENCE
                Low            High
           ┌─────────────┬──────────────────────────┐
      High │ KEEP        │ MANAGE CLOSELY           │
           │ INFORMED    │ Sponsor, Product owner,  │
           │ Candidates, │ Agency owners/admins,    │
           │ Platform admins │ Recruiters*, Clients/HMs │
INTEREST   ├─────────────┼──────────────────────────┤
           │ MONITOR     │ KEEP SATISFIED           │
      Low  │ Sales/CS,   │ Legal/compliance,        │
           │ vendors     │ regulators, AI provider  │
           └─────────────┴──────────────────────────┘
* Recruiters have medium formal influence but decisive adoption influence.
```

---

## Detailed profiles

### Recruiter (primary user)

| Attribute | Details |
|-----------|---------|
| **Role** | Runs searches end to end for client positions |
| **Interest / influence** | High / Medium (adoption decides success) |
| **Engagement** | Co-design sessions, pilot group, weekly feedback during build |

**Goals**: handle more positions without losing quality; less time on reading and writing; never miss a follow-up; find past candidates quickly.
**Concerns**: AI that is wrong or overconfident; extra data entry; losing control of what goes to clients and candidates; being judged by an AI score.
**Success criteria**: drafts are good enough to edit rather than rewrite; the pipeline view replaces their spreadsheet; submission report takes minutes.

### Agency owner / admin (customer)

**Goals**: more placements per recruiter; quick setup; control over users, branding and costs; client data safe.
**Concerns**: price vs. value; data lock-in (export); AI legal risk transferred to them; another agency seeing their data.
**Success criteria**: onboarding in a day; clear per-seat and AI usage costs; exportable data; vendor support for compliance (bias audit, DPA).

### Client hiring manager (portal user, decision maker)

**Goals**: a clear role definition; fewer but better-explained submissions; fast scheduling; approve and give feedback in a couple of clicks.
**Concerns**: confidentiality of their search and compensation data; candidates being misrepresented.
**Success criteria**: submission reports are trustworthy and consistent; feedback they give is reflected in the next submissions.

### Candidate (portal user, data subject)

**Goals**: relevant, respectful outreach; accurate representation; timely updates.
**Concerns**: privacy of personal data and compensation; resume changes they didn't approve; being screened out by an algorithm.
**Success criteria**: they approve their tailored resume before it is sent (§9.2); they can ask for their data to be deleted.

### Executive sponsor / product owner

**Goals**: a sellable SaaS product; revenue from agency subscriptions; internal use as the first, reference customer (Q-29), then external agencies.
**Concerns**: build cost, AI running cost per tenant, legal exposure as an AI-in-hiring vendor, scope growth from the portals.

### Legal / compliance

**Goals**: lawful handling of candidate personal data; AI-in-hiring rules met; client confidentiality.
**Concerns**: whether match scoring counts as an automated employment decision tool; Team of Wakers' role as processor for agencies (DPA, sub-processors); customer contracts and terms; data retention; Korea expansion (PIPA, cross-border transfer).

---

## Communication plan (proposed)

| Audience | Method | Frequency | Content | Owner |
|----------|--------|-----------|---------|-------|
| Sponsor + product owner | Meeting | Weekly | Status, decisions needed, scope | Tech lead / PM |
| Recruiter pilot group | Demo + feedback session | Every 2 weeks | Working features, draft quality | Product owner |
| Legal / compliance | Review meeting | At discovery exit, before pilot, before launch | Data flows, AI use, consent | Product owner |
| All stakeholders | Written update | Per phase | Phase outcomes | Product owner |

## Decision authority (RACI)

| Decision | Sponsor | Product owner | Recruiter lead | Tech lead | Legal |
|----------|---------|---------------|----------------|-----------|-------|
| Scope and release slices | A | R | C | C | I |
| Recruiter workflow and screens | I | A | R | C | I |
| AI behavior and guardrails | I | A | C | R | C |
| Candidate data handling, retention, consent | I | A | I | C | R |
| Technical approach and vendors | I | C | I | A/R | C (data terms) |
| Go / no-go | A | R | C | C | C |

R = Responsible, A = Accountable, C = Consulted, I = Informed

## Concerns and mitigations

| Stakeholder | Concern | Impact | Mitigation |
|-------------|---------|--------|------------|
| Recruiters | AI drafts are inaccurate | High | Every draft shows its sources; editing before approval is required; track edit rate |
| Recruiters | Extra data entry | High | Resume parsing, notes-to-structure, one pipeline view replacing spreadsheets |
| Candidates | Misrepresentation | High | DP-6: facts never changed; original kept; candidate approval before submission |
| Clients | Confidentiality | High | Per-client access control; no client data used across clients without permission (Q-12) |
| Legal | AI-in-hiring regulation | High | Human decision at every step, audit log, bias review (see research notes §3) |
| Sponsor | AI cost | Medium | Requests only on demand (DP-2); per-request cost tracking |

## Sign-off

| Phase | Approvers (to name) | Method |
|-------|--------------------|--------|
| Discovery | Product owner, sponsor, recruiter lead, design-partner agency (if any) | Review of this folder |
| Planning | Product owner, tech lead, legal (data flows) | Document review |
| Pilot launch | Sponsor, product owner, legal | Checklist |
