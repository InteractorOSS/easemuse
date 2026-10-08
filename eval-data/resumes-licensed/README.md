# Licensed / Public Resume Datasets: Assessment for EaseMuse Internal Evaluation

**Research date:** 2026-10-06
**Prepared for:** EaseMuse (Team of Wakers), internal AI evaluation set
**Status:** Desk research only. No dataset files were downloaded. Only dataset cards, license pages, repository READMEs, Kaggle metadata and papers were read.

> Dataset terms, licenses, gating and contents can change at any time. Re-check each source on the day you download, and save a dated copy of the dataset card and license next to the data.
> This is not legal advice. The items under "Verify with counsel" need a lawyer's sign-off before use.

---

## 1. Purpose

EaseMuse is a commercial SaaS recruiter workbench. We need resumes for an **internal evaluation set** that tests three things:

1. **Resume structuring**: parsing free-text or PDF resumes into structured fields.
2. **JD matching**: scoring resumes against job descriptions.
3. **"No invented facts" check**: making sure model output contains only facts that are in the source resume.

We will not crawl real people's resumes. This document checks whether any public resume dataset can be used **lawfully and ethically by a commercial company**, even for internal-only evaluation.

## 2. Criteria

A dataset is usable only if it passes all of these:

| # | Criterion | Rule |
|---|-----------|------|
| C1 | License | An explicit license that allows commercial use, or at least use inside a commercial company. **No license stated means not usable.** "Research / non-commercial only" means not usable. |
| C2 | Provenance | Resumes are synthetic, contributed with consent, or released by the platform that holds the data under its own terms. **Scraped from resume sites (LiveCareer, Indeed, Postjobfree and similar), LinkedIn, or image search means DO NOT USE, whatever the card's license says.** A person who scrapes content they do not own cannot grant a valid CC0 or MIT license over it. |
| C3 | Personal data | No real people's identifying data. Real-person data must have been anonymized in a documented way with consent. Names, emails or phones left in the text count as a fail. |
| C4 | Fit | U.S.-style resumes in English. Target roles are HR, finance, engineering and sales. |
| C5 | Ground truth | Preferred: structured attributes alongside the text. These make the "no invented facts" check much easier to score. |

Verdicts: **USE** / **USE WITH CAVEATS** / **DO NOT USE**.

---

## 3. Comparison table

| # | Dataset | Size / format | License (as stated) | Provenance | Real people? | U.S. / role fit | Verdict |
|---|---------|---------------|---------------------|------------|--------------|-----------------|---------|
| 1 | **PopResume** (sumin-yu/PopResume, HF) | 60,884 text resumes + 121,768 images; Parquet | CC BY 4.0 (HF card) | Synthetic, rule-based, built from U.S. aggregate statistics (ACS PUMS, PSID, SSA, Census surnames) | No ("No real individual's data is included") | U.S.; accountants & auditors (finance) and software developers (engineering). No HR or sales | **USE WITH CAVEATS** |
| 2 | **Djinni Recruitment Dataset** (lang-uk, HF) | ~210k English CVs + Ukrainian; Parquet | MIT (HF card and UNLP 2024 paper) | Data supplied by the Djinni platform itself, 2020-2023 | Yes, real profiles that are anonymous by platform policy, plus a PII-removal step | Ukraine, IT only. Poor U.S. fit | **USE WITH CAVEATS** (low priority) |
| 3 | **Kaggle "Resume Dataset"** (snehaanbhawal/resume-dataset) | 2,400+ resumes, text, HTML and PDF | "CC0: Public Domain" (Kaggle metadata) | Scraped from livecareer.com, per the card | Resume examples from a commercial site; the card makes no consent claim | U.S.-style; includes HR, Finance, Sales, Engineering | **DO NOT USE** |
| 4 | **ResumeAtlas** (ahmedheakl/resume-atlas, HF; noran-mohamed GitHub) | 13,389 resumes; CSV | MIT | Google Images, Bing Images and LiveCareer, text taken by OCR | Yes. The README says names, phones and emails are present | 43 categories | **DO NOT USE** |
| 5 | **CareerCorpus** (Mendeley Data, wzzwn37gmd) | 302 annotated resumes; XLSX | CC BY 4.0 | Kaggle/LiveCareer resumes plus public LinkedIn profiles | Real (LinkedIn); PII swapped for placeholders | Finance, accounting, banking | **DO NOT USE** |
| 6 | **Master Resumes** (datasetmaster/resumes; mirror PROFESSORSAM25/resumes, HF) | ~4.8k JSON records | MIT | Mix of real resumes ("collected from CV submissions") and Faker synthetic ones | Partly real; the card says "anonymized" without detail | Tech roles only | **DO NOT USE** |
| 7 | **Resume Summarization Dataset** (jbeiroa, HF) | 14,515 rows | "Other": "for research and non-commercial use only" | Real resumes of mixed or undisclosed origin plus GPT summaries | Yes, names, emails and phones appear | Mixed | **DO NOT USE** |
| 8 | **resume-score-details** (netsol, HF) | 1,031 JSON samples | "cc" with no variant named | Resumes "randomly sampled" from an undisclosed source; JDs written by GPT-4o | Appear real; the sample shows a real-looking name and Gmail address | Mixed, IT | **DO NOT USE** |
| 9 | **LithiVR/Resumes** (HF) | 16 PDFs | Apache-2.0 | Not documented | Unknown | Unknown | **DO NOT USE** |
| 10 | **FINDHR Synthetic CVs** (arXiv 2508.21179) | 1,730 synthetic CVs | Custom agreement, for researchers at European institutions only | Synthetic, built from donated EU CVs | No (synthetic) | EU, mostly translated from Spanish | **DO NOT USE** (not available to us) |
| 11 | **O\*NET 31.0 Database** (U.S. DOL); not resumes | Occupational tasks, skills, titles | CC BY 4.0 | U.S. government | None | U.S., every occupation | **USE** as seed data for our own synthetic resumes |

