// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { createContext, useContext } from 'react';
import { benchmarkContentSchema, type BenchmarkContent } from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/** What the editor needs to link "Our data" to the agency's own positions. */
export const BenchmarkContext = createContext<{
  agencySlug: string;
  ourPositions: Record<string, { title: string; status: string }>;
}>({ agencySlug: '', ourPositions: {} });

/**
 * Takes one item out of the report. Suggestions that rested on it lose that basis, and a
 * suggestion left with no basis goes too (every suggestion names what it rests on).
 */
export function removeBenchmarkItem(content: BenchmarkContent, id: string): BenchmarkContent {
  return {
    ...content,
    ourData: content.ourData.filter((i) => i.id !== id),
    web: content.web.filter((i) => i.id !== id),
    suggestions: content.suggestions
      .map((s) => ({ ...s, basedOn: s.basedOn.filter((b) => b !== id) }))
      .filter((s) => s.basedOn.length > 0),
  };
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * The benchmark report (US-108): "Our data" and "Web" are two separate lists with their own
 * headings; every web item shows where it came from and when. The recruiter can take items out
 * before approving. Suggested changes are decided in the panel below, after approval.
 */
export function BenchmarkEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('intelligence.benchmark');
  const format = useFormatter();
  const { agencySlug, ourPositions } = useContext(BenchmarkContext);
  const parsed = benchmarkContentSchema.safeParse(content);
  if (!parsed.success) return <p role="alert">{t('invalid')}</p>;
  const report = parsed.data;
  const emit = (id: string) => onChange(removeBenchmarkItem(report, id) as Record<string, unknown>);
  const day = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: 'UTC' });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="bm-ours" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="bm-ours" className="text-lg font-semibold">
            {t('ourData.heading')}
          </h2>
          <Badge>{t('ourData.heading')}</Badge>
        </div>
        <p className="text-sm text-muted">{t('ourData.hint')}</p>
        {report.ourData.length === 0 ? (
          <p className="text-sm">{t('ourData.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.ourData.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
                <p className="text-sm">
                  <span className="mr-2 font-mono text-xs text-muted">{item.id}</span>
                  <Badge className="mr-2">{t(`categories.${item.category}`)}</Badge>
                  {item.text}
                </p>
                <p className="text-xs text-muted">
                  {t('ourData.positions')}{' '}
                  {item.positionIds.map((id, index) => (
                    <span key={id}>
                      {index > 0 ? ', ' : ''}
                      {ourPositions[id] ? (
                        <a className="underline" href={`/a/${agencySlug}/positions/${id}`}>
                          {ourPositions[id].title}
                        </a>
                      ) : (
                        id.slice(0, 8)
                      )}
                    </span>
                  ))}
                </p>
                {!readOnly ? (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('removeLabel', { text: item.text })}
                      onClick={() => emit(item.id)}
                    >
                      {t('remove')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="bm-web" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="bm-web" className="text-lg font-semibold">
            {t('web.heading')}
          </h2>
          <Badge>{t('web.heading')}</Badge>
        </div>
        <p className="text-sm text-muted">{t('web.hint')}</p>
        {report.webSearch === 'off' ? <p className="text-sm">{t('webOff')}</p> : null}
        {report.webSearch === 'no_results' ? <p className="text-sm">{t('webNoResults')}</p> : null}
        {report.droppedWebItems > 0 ? (
          <p className="text-sm text-muted">{t('dropped', { count: report.droppedWebItems })}</p>
        ) : null}
        {report.web.length === 0 && report.webSearch === 'done' ? (
          <p className="text-sm">{t('web.empty')}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {report.web.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
              <p className="text-sm">
                <span className="mr-2 font-mono text-xs text-muted">{item.id}</span>
                <Badge className="mr-2">{t(`categories.${item.category}`)}</Badge>
                {item.text}
              </p>
              <ul
                className="flex flex-col gap-0.5 text-xs text-muted"
                aria-label={t('web.sources')}
              >
                {item.sources.map((s) => (
                  <li key={s.url}>
                    <a className="underline" href={s.url} rel="noreferrer noopener" target="_blank">
                      {s.title || hostOf(s.url)}
                    </a>{' '}
                    {`(${hostOf(s.url)}) · ${t('web.retrieved', { date: day(s.retrievedOn) })}`}
                    {s.publishedAt ? ` · ${t('web.published', { date: s.publishedAt })}` : ''}
                  </li>
                ))}
              </ul>
              {!readOnly ? (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('removeLabel', { text: item.text })}
                    onClick={() => emit(item.id)}
                  >
                    {t('remove')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
