// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// T-F-23 spike (TR-006, ADR-010): how well does text extraction work on real-world documents, and
// are the "low quality" thresholds right? Takes the evaluation set in ../../eval-data (30 JDs, 30
// synthetic resumes; kept out of git), renders each to DOCX (pandoc) and PDF (LibreOffice), extracts
// them with the production code, and scores recall and precision against pandoc's plain text.
// Also renders scanned (image-only) PDFs with `sips` to check they are detected as scans.
//
//   pnpm --filter @easemuse/web exec tsx scripts/spikes/extraction-quality.ts
//
// Needs pandoc, soffice (LibreOffice) and sips (macOS). Writes only to a temp directory.
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractDocument } from '../../src/server/documents/extract';
import {
  assessTextQuality,
  QUALITY_THRESHOLDS,
  type DocumentKind,
} from '../../src/server/documents/quality';

const EVAL = path.resolve(__dirname, '../../../../eval-data');
const work = mkdtempSync(path.join(os.tmpdir(), 'extraction-spike-'));

interface Doc {
  id: string;
  kind: DocumentKind;
  dir: string;
  plain: string;
}

function body(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function load(): Doc[] {
  const docs: Doc[] = [];
  const sets: [DocumentKind, string][] = [
    ['jd', path.join(EVAL, 'job-descriptions')],
    ['resume', path.join(EVAL, 'resumes-synthetic', 'resumes')],
  ];
  for (const [kind, dir] of sets) {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.md') && !/readme/i.test(f))
      .sort()
      .slice(0, 30);
    for (const f of files) {
      const id = f.replace(/\.md$/, '');
      const docDir = path.join(work, id);
      mkdirSync(docDir, { recursive: true });
      const mdPath = path.join(docDir, 'source.md');
      writeFileSync(mdPath, body(readFileSync(path.join(dir, f), 'utf8')));
      execFileSync('pandoc', [mdPath, '-o', path.join(docDir, 'doc.docx')]);
      const plain = execFileSync('pandoc', [mdPath, '-t', 'plain', '--wrap=none'], {
        encoding: 'utf8',
      });
      docs.push({ id, kind, dir: docDir, plain });
    }
  }
  return docs;
}

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

function overlap(reference: string[], candidate: string[]) {
  const counts = new Map<string, number>();
  for (const t of candidate) counts.set(t, (counts.get(t) ?? 0) + 1);
  let hit = 0;
  for (const t of reference) {
    const n = counts.get(t) ?? 0;
    if (n > 0) {
      hit += 1;
      counts.set(t, n - 1);
    }
  }
  return {
    recall: reference.length ? hit / reference.length : 1,
    precision: candidate.length ? hit / candidate.length : 1,
  };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function run() {
  const docs = load();
  for (const d of docs) {
    execFileSync(
      'soffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', d.dir, path.join(d.dir, 'doc.docx')],
      { stdio: 'ignore' },
    );
  }

  const rows: Record<string, unknown>[] = [];
  const stats = {
    pdf: {
      recall: [] as number[],
      precision: [] as number[],
      ms: [] as number[],
      chars: [] as number[],
      nonText: [] as number[],
      avgWord: [] as number[],
      bytes: [] as number[],
      fallbacks: 0,
    },
    docx: {
      recall: [] as number[],
      precision: [] as number[],
      ms: [] as number[],
      chars: [] as number[],
      nonText: [] as number[],
      avgWord: [] as number[],
      bytes: [] as number[],
      fallbacks: 0,
    },
  };
  const worst: { id: string; kind: string; recall: number }[] = [];

  for (const d of docs) {
    const reference = tokens(d.plain);
    for (const [type, file] of [
      ['pdf', 'doc.pdf'],
      ['docx', 'doc.docx'],
    ] as const) {
      const bytes = readFileSync(path.join(d.dir, file));
      const t0 = performance.now();
      const result = await extractDocument({ bytes, filename: file, kind: d.kind });
      const ms = performance.now() - t0;
      const { recall, precision } = overlap(reference, tokens(result.text));
      const q = assessTextQuality(result.text, d.kind);
      const s = stats[type];
      s.recall.push(recall);
      s.precision.push(precision);
      s.ms.push(ms);
      s.chars.push(q.chars);
      s.nonText.push(q.nonTextRatio);
      s.avgWord.push(q.chars / Math.max(q.words, 1));
      s.bytes.push(statSync(path.join(d.dir, file)).size);
      if (!q.ok) s.fallbacks += 1;
      worst.push({ id: `${d.id}.${type}`, kind: d.kind, recall });
      rows.push({
        id: d.id,
        type,
        kind: d.kind,
        chars: q.chars,
        recall,
        precision,
        nonTextRatio: q.nonTextRatio,
        ms,
      });
    }
  }

  // Scanned (image-only) PDFs: first page of 5 JDs and 5 resumes.
  const scanSample = [
    ...docs.filter((d) => d.kind === 'jd').slice(0, 5),
    ...docs.filter((d) => d.kind === 'resume').slice(0, 5),
  ];
  let scansDetected = 0;
  let scanBytes = 0;
  for (const d of scanSample) {
    execFileSync(
      'sips',
      ['-s', 'format', 'png', path.join(d.dir, 'doc.pdf'), '--out', path.join(d.dir, 'page.png')],
      { stdio: 'ignore' },
    );
    execFileSync(
      'sips',
      ['-s', 'format', 'pdf', path.join(d.dir, 'page.png'), '--out', path.join(d.dir, 'scan.pdf')],
      { stdio: 'ignore' },
    );
    const scan = readFileSync(path.join(d.dir, 'scan.pdf'));
    scanBytes = Math.max(scanBytes, scan.byteLength);
    try {
      await extractDocument({ bytes: scan, filename: 'scan.pdf', kind: d.kind });
    } catch (error) {
      if ((error as { status?: number }).status === 422) scansDetected += 1;
    }
  }

  const out = {
    documents: docs.length,
    thresholds: QUALITY_THRESHOLDS,
    scans: {
      tested: scanSample.length,
      detectedAsUnreadable: scansDetected,
      largestBytes: scanBytes,
    },
    stats: {} as Record<string, unknown>,
    lowestRecall: worst.sort((a, b) => a.recall - b.recall).slice(0, 5),
  };
  for (const type of ['pdf', 'docx'] as const) {
    const s = stats[type];
    out.stats[type] = {
      n: s.recall.length,
      recall: { min: pct(Math.min(...s.recall)), median: pct(median(s.recall)) },
      precision: { min: pct(Math.min(...s.precision)), median: pct(median(s.precision)) },
      chars: { min: Math.min(...s.chars), median: median(s.chars), max: Math.max(...s.chars) },
      maxNonTextRatio: Math.max(...s.nonText).toFixed(4),
      maxAverageWordLength: Math.max(...s.avgWord).toFixed(2),
      extractMsMedian: Math.round(median(s.ms)),
      extractMsMax: Math.round(Math.max(...s.ms)),
      fileBytes: { median: median(s.bytes), max: Math.max(...s.bytes) },
      wouldFallBack: s.fallbacks,
    };
  }
  console.log(JSON.stringify(out, null, 2));
  writeFileSync(path.join(work, 'rows.json'), JSON.stringify(rows, null, 1));
  console.error(`(working files and per-document rows in ${work})`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