---

## 4. Per-dataset notes

### 4.1 PopResume: USE WITH CAVEATS
- **URL:** https://huggingface.co/datasets/sumin-yu/PopResume
- **Publisher:** Sumin Yu et al. The card says it was presented at EMNLP 2026 (oral). I could not check that separately.
- **Size / format:** 60,884 resumes in a text config, plus a config with 121,768 resume images (with and without photos). Parquet, about 15.9 GB in total. Each resume comes with its structured attributes.
- **License:** CC BY 4.0, stated on the HF card. This allows commercial use with attribution.
- **Provenance:** The card says resumes are "generated by rule-based procedures from aggregate population statistics", drawn from the U.S. ACS PUMS, PSID, Social Security Administration data and Census surname statistics. "No real individual's data is included" and the raw microdata is not redistributed.
- **Personal data:** None, as far as the card says. Names are synthetic, sampled from Census surname frequencies.
- **Fit:** Strong U.S. relevance. The 5 occupations are accountants & auditors (7,784), construction laborers (5,910), elementary/middle school teachers (16,188), registered nurses (17,632) and software developers (13,370). That covers **finance** (accountants) and **engineering** (software developers) only. There are **no HR or sales roles**.
- **Ground truth:** Very good. The structured attributes next to each text make it simple to score structuring accuracy and invented facts.
- **Caveats:**
  - Access is gated. HF asks you to "agree to share your contact information", and there may be extra click-through terms. Read them before downloading, because they may narrow CC BY 4.0, for example to research-only use.
  - The data was built for fairness research. Its rule-based text may be more uniform than real resumes, so it is weak for testing parsing robustness.
  - Attribution is required even for internal use: keep a NOTICE file.
- **Verdict reason:** This is the only large, clearly licensed, U.S.-grounded synthetic set, but it covers just 2 of our 4 target role families.

