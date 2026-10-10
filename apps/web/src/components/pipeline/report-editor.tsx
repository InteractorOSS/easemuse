// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { REPORT_SECTIONS, submissionReportContentSchema } from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';

/** The submission report as 14 text boxes; section 14 is the recruiter's own (brief 10, US-801). */
export function ReportEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('pipeline.report');
  const tq = useTranslations('pipeline.qualification');
  const parsed = submissionReportContentSchema.safeParse(content);
  if (!parsed.success) return null;
  // Edit the raw content so typed spaces are kept; the parsed copy is only for reading.
  const raw = content as Record<string, string | undefined>;
  const field = 'rounded-md border border-border bg-background p-2 text-sm';
  const set = (key: string, value: string) => onChange({ ...content, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      {parsed.data.missingInputs.length > 0 ? (
        <p className="text-sm text-muted">
          {t('missing', {
            items: parsed.data.missingInputs
              .map((m) => t(`missingItems.${m as 'qualification'}`))
              .join(', '),
          })}
        </p>
      ) : null}
      {parsed.data.qualificationSummary.length > 0 ? (
        <section
          aria-labelledby="report-qualification-summary"
          className="flex flex-col gap-1 rounded-2xl border border-border p-3"
        >
          <h3 id="report-qualification-summary" className="text-sm font-semibold">
            {t('qualificationSummary')}
          </h3>
          <p className="text-xs text-muted">{t('qualificationSummaryHint')}</p>
          <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
            {parsed.data.qualificationSummary.map((item) => (
              <div key={item.topic} className="contents">
                <dt className="font-medium">{tq(`topics.${item.topic}`)}</dt>
                <dd>
                  {[item.value, item.level ? tq(`levels.${item.level}`) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {REPORT_SECTIONS.map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <label htmlFor={`report-${key}`} className="text-sm font-medium">
            {t(`sections.${key}`)}
          </label>
          <textarea
            id={`report-${key}`}
            rows={3}
            readOnly={readOnly}
            value={raw[key] ?? ''}
            onChange={(e) => set(key, e.target.value)}
            className={field}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1 rounded-2xl border border-border p-3">
        <label htmlFor="report-assessment" className="text-sm font-semibold">
          {t('assessment')}
        </label>
        <p className="text-xs text-muted">{t('assessmentHint')}</p>
        <textarea
          id="report-assessment"
          rows={6}
          readOnly={readOnly}
          value={raw.recruiterAssessment ?? ''}
          onChange={(e) => set('recruiterAssessment', e.target.value)}
          className={field}
        />
      </div>
    </div>
  );
}
