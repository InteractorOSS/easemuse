# EaseMuse JD Evaluation Set (internal)

## Purpose

30 real, public job descriptions used **only for internal evaluation** of EaseMuse's AI: structuring JDs into sections, extracting Must / Preferred / Nice-to-have / Disqualifying requirements, benchmarking, and candidate matching.

## Copyright and use restrictions

The JD texts (`jd-*.md`) are third-party copyrighted job postings owned by the employers. They are kept here for internal evaluation only and **must NOT be redistributed, published, used in marketing or demos, or committed to a public repository**. `eval-data/.gitignore` keeps them out of git; only this README and `manifest.csv` are tracked. Delete the texts when they're no longer needed for evaluation.

## Sources and collection method

- Collected on **2026-10-06** from public job-board APIs that employers publish so their own listings can be displayed:
  - Greenhouse Job Board API: `https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true`. Boards used: lyft, instacart, coinbase, reddit, robinhood, gitlab, stripe, figma, pinterest, twilio, airbnb, databricks. All 15 tokens we probed responded.
  - Lever Postings API: `https://api.lever.co/v0/postings/<company>?mode=json`. Companies used: zoox, palantir, outreach. Spotify also responded but wasn't used. plaid, netflix and attentive returned 404, and kraken returned an empty list.
- Requests were made with `curl` and the User-Agent `EaseMuse-eval-collector/0.1 (internal research)`, at about 1 request per second, with no login. We didn't scrape any HTML career pages, LinkedIn, Indeed or Glassdoor.
- We selected U.S.-located or U.S.-remote roles by hand for diversity of function, level, length and requirement types.
- Processing:
  - Converted HTML to Markdown with entities decoded.
  - Replaced EEO runs over ~150 words with `[EEO statement omitted]`, and long privacy, application or anti-fraud notices with `[Application/privacy notice boilerplate omitted]`. Pay-range paragraphs are always kept.
  - Replaced emails (including `[at]` obfuscations) and phone numbers with `[contact removed]`.
  - For Lever postings, appended the structured `salaryRange` as a "Salary range (from posting metadata)" section.
- `source_url` is the employer's public posting URL, as returned by the API. `api_url` is the single-job API endpoint. Coinbase (jd-03, jd-20, jd-30) and Pinterest (jd-11) career pages return HTTP 403 to non-browser clients. Their `api_url` returned 200 on the collection date.
- Postings expire, so re-check `api_url` before relying on a role still being open.

## Contents

| Category | Count | Files |
|---|---|---|
| hr | 8 | jd-01 to jd-08 |
| finance_ops_legal | 6 | jd-09 to jd-14 |
| engineering | 6 | jd-15 to jd-20 |
| sales_cs_marketing | 5 | jd-21 to jd-25 |
| other (variety stress cases) | 5 | jd-26 to jd-30 |

The five "other" stress cases:

- jd-26: very short JD (~160 words)
- jd-27: very long JD (~2,200 words)
- jd-28: active security clearance required
- jd-29: U.S. Government role requiring a clearance
- jd-30: manager role with a stated team size

jd-01 (team of 14) also states a team size.

26 of 30 JDs state a compensation range. jd-21 gives hourly ranges. The four without a range are the Stripe postings (jd-08, jd-13, jd-18, jd-22).

Each `jd-NN.md` file has YAML front matter with these fields:

- id, title, company, location, department
- source_api, source_url, api_url, retrieved_at
- category, has_comp_range, comp_range, word_count, notes

`manifest.csv` has the same fields, one row per JD.