### 4.2 Djinni Recruitment Dataset: USE WITH CAVEATS (low priority)
- **URLs:** https://huggingface.co/datasets/lang-uk/recruitment-dataset-candidate-profiles-english · paper: https://aclanthology.org/2024.unlp-1.2
- **Publisher:** Nazarii Drushchak and Mariana Romanyshyn (Ukrainian Catholic University / Grammarly), with Djinni.
- **Size / format:** About 230k candidate profiles across English and Ukrainian (~210k rows in the English CV subset) and about 150k job descriptions. Parquet.
- **License:** MIT, on the HF card and in the paper ("released under the MIT license"). This allows commercial use.
- **Provenance:** The paper says "The data for the corpus was provided by Djinni, an IT job platform that hosts job listings and anonymized user profiles", and "The company generously shared with us the data covering a period from 2020 to 2023." So the platform released the data itself; nothing was scraped.
- **Personal data:** Real people's profiles. The paper says Djinni "has a strict policy requiring registration through anonymized profiles only and enforces measures to prevent the posting of PII", and the authors also ran a PII-removal and protected-attribute detection script. One automated read of the HF viewer reported names and locations showing in some rows. **Check a sample by hand before use.** The paper does not document user consent for third-party reuse.
- **Fit:** Weak. The candidates are Ukrainian IT/tech workers, and the profiles are not U.S. resume format. There is little HR, finance or sales.
- **Verdict reason:** The license and provenance are acceptable, but the content is real-person and off-target. Use only a small sample of English profiles to test robustness on messy, non-U.S. text, and only if counsel agrees.

### 4.3 Kaggle "Resume Dataset" (snehaanbhawal): DO NOT USE
- **URL:** https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset
- **License as stated:** "CC0: Public Domain" (Kaggle API metadata, `licenseName`).
- **Provenance:** The card itself says: *"Data was obtained by scrapping individual resume examples from www.livecareer.com website. Web Scrapping code present in my Github Repo."* LiveCareer is a commercial resume-builder site, and its content is copyrighted by the site operator. Job and resume sites' terms typically prohibit automated scraping and reuse; I could not load LiveCareer's terms page (requests timed out). Someone who scraped the content had no rights to place it under CC0.
- **Personal data:** These are resume "examples", likely derived from or modelled on user resumes. There is no consent or anonymization statement.
- **Fit:** Good on paper: HR, Finance, Sales, Engineering, Accountant, Banking and more, U.S.-style. It is also the most-downloaded resume set (~80k downloads), which is why it shows up in so many papers.
- **Verdict reason:** Scraped from a commercial site without permission, so the CC0 label is not a valid grant.

### 4.4 ResumeAtlas: DO NOT USE
- **URLs:** https://huggingface.co/datasets/ahmedheakl/resume-atlas · https://github.com/noran-mohamed/Resume-Classification-Dataset · paper arXiv 2406.18125
- **License as stated:** MIT (MIT-LICENSE.txt in the repo).
- **Provenance:** The GitHub README says the resumes came from "Google Images", "Bing Images" and "the website LiveCareer", with text taken by OCR.
- **Personal data:** The README admits the resumes contain "personal information like names, phone numbers, and email addresses". No anonymization is described.
- **Verdict reason:** Real people's resumes taken from image search and a resume site, with PII left in.

### 4.5 CareerCorpus: DO NOT USE
- **URL:** https://data.mendeley.com/datasets/wzzwn37gmd/1
- **Publisher:** Chowdhury et al., East Delta University (Mendeley Data).
- **License as stated:** CC BY 4.0.
- **Provenance:** Five categories come from the Kaggle/LiveCareer set (4.3). The Research Assistant category comes from "publicly accessible LinkedIn profiles". The card does not address consent.
- **Personal data:** Names, emails and phones were replaced with placeholders, but the source documents are real people's.
- **Verdict reason:** Built from the scraped LiveCareer set and LinkedIn profiles, and LinkedIn's User Agreement prohibits scraping.

### 4.6 Master Resumes (datasetmaster/resumes; PROFESSORSAM25/resumes): DO NOT USE
- **URLs:** https://huggingface.co/datasets/datasetmaster/resumes · https://huggingface.co/datasets/PROFESSORSAM25/resumes
- **License as stated:** MIT.
- **Provenance:** Real resumes "collected from CV submissions" (no source, no consent statement), merged with synthetic ones generated with Faker. The card does not say which records are real.
- **Personal data:** The card says real records were "anonymized to remove PII", but gives no method.
- **Fit:** Tech roles only. The card says it "may not generalize well to non-technical industries."
- **Verdict reason:** Real-person records with unexplained provenance are mixed in and cannot be reliably separated from the synthetic ones.

