// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { patternSummaryContentSchema } from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { Button } from '@/components/ui/button';
import { recordHref, FewRecords } from './records';

/**
 * The content editor of the A18 draft: each sentence can be reworded or removed; the evidence under
 * it (the counts and the links to the records behind them) stays attached and cannot be edited.
 */
export function PatternSummaryEditor({
  content,
  onChange,
  readOnly,
  agencySlug,
}: ContentEditorProps & { agencySlug: string }) {
  const t = useTranslations('knowledge.summary');
  const k = useTranslations('knowledge');
  const parsed = patternSummaryContentSchema.safeParse(content);
  if (!parsed.success) return <p role="alert">{k('loadError')}</p>;
  const value = parsed.data;
  const set = (statements: typeof value.statements) => onChange({ ...value, statements });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {t('asOf', { client: value.clientName, date: value.asOf })}
      </p>
      <p className="text-sm">{t('removed', { count: value.checks.removed })}</p>
      {value.checks.withheld > 0 ? (
        <p className="text-sm text-muted">{k('withheld', { count: value.checks.withheld })}</p>
      ) : null}
      {value.statements.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      <ol className="flex flex-col gap-4">
        {value.statements.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              {s.tentative ? <FewRecords small /> : null}
            </div>
            <label htmlFor={`ps-${s.id}`} className="sr-only">
              {t('sentence', { n: i + 1 })}
            </label>
            <textarea
              id={`ps-${s.id}`}
              rows={2}
              readOnly={readOnly}
              value={s.text}
              onChange={(e) =>
                set(
                  value.statements.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)),
                )
              }
              className="rounded-md border border-border bg-background p-2 text-sm"
            />
            <div className="text-sm">
              <p className="font-medium">{t('evidence')}</p>
              <ul className="flex flex-col gap-2">
                {s.evidence.map((e) => (
                  <li key={e.factId} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {t('evidenceLine', { label: e.label, hits: e.hits, n: e.n })}
                      <FewRecords small={e.small} />
                    </span>
                    {e.refs.length > 0 ? (
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {e.refs.map((ref, j) => (
                          <Link
                            key={ref.entryId}
                            className="underline"
                            href={recordHref(agencySlug, ref)}
                          >
                            {k('record', { n: j + 1 })}
                          </Link>
                        ))}
                        {e.refCount > e.refs.length ? (
                          <span className="text-muted">
                            {k('moreRecords', { count: e.refCount - e.refs.length })}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            {readOnly ? null : (
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => set(value.statements.filter((x) => x.id !== s.id))}
                >
                  {t('removeSentence', { n: i + 1 })}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
