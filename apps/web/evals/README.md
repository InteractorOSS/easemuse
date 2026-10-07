# AI evaluation harness (T-QA-03)

Runs the prompt modules against the labelled data in `eval-data/` with the **real model** and reports
accuracy and cost. It needs `ANTHROPIC_API_KEY` and spends money, so it is not part of `pnpm check`.
Run it whenever a prompt, a model or the scoring rubric changes, and keep the report with the change.

```bash
pnpm eval -- --suite profile-structure --limit 10 --max-cost 2
pnpm eval -- --suite match-analyze --limit 30
pnpm eval -- --suite bias --runs 3          # paired resumes, NFR-AI04
pnpm eval -- --suite stability --limit 5     # 5 runs of the same resume, TR-010
pnpm eval -- --suite all --max-cost 15
```

| Suite               | Question it answers                                                                                | Source of truth          |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------ |
| `jd-structure`      | Does A1 find the sections and requirements, and pay when the JD states it?                         | JD front matter          |
| `profile-structure` | Does A7 read name, email, positions and schools right, and invent no numbers? (NFR-AI02, NFR-AI03) | `keys/*.json` `facts`    |
| `match-analyze`     | Do A10's seven levels agree with the key, and do strong, partial and weak resumes rank in order?   | `keys/*.json` `criteria` |
| `bias`              | Do two resumes that differ only in the name score within the tolerance? (NFR-AI04)                 | `bias_pair` in the keys  |
| `stability`         | Does the same resume keep its score within the tolerance over repeated runs? (TR-010)              | repeated runs            |

Options: `--limit N` (cases per suite), `--runs N`, `--tolerance POINTS` (default 5), `--max-cost USD`
(default 5; the run stops when it is reached). Reports are written to `evals/out/` (git-ignored).
`EVAL_DATA_DIR` overrides the data folder.

The graders in `lib/graders.ts` are plain functions with their own tests (`graders.test.ts`), so the
harness itself is checked without a model.