### 4.7 Resume Summarization Dataset (jbeiroa): DO NOT USE
- **URL:** https://huggingface.co/datasets/jbeiroa/resume-summarization-dataset
- **License as stated:** "Other". The card says *"This dataset is shared for research and non-commercial use only"* and notes that parts may be copyrighted.
- **Personal data:** Real-looking resumes with names, emails and phones.
- **Verdict reason:** Non-commercial only, and contains real-person PII.

### 4.8 resume-score-details (netsol): DO NOT USE
- **URL:** https://huggingface.co/datasets/netsol/resume-score-details
- **License as stated:** "cc", with no CC variant named, so the actual terms are unclear.
- **Provenance:** Resumes were "randomly sampled" from an undisclosed source. Job descriptions were generated with GPT-4o.
- **Personal data:** The sample record shows a real-looking full name and personal Gmail address.
- **Verdict reason:** Ambiguous license, unknown provenance and apparent real PII.

### 4.9 LithiVR/Resumes: DO NOT USE
- **URL:** https://huggingface.co/datasets/LithiVR/Resumes
- **License as stated:** Apache-2.0. **Size:** 16 PDFs.
- **Provenance and personal data:** Not documented at all.
- **Verdict reason:** Unknown provenance, and too small to be worth the risk.

### 4.10 FINDHR Synthetic CVs: DO NOT USE (not available to us)
- **URLs:** https://arxiv.org/abs/2508.21179 · access: https://findhr.eu/synthetic-cvs
- **License:** The CC BY 4.0 on the arXiv page covers the paper only. The dataset is released under a separate "free-of-charge license agreement that forbids donor re-identification attempts", and only to "researchers at established European institutions".
- **Provenance:** Synthetic, built from donated CVs (data-donation campaign). Covers ICT, business/administration, science/engineering, sales, clerical, and legal/social roles in the EEA and Switzerland.
- **Verdict reason:** A U.S. commercial company is not eligible for access, and the data is EU, not U.S.

### 4.11 O\*NET 31.0 Database (seed data, not resumes): USE
- **URL:** https://www.onetcenter.org/license_db.html
- **License:** CC BY 4.0. You must "credit the O\*NET 31.0 Database and the U.S. Department of Labor", link to the license, and mark changes. Commercial use is allowed. Use "O\*NET" only as an adjective, with the ® mark.
- **Use for us:** Real U.S. job titles, tasks, skills, tools and education levels for HR specialists, financial analysts and accountants, engineers, and sales reps. These can seed **our own synthetic resumes and JDs**. Because we write the attribute record first, every resume comes with ground truth for the "no invented facts" check.

---

## 5. Recommendation

**Bottom line:** No public dataset of *real* resumes passed the criteria. Every large real-resume set we found was either scraped (from LiveCareer, LinkedIn or image search) or limited to non-commercial use. The safe path is **synthetic data**.

1. **Primary (recommended): build our own synthetic set.**
   - Generate about **200-400 resumes** from structured attribute records, seeded with O\*NET titles, tasks and skills and U.S. education and employer patterns. Plan for roughly 50-100 each in HR, finance, engineering and sales, with a spread of seniority and some deliberately messy formats (PDF layout, gaps, abbreviations).
   - Write about **20-40 JDs** across the same roles.
   - Keep each resume's source attribute JSON as ground truth for structuring and for the "no invented facts" check.
   - Use only fictional names and contact details (reserved `example.com` domains, 555-01xx phone numbers). Generate with a model whose terms allow commercial use of its outputs, and record the model and prompt.
2. **Supplement: PopResume.**
   - After reviewing its gated terms, take about **100-200 resumes**: about 50-100 accountants & auditors (finance) and 50-100 software developers (engineering).
   - Use the bundled attributes as ground truth.
   - Keep a NOTICE file with the CC BY 4.0 attribution and a dated copy of the dataset card.
3. **Optional: Djinni.**
   - Take at most about **50 English profiles**, only to test robustness on non-U.S., messy text, and only after counsel signs off and a manual PII spot-check confirms no names or contacts.
   - Exclude these from any customer-facing claims.
