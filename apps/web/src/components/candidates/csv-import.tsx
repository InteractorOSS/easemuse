// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import {
  CANDIDATE_SOURCES,
  IMPORT_BATCH_SIZE,
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  rowFromCells,
  suggestMapping,
  type CandidateSourceValue,
  type ImportField,
  type ImportOutcome,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';

interface Parsed {
  headers: string[];
  rows: string[][];
}
interface Result {
  created: number;
  duplicates: { row: number; name: string; candidateId: string; reasons: string[] }[];
  invalid: { row: number; reason: 'noName' | 'rejected' }[];
  /** Rows after a failed request that were never sent. */
  unsent: number;
}

/**
 * Import candidates from a CSV (T-2-15, Q-10): choose the file, check the column mapping, import in
 * batches. The file is read in the browser; people already in the agency are skipped and listed.
 */
export function CsvImport({ agencyId, agencySlug }: { agencyId: string; agencySlug: string }) {
  const t = useTranslations('candidates.import');
  const sources = useTranslations('candidates.sources');
  const [source, setSource] = useState<CandidateSourceValue>('database');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const running = useRef(false);

  const choose = async (file: File | undefined) => {
    setError(null);
    setParsed(null);
    setResult(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setError(t('tooBig'));
    let table: string[][];
    try {
      table = parseCsv(await file.text());
    } catch {
      return setError(t('readError'));
    }
    const [headers, ...rows] = table;
    if (!headers || rows.length === 0) return setError(t('empty'));
    if (rows.length > MAX_IMPORT_ROWS) return setError(t('tooManyRows', { max: MAX_IMPORT_ROWS }));
    setParsed({ headers, rows });
    setMapping(suggestMapping(headers));
  };

  const hasName =
    mapping.includes('fullName') || mapping.includes('firstName') || mapping.includes('lastName');

  const start = async () => {
    if (!parsed || running.current || !hasName) return;
    running.current = true;
    const prepared = parsed.rows.map((cells, i) => ({
      line: i + 2,
      ...rowFromCells(cells, mapping),
    }));
    const sendable = prepared.filter((p) => p.row !== null);
    const out: Result = {
      created: 0,
      duplicates: [],
      invalid: prepared
        .filter((p) => p.row === null)
        .map((p) => ({ row: p.line, reason: 'noName' })),
      unsent: 0,
    };
    setResult(null);
    setProgress({ done: 0, total: sendable.length });
    for (let at = 0; at < sendable.length; at += IMPORT_BATCH_SIZE) {
      const batch = sendable.slice(at, at + IMPORT_BATCH_SIZE);
      try {
        const res = await apiFetch<ImportOutcome[]>(
          `/api/v1/agencies/${agencyId}/candidates/import`,
          {
            body: { source, rows: batch.map((b) => b.row) },
          },
        );
        for (const outcome of res.data) {
          const item = batch[outcome.index]!;
          if (outcome.status === 'created') out.created++;
          else if (outcome.status === 'duplicate')
            out.duplicates.push({
              row: item.line,
              name: item.row!.fullName,
              candidateId: outcome.candidateId,
              reasons: outcome.reasons,
            });
          else out.invalid.push({ row: item.line, reason: 'rejected' });
        }
      } catch {
        out.unsent = sendable.length - at;
        break;
      }
      setProgress({ done: Math.min(sendable.length, at + batch.length), total: sendable.length });
    }
    running.current = false;
    setProgress(null);
    setResult(out);
  };

  const importing = progress !== null;
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link className="underline" href={`/a/${agencySlug}/candidates`}>
          {t('back')}
        </Link>
      </div>
      <p className="text-sm text-muted">{t('intro')}</p>

      {result === null && !importing ? (
        <>
          <SelectField
            label={t('source')}
            value={source}
            onChange={(e) => setSource(e.target.value as CandidateSourceValue)}
          >
            {CANDIDATE_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sources(s)}
              </option>
            ))}
          </SelectField>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('file', { max: MAX_IMPORT_ROWS })}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </>
      ) : null}

      {parsed && result === null && !importing ? (
        <section aria-labelledby="mapping-heading" className="flex flex-col gap-3">
          <h2 id="mapping-heading" className="text-lg font-semibold">
            {t('mapping')}
          </h2>
          <p className="text-sm text-muted">{t('mappingHint')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t('mapping')}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('column')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('example')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('field')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsed.headers.map((header, i) => (
                  <tr key={i} className="border-b border-border align-top">
                    <th scope="row" className="px-3 py-2 font-medium">
                      {header}
                    </th>
                    <td className="px-3 py-2 text-muted">
                      {parsed.rows
                        .slice(0, 3)
                        .map((r) => r[i] ?? '')
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td className="px-3 py-2">
                      <SelectField
                        label={<span className="sr-only">{header}</span>}
                        value={mapping[i] ?? ''}
                        onChange={(e) =>
                          setMapping((m) =>
                            m.map((v, j) =>
                              j === i ? ((e.target.value || null) as ImportField | null) : v,
                            ),
                          )
                        }
                      >
                        <option value="">{t('skip')}</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {t(`fields.${f}`)}
                          </option>
                        ))}
                      </SelectField>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasName ? (
            <p role="alert" className="text-sm text-danger">
              {t('needName')}
            </p>
          ) : null}
          <div>
            <Button disabled={!hasName} onClick={() => void start()}>
              {t('start', { count: parsed.rows.length })}
            </Button>
          </div>
        </section>
      ) : null}

      {importing ? (
        <p role="status">{t('progress', { done: progress.done, total: progress.total })}</p>
      ) : null}

      {result ? (
        <section aria-labelledby="result-heading" className="flex flex-col gap-4">
          <h2 id="result-heading" className="text-lg font-semibold">
            {t('summary', {
              created: result.created,
              duplicates: result.duplicates.length,
              invalid: result.invalid.length,
            })}
          </h2>
          {result.unsent > 0 ? (
            <p role="alert" className="text-sm text-danger">
              {t('failed', { rows: result.unsent })}
            </p>
          ) : null}
          {result.duplicates.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="font-medium">{t('duplicates')}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {result.duplicates.map((d) => (
                  <li key={d.row}>
                    {t('duplicateLine', {
                      row: d.row,
                      name: d.name,
                      reasons: d.reasons.map((r) => t(`reasons.${r as 'email'}`)).join(', '),
                    })}{' '}
                    <Link
                      className="underline"
                      href={`/a/${agencySlug}/candidates/${d.candidateId}`}
                    >
                      {t('viewExisting')}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.invalid.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="font-medium">{t('skipped')}</h3>
              <ul className="text-sm">
                {result.invalid.map((s) => (
                  <li key={s.row}>{t('skippedLine', { row: s.row, reason: t(s.reason) })}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex gap-3">
            <Link
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              href={`/a/${agencySlug}/candidates`}
            >
              {t('seeCandidates')}
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setParsed(null);
              }}
            >
              {t('another')}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
