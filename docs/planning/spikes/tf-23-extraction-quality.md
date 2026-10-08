# Spike T-F-23: document extraction quality and the fallback threshold (TR-006, ADR-010)

| Field               | Value                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**            | 2026-10-07                                                                                                                                                                                                                                        |
| **Result**          | **Go, with one open item.** PDF and DOCX extraction are accurate on clean documents and fast; scans are detected. The low-quality thresholds stay as they are. Accuracy on messy real-world files and the model fallback are **not yet measured** |
| **Script**          | `apps/web/scripts/spikes/extraction-quality.ts` (re-runnable; needs pandoc, LibreOffice and macOS `sips`; reads `eval-data/`, which is not in git)                                                                                                |
| **Code under test** | `apps/web/src/server/documents/` (`extractDocument`, `assessTextQuality`)                                                                                                                                                                         |

## Question

1. Does the in-app extraction (pdf.js text layer, mammoth for DOCX) read recruiting documents accurately?
2. Are the thresholds that send a PDF to the model fallback right (200 characters, 30% non-text characters, 25 characters per word)?
3. Is the 10 MB upload limit right?

## Method

- **Documents:** the 30 collected JDs and the first 30 synthetic resumes from `eval-data/` (60 documents). Each was rendered to **DOCX** (pandoc) and to **PDF** (LibreOffice), then extracted with the production code.
- **Scoring:** word-level recall (share of the reference words found) and precision (share of the extracted words that are in the reference), against pandoc's plain text of the same source. Precision matters most: it shows nothing was invented or garbled.
- **Scans:** the first page of 5 JDs and 5 resumes was rasterised (`sips`) into image-only PDFs, to check that they are recognised as having no usable text layer.

## Results

|                                            | PDF (60)               | DOCX (60)              |
| ------------------------------------------ | ---------------------- | ---------------------- |
| Recall, min / median                       | 100.0% / 100.0%        | 100.0% / 100.0%        |
| Precision, min / median                    | 99.2% / 100.0%         | 100.0% / 100.0%        |
| Characters, min / median / max             | 1,310 / 2,655 / 15,869 | 1,302 / 2,671 / 15,824 |
| Highest non-text ratio (threshold 0.30)    | 0.011                  | 0.0001                 |
| Highest average word length (threshold 25) | 7.7                    | 7.9                    |
| Extraction time, median / max              | 5 ms / 105 ms          | 4 ms / 23 ms           |
| File size, median / max                    | 45 KB / 116 KB         | 12 KB / 18 KB          |
| Would fall back to the model               | 0 of 60                | 0 of 60                |

**Scans:** 10 of 10 image-only PDFs were detected (extraction returned the 422 `unreadable_document` error without a model; with one configured they go to the fallback).

## Findings

1. **Accuracy is not a concern for clean files.** Recall is 100%. The one precision miss (99.2%) is a PDF ligature or hyphenation difference, not invented text.
2. **Thresholds have wide margins** on this set (shortest document is 6.5 times the 200-character minimum; the worst non-text ratio is 28 times below the limit). No document would trigger the fallback by mistake. They are **kept unchanged**.
3. **10 MB is generous.** The largest file here is 116 KB. Real resumes with embedded photos or design elements are typically 0.2 to 2 MB. Keep 10 MB.
4. **Speed is not a constraint**, so extraction can run inline in the `documents` job without special handling.

## Limits of this spike (what it does not show)

- The documents were **generated from clean Markdown**. Real candidate files have two-column layouts, tables, text boxes, headers and footers, and odd font encodings, which are where text layers fail. The thresholds are therefore confirmed only for the easy case.
- There are **no real resumes** in `eval-data/` yet (`resumes-pilot/` holds only the request to the internal recruiting team, Q-29).
- The **model fallback was not run live**: there is no `ANTHROPIC_API_KEY` in this environment. Its code and request shape are covered by unit tests with a fake client, but its accuracy on scans is unmeasured.
- Only the first page of scans was tested, and no non-English documents.

## Follow-ups

- **Re-run this script on the first real resumes** (PDF, DOCX and scanned, from the internal team) and re-check the thresholds and the "parsed from image" rate before relying on them. Add a two-column and a table-heavy sample at that point.
- **Run the fallback live** once an Anthropic key is available: compare its transcription against the text layer on the scan sample and record cost per page (T-QA-04 eval set).
- No code change needed now. `quality.ts` points here.