4. **Do not use** the Kaggle LiveCareer set, ResumeAtlas, CareerCorpus, Master Resumes, jbeiroa, netsol or LithiVR, even though their cards show open licenses. This also applies to their derivatives and to models fine-tuned on them.

## 6. Verify with counsel

- **PopResume:** whether its gated access terms add restrictions beyond CC BY 4.0, such as research-only use, and whether internal evaluation at a commercial company is allowed.
- **Djinni:** whether MIT applies to user-contributed profile text, and whether Djinni's user terms and privacy policy allowed sharing with third parties for commercial reuse. Also whether Ukrainian data-protection law, or GDPR where it applies, affects us.
- **CC BY attribution:** that our NOTICE approach is enough for internal-only use.
- **Synthetic generation:** that the LLM provider's terms allow commercial use of generated resumes, and that no output reproduces a real person's resume.
- **Records:** a record-keeping policy, with a dated snapshot of each dataset card and license, in case terms change later.
- **Wider program:** if evaluation results feed hiring-related features, check the obligations that follow, such as NYC Local Law 144 bias audits, Colorado and Illinois AI-in-employment laws, and EEOC guidance. These are separate from dataset licensing.

## 7. Sources

- PopResume card: https://huggingface.co/datasets/sumin-yu/PopResume
- Djinni (HF): https://huggingface.co/datasets/lang-uk/recruitment-dataset-candidate-profiles-english · paper: https://aclanthology.org/2024.unlp-1.2 (PDF: https://aclanthology.org/2024.unlp-1.2.pdf)
- Kaggle Resume Dataset: https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset (license and description from the Kaggle public API `datasets/view/snehaanbhawal/resume-dataset`)
- ResumeAtlas: https://huggingface.co/datasets/ahmedheakl/resume-atlas · https://github.com/noran-mohamed/Resume-Classification-Dataset · https://arxiv.org/abs/2406.18125
- CareerCorpus: https://data.mendeley.com/datasets/wzzwn37gmd/1
- Master Resumes: https://huggingface.co/datasets/datasetmaster/resumes · https://huggingface.co/datasets/PROFESSORSAM25/resumes/blob/main/README.md
- Resume Summarization: https://huggingface.co/datasets/jbeiroa/resume-summarization-dataset
- resume-score-details: https://huggingface.co/datasets/netsol/resume-score-details
- LithiVR/Resumes: https://huggingface.co/datasets/LithiVR/Resumes
- FINDHR synthetic CVs: https://arxiv.org/abs/2508.21179 · https://arxiv.org/html/2508.21179
- O\*NET license: https://www.onetcenter.org/license_db.html
- LiveCareer terms of use: the page could not be retrieved during this research (timeouts). Counsel or a team member should confirm its scraping and reuse clauses directly.

## Decision and access steps (2026-10-06)

**Approved by the product owner:** use PopResume as a supplement. Its dataset card (public) says: CC BY 4.0; synthetic resumes derived from U.S. statistical sources (ACS PUMS, PSID, SSA, U.S. Census); "intended for research and practice on algorithmic fairness in automated hiring, including audits of deployed screening systems." That matches our bias testing (NFR-AI04).

**Access is manually gated** (`gated: manual`): the dataset author approves each request, and requesters agree to share their contact information. So a person, not an automated script, has to request it:

1. Sign in to Hugging Face with a Team of Wakers account, open https://huggingface.co/datasets/sumin-yu/PopResume, read the access form, and request access.
2. After approval, create a **read-only** access token (Settings → Access Tokens) and add it to `.env.local` as `HF_TOKEN=...` (never commit it).
3. Then download only `data/text/accountants_auditors.parquet` and `data/text/software_developers.parquet` (plus a few `data/images/` files of the same occupations, for scanned-resume extraction tests). Sample about 75 of each into `eval-data/resumes-licensed/popresume/` (not tracked in git), with a `manifest.csv` and an `ATTRIBUTION.md` giving the citation (arXiv 2603.22714) and the CC BY 4.0 notice.

Files available (checked 2026-10-06): text and rendered page images for accountants/auditors, software developers, registered nurses, elementary/middle school teachers and construction laborers. Only the first two match our job descriptions.
