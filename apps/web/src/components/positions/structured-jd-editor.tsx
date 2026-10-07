// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  JD_SECTIONS,
  REQUIREMENT_CATEGORIES,
  missingSections,
  structuredJdContentSchema,
  type JdSection,
  type RequirementCategoryValue,
  type StructuredJdContent,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import type { ContentEditorProps } from '@/components/artifacts/types';

/**
 * The structured JD as a form (US-103): the 13 sections with "missing" marked, and the requirement
 * list where the recruiter changes the category, edits, reorders, adds and deletes. Plugs into the
 * generic artifact editor, which keeps the save / approve / discard bar.
 */
export function StructuredJdEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('positions.jdEditor');
  const sections = useTranslations('positions.jdSections');
  const categories = useTranslations('positions.categories');
  const parsed = structuredJdContentSchema.safeParse(content);
  const [draft, setDraft] = useState({
    text: '',
    category: 'preferred' as RequirementCategoryValue,
    section: 'required_qualifications' as JdSection,
  });

  if (!parsed.success) return <p role="alert">{t('invalid')}</p>;
  const jd = parsed.data;
  const emit = (next: StructuredJdContent) => onChange(next as unknown as Record<string, unknown>);
  const setRequirement = (
    index: number,
    patch: Partial<StructuredJdContent['requirements'][number]>,
  ) =>
    emit({
      ...jd,
      requirements: jd.requirements.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  const move = (index: number, by: -1 | 1) => {
    const next = [...jd.requirements];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    emit({ ...jd, requirements: next });
  };
  const missing = missingSections(jd);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="jd-missing" className="flex flex-col gap-1">
        <h2 id="jd-missing" className="text-lg font-semibold">
          {t('missingTitle')}
        </h2>
        {missing.length === 0 ? (
          <p className="text-sm text-muted">{t('missingNone')}</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {missing.map((s) => (
              <li key={s}>{sections(s)}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-4">
        {JD_SECTIONS.map((key) => {
          const section = jd.sections[key];
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`jd-${key}`} className="font-medium">
                  {t('summary', { section: sections(key) })}
                </label>
                <span
                  className={
                    section.status === 'missing' ? 'text-sm text-warning' : 'text-sm text-muted'
                  }
                >
                  {section.status === 'missing' ? t('sectionMissing') : t('sectionFound')}
                </span>
              </div>
              <textarea
                id={`jd-${key}`}
                rows={2}
                readOnly={readOnly}
                value={section.summary}
                onChange={(e) =>
                  emit({
                    ...jd,
                    sections: {
                      ...jd.sections,
                      [key]: {
                        status: e.target.value.trim() === '' ? 'missing' : 'found',
                        summary: e.target.value,
                      },
                    },
                  })
                }
                className="rounded-md border border-border bg-background p-2 text-sm"
              />
            </div>
          );
        })}
      </div>

      <section aria-labelledby="jd-reqs" className="flex flex-col gap-3">
        <h2 id="jd-reqs" className="text-lg font-semibold">
          {t('requirementsTitle')}
        </h2>
        {jd.requirements.length === 0 ? (
          <p className="text-sm text-muted">{t('requirementsNone')}</p>
        ) : null}
        <ol className="flex flex-col gap-2">
          {jd.requirements.map((r, index) => {
            const n = index + 1;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={t('requirementText', { n })}
                  readOnly={readOnly}
                  value={r.text}
                  onChange={(e) => setRequirement(index, { text: e.target.value })}
                  className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                />
                <select
                  aria-label={t('category', { n })}
                  disabled={readOnly}
                  value={r.category}
                  onChange={(e) =>
                    setRequirement(index, { category: e.target.value as RequirementCategoryValue })
                  }
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {REQUIREMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categories(c)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('section', { n })}
                  disabled={readOnly}
                  value={r.section}
                  onChange={(e) => setRequirement(index, { section: e.target.value as JdSection })}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {JD_SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {sections(s)}
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
                      disabled={index === jd.requirements.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      {'↓'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('remove', { n })}
                      onClick={() =>
                        emit({ ...jd, requirements: jd.requirements.filter((_, i) => i !== index) })
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
          <div
            role="group"
            aria-label={t('addTitle')}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              aria-label={t('newText')}
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
              {REQUIREMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categories(c)}
                </option>
              ))}
            </select>
            <select
              aria-label={t('newSection')}
              value={draft.section}
              onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value as JdSection }))}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {JD_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {sections(s)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={draft.text.trim() === ''}
              onClick={() => {
                emit({
                  ...jd,
                  requirements: [
                    ...jd.requirements,
                    {
                      id: crypto.randomUUID(),
                      section: draft.section,
                      text: draft.text.trim(),
                      category: draft.category,
                      quote: '',
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
    </div>
  );
}
