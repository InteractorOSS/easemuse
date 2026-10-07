// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  CRITERION_BASES,
  REQUIREMENT_CATEGORIES,
  successProfileContentSchema,
  type RequirementCategoryValue,
  type SuccessProfileContent,
} from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { Button } from '@/components/ui/button';

/** The success profile as a form (US-107): summary, criteria by category, expectations, key challenges. */
export function SuccessProfileEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('positions.profileEditor');
  const categories = useTranslations('positions.categories');
  const parsed = successProfileContentSchema.safeParse(content);
  const [draft, setDraft] = useState({
    text: '',
    category: 'must_have' as RequirementCategoryValue,
  });
  // Keep the raw text so a new line can be typed; only non-blank lines are saved.
  const [challenges, setChallenges] = useState(() =>
    parsed.success ? parsed.data.keyChallenges.join('\n') : '',
  );
  if (!parsed.success) return <p role="alert">{t('invalid')}</p>;
  const profile = content as unknown as SuccessProfileContent;
  const emit = (next: SuccessProfileContent) =>
    onChange(next as unknown as Record<string, unknown>);
  const setCriterion = (index: number, patch: Partial<SuccessProfileContent['criteria'][number]>) =>
    emit({
      ...profile,
      criteria: profile.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  const move = (index: number, by: -1 | 1) => {
    const next = [...profile.criteria];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    emit({ ...profile, criteria: next });
  };
  const dealBreakers = profile.criteria.filter((c) => c.category === 'disqualifying').length;
  const field = 'rounded-md border border-border bg-background p-2 text-sm';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="sp-summary" className="font-medium">
          {t('summary')}
        </label>
        <textarea
          id="sp-summary"
          rows={3}
          readOnly={readOnly}
          value={profile.summary}
          onChange={(e) => emit({ ...profile, summary: e.target.value })}
          className={field}
        />
      </div>

      <section aria-labelledby="sp-criteria" className="flex flex-col gap-3">
        <h2 id="sp-criteria" className="text-lg font-semibold">
          {t('criteriaTitle')}
        </h2>
        <p className="text-sm text-muted">{t('dealBreakers', { count: dealBreakers })}</p>
        {profile.criteria.length === 0 ? (
          <p className="text-sm text-muted">{t('criteriaNone')}</p>
        ) : null}
        <ol className="flex flex-col gap-2">
          {profile.criteria.map((c, index) => {
            const n = index + 1;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={t('criterion', { n })}
                  readOnly={readOnly}
                  value={c.text}
                  onChange={(e) => setCriterion(index, { text: e.target.value })}
                  className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                />
                <select
                  aria-label={t('category', { n })}
                  disabled={readOnly}
                  value={c.category}
                  onChange={(e) =>
                    setCriterion(index, { category: e.target.value as RequirementCategoryValue })
                  }
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {REQUIREMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {categories(cat)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('basis', { n })}
                  disabled={readOnly}
                  value={c.basis}
                  onChange={(e) =>
                    setCriterion(index, { basis: e.target.value as 'jd' | 'intake' })
                  }
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {CRITERION_BASES.map((b) => (
                    <option key={b} value={b}>
                      {t(`bases.${b}`)}
                    </option>
                  ))}
                </select>
                {readOnly ? null : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('moveUp', { n })}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      {'↑'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('moveDown', { n })}
                      disabled={index === profile.criteria.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      {'↓'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('remove', { n })}
                      onClick={() =>
                        emit({
                          ...profile,
                          criteria: profile.criteria.filter((_, i) => i !== index),
                        })
                      }
                    >
                      {'×'}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        {readOnly ? null : (
          <div role="group" aria-label={t('add')} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={t('newCriterion')}
              value={draft.text}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-sm"
            />
            <select
              aria-label={t('newCategory')}
              value={draft.category}
              onChange={(e) =>
                setDraft((d) => ({ ...d, category: e.target.value as RequirementCategoryValue }))
              }
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {REQUIREMENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {categories(cat)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={draft.text.trim() === ''}
              onClick={() => {
                emit({
                  ...profile,
                  criteria: [
                    ...profile.criteria,
                    {
                      id: crypto.randomUUID(),
                      text: draft.text.trim(),
                      category: draft.category,
                      basis: 'intake',
                    },
                  ],
                });
                setDraft((d) => ({ ...d, text: '' }));
              }}
            >
              {t('add')}
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="sp-expect" className="flex flex-col gap-3">
        <h2 id="sp-expect" className="text-lg font-semibold">
          {t('expectationsTitle')}
        </h2>
        {(['sixMonths', 'twelveMonths'] as const).map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`sp-${key}`} className="text-sm font-medium">
              {t(key)}
            </label>
            <textarea
              id={`sp-${key}`}
              rows={2}
              readOnly={readOnly}
              value={profile.expectations[key]}
              onChange={(e) =>
                emit({
                  ...profile,
                  expectations: { ...profile.expectations, [key]: e.target.value },
                })
              }
              className={field}
            />
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-1">
        <label htmlFor="sp-challenges" className="font-medium">
          {t('challenges')}
        </label>
        <textarea
          id="sp-challenges"
          rows={4}
          readOnly={readOnly}
          value={challenges}
          onChange={(e) => {
            setChallenges(e.target.value);
            emit({
              ...profile,
              keyChallenges: e.target.value.split('\n').filter((l) => l.trim() !== ''),
            });
          }}
          className={field}
        />
      </div>
    </div>
  );
}
