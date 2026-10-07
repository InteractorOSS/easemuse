// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  SEARCH_LIST_FIELDS,
  searchCriteriaSchema,
  type SearchCriteria,
  type SearchListField,
} from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/** The search sheet as plain text, for pasting into notes or an email. */
export function criteriaAsText(
  criteria: SearchCriteria,
  label: (field: SearchListField | 'years' | 'keywordSearch') => string,
): string {
  const lines: string[] = [];
  for (const field of SEARCH_LIST_FIELDS) {
    if (criteria[field].length) lines.push(`${label(field)}: ${criteria[field].join(', ')}`);
  }
  const { min, max } = criteria.yearsOfExperience;
  if (min !== null || max !== null) lines.push(`${label('years')}: ${min ?? ''}-${max ?? ''}`);
  if (criteria.keywordSearch) lines.push(`${label('keywordSearch')}: ${criteria.keywordSearch}`);
  return lines.join('\n');
}

/** The search criteria sheet as a form (US-201): one list per condition, copyable as a whole. */
export function SearchCriteriaEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('positions.searchEditor');
  const { toast } = useToast();
  const parsed = searchCriteriaSchema.safeParse(content);
  // Raw text per list, so a new line can be typed; only non-blank lines are saved.
  const [raw, setRaw] = useState<Partial<Record<SearchListField, string>>>({});
  if (!parsed.success) return <p role="alert">{t('invalid')}</p>;
  const criteria = parsed.data;
  const emit = (next: SearchCriteria) => onChange(next as unknown as Record<string, unknown>);
  const field = 'rounded-md border border-border bg-background p-2 text-sm';
  const years = (key: 'min' | 'max', value: string) =>
    emit({
      ...criteria,
      yearsOfExperience: {
        ...criteria.yearsOfExperience,
        [key]: value === '' ? null : Math.max(0, Math.min(60, Math.trunc(Number(value)))),
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const text = criteriaAsText(criteria, (f) =>
              f === 'years'
                ? t('years')
                : f === 'keywordSearch'
                  ? t('keywordSearch')
                  : t(`fields.${f}`),
            );
            await navigator.clipboard?.writeText(text).catch(() => undefined);
            toast({ title: t('copied') });
          }}
        >
          {t('copy')}
        </Button>
      </div>
      {SEARCH_LIST_FIELDS.map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <label htmlFor={`sc-${key}`} className="text-sm font-medium">
            {t(`fields.${key}`)}
          </label>
          <textarea
            id={`sc-${key}`}
            rows={3}
            readOnly={readOnly}
            value={raw[key] ?? criteria[key].join('\n')}
            onChange={(e) => {
              setRaw((r) => ({ ...r, [key]: e.target.value }));
              emit({
                ...criteria,
                [key]: e.target.value
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean),
              });
            }}
            className={field}
          />
          <span className="text-xs text-muted">
            {key === 'companies' ? t('companiesHint') : t('listHint')}
          </span>
        </div>
      ))}
      <fieldset className="flex flex-wrap items-end gap-4">
        <legend className="text-sm font-medium">{t('years')}</legend>
        {(['min', 'max'] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            {key === 'min' ? t('yearsMin') : t('yearsMax')}
            <input
              type="number"
              min={0}
              max={60}
              readOnly={readOnly}
              value={criteria.yearsOfExperience[key] ?? ''}
              onChange={(e) => years(key, e.target.value)}
              className="h-10 w-28 rounded-md border border-border bg-background px-2"
            />
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="sc-keywords" className="text-sm font-medium">
          {t('keywordSearch')}
        </label>
        <textarea
          id="sc-keywords"
          rows={3}
          readOnly={readOnly}
          spellCheck={false}
          value={criteria.keywordSearch}
          onChange={(e) => emit({ ...criteria, keywordSearch: e.target.value })}
          className={`${field} font-mono`}
        />
        <span className="text-xs text-muted">{t('keywordHint')}</span>
      </div>
    </div>
  );
}
