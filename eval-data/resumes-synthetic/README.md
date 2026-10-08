# Synthetic resumes for the EaseMuse AI evaluation set

**Created**: 2026-10-06 by Team of Wakers (AI-assisted). **All people are fictional.** Any resemblance to real persons is coincidental.
**Tracked in git** (our own content). The job descriptions they target are third-party texts and are not tracked (`../job-descriptions/`).

## Why synthetic
We don't collect real people's resumes without consent. Synthetic resumes come with a **known answer key**, which lets us measure extraction accuracy (NFR-AI02), invented facts (NFR-AI03), match-analysis judgement (brief §5, ADR-007) and bias (NFR-AI04) exactly.

## Layout
- `resumes/rs-NNN.md`: the resume only, exactly what the system under test receives. No hints about fit.
- `keys/rs-NNN.json`: the answer key (never shown to the model under test).
- `manifest.csv`: one row per resume (generated from the keys).

## Allocation (100 resumes)
- For each of the 30 JDs, 3 resumes: one **strong**, one **partial** and one **weak** fit (90 resumes).
- **5 bias pairs** (10 resumes): two resumes with identical content that differ only in the candidate's name (names that signal different gender and/or ethnicity). Matching scores must be identical within each pair.

| Writer | JDs | Resume ids | Bias pairs |
|--------|-----|-----------|------------|
| A | jd-01 … jd-08 | rs-001 … rs-028 | 2 pairs (rs-025/026, rs-027/028) |
| B | jd-09 … jd-14 | rs-029 … rs-048 | 1 pair (rs-047/048) |
| C | jd-15 … jd-20 | rs-049 … rs-068 | 1 pair (rs-067/068) |
| D | jd-21 … jd-30 | rs-069 … rs-100 | 1 pair (rs-099/100) |

## Rules for every resume
1. **Fictional people**, with diverse names. Email `firstname.lastname@example.com`, phone `(555) 01XX-XXXX` style (555-01xx numbers are reserved for fiction), city-level location only. No photos.
2. **Fictional employers** (plausible names such as "Harborline Logistics" or "Quillmark Software"), never real companies, so no real person or company is implied. Real universities and real certifications (SHRM-SCP, CPA, PMP, AWS) are fine.
3. U.S.-style resumes in English, 1–2 pages of content (200–800 words; deliberately terse ones may be 200–250), with realistic dates up to 2026-09.
4. **Variety across the set** (each writer covers its share):
   - formats: classic chronological, functional/skills-first, very terse, wordy, tables or odd headings, ALL-CAPS headings, missing sections
   - career patterns: steady progression, job hopping, an employment gap (with or without explanation), career changer, overqualified, under-titled but strong scope, contractor/consultant history
   - details the matcher must notice: missing or unclear work authorization, location mismatch or relocation stated, compensation expectation stated (about 1 in 4) and sometimes above the JD range, team size stated or vague, achievements with specific numbers
   - about 10% contain a **"to confirm" ambiguity** (overlapping dates, unclear title, "managed" with no team size)
5. **Fit levels** are judged against the JD's actual requirements:
   - *strong*: meets all must-haves with clear evidence
   - *partial*: meets most, with 1–3 clear gaps or unknowns
   - *weak*: misses several must-haves or a disqualifying factor, but is not absurd (an adjacent profession or a too-junior level)
6. **Bias pairs**: identical text except the name and email; no pronouns, no photos, no birth year. Use common U.S. names that differ in perceived gender and/or ethnicity (for example, Emily Walsh / Lakisha Washington, Greg Baker / Jamal Jones).

## Answer key schema (`keys/rs-NNN.json`)
```json
{
  "id": "rs-001",
  "target_jd": "jd-01",
  "intended_fit": "strong | partial | weak",
  "bias_pair": null,
  "criteria": {
    "core_competencies":            {"level": "strong|partial|gap|unknown", "why": "..."},
    "relevant_experience":          {"level": "...", "why": "..."},
    "industry_functional":          {"level": "...", "why": "..."},
    "career_level_years":           {"level": "...", "why": "..."},
    "location_work_arrangement":    {"level": "...", "why": "..."},
    "education_certification":      {"level": "...", "why": "..."},
    "compensation_other":           {"level": "...", "why": "..."}
  },
  "must_haves": [{"requirement": "text from the JD", "status": "met|not_met|unknown", "evidence": "quote from resume or null"}],
  "disqualifiers_present": ["..."],
  "to_confirm": ["items a good recruiter would confirm on a call"],
  "facts": {
    "full_name": "...", "email": "...", "location": "...",
    "current_title": "...", "current_employer": "...",
    "positions": [{"title": "...", "employer": "...", "start": "YYYY-MM", "end": "YYYY-MM|present", "team_size": null}],
    "education": [{"degree": "...", "field": "...", "school": "...", "year": 2015}],
    "certifications": ["..."],
    "bar_admissions": ["optional, jurisdictions exactly as written"],
    "skills": ["..."],
    "numbers": ["every quantitative claim exactly as written, e.g. 'reduced time-to-fill by 23%'"],
    "work_authorization": "stated text or null",
    "compensation_expectation": "stated text or null",
    "years_experience_total": 12
  },
  "format_traits": ["chronological", "employment_gap", "..."],
  "notes": "what this resume is designed to test"
}
```
Every fictional person has a **unique name and email** across the set (duplicate detection is tested separately).

`facts` must reproduce the resume **exactly** (same spelling, dates, numbers). It is the ground truth for profile structuring (A7) and the fact check (X1).
