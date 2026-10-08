// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { tailoredResumeContentSchema, type TailoredResumeContent } from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { TextField } from '@/components/ui/field';

/** The tailored resume as a form, with each role's original wording beside the tailored bullets (US-701, 9.1). */
export function ResumeEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('pipeline.resume');
  const parsed = tailoredResumeContentSchema.safeParse(content);
  // Raw text for the line-based boxes, so a new line can be typed; only non-blank lines are saved.
  const [bullets, setBullets] = useState<string[]>(() =>
    parsed.success ? parsed.data.roles.map((r) => r.bullets.join('\n')) : [],
  );
  const [skills, setSkills] = useState(() => (parsed.success ? parsed.data.skills.join('\n') : ''));
  if (!parsed.success) return null;
  const resume = content as unknown as TailoredResumeContent;
  const emit = (next: TailoredResumeContent) =>
    onChange(next as unknown as Record<string, unknown>);
  const lines = (value: string) => value.split('\n').filter((l) => l.trim() !== '');
  const field = 'rounded-md border border-border bg-background p-2 text-sm';

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">{t('factsLocked')}</p>
      {parsed.data.blind ? null : (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">{t('identity')}</legend>
          {(['name', 'email', 'phone', 'location'] as const).map((k) => (
            <TextField
              key={k}
              label={t(k)}
              readOnly={readOnly}
              value={resume.header?.[k] ?? ''}
              onChange={(e) =>
                emit({ ...resume, header: { ...resume.header, [k]: e.target.value || null } })
              }
            />
          ))}
        </fieldset>
      )}
      <TextField
        label={t('headline')}
        readOnly={readOnly}
        value={resume.headline ?? ''}
        onChange={(e) => emit({ ...resume, headline: e.target.value })}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="resume-summary" className="text-sm font-medium">
          {t('summary')}
        </label>
        <textarea
          id="resume-summary"
          rows={4}
          readOnly={readOnly}
          value={resume.summary ?? ''}
          onChange={(e) => emit({ ...resume, summary: e.target.value })}
          className={field}
        />
      </div>

      <section aria-labelledby="resume-roles" className="flex flex-col gap-4">
        <h3 id="resume-roles" className="font-semibold">
          {t('roles')}
        </h3>
        {parsed.data.roles.map((role, index) => (
          <div
            key={`${role.company}-${index}`}
            className="flex flex-col gap-2 rounded-2xl border border-border p-3"
          >
            <p className="font-medium">
              {t('roleTitle', { title: role.title, company: role.company })}
            </p>
            <p className="text-sm text-muted">
              {t('dates', {
                start: role.start ?? t('unknown'),
                end: role.current ? t('present') : (role.end ?? t('unknown')),
              })}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium">{t('original')}</p>
                <p className="whitespace-pre-wrap text-sm text-muted">{role.original}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`resume-bullets-${index}`} className="text-sm font-medium">
                  {t('bullets', { title: role.title, company: role.company })}
                </label>
                <textarea
                  id={`resume-bullets-${index}`}
                  rows={5}
                  readOnly={readOnly}
                  value={bullets[index] ?? ''}
                  onChange={(e) => {
                    setBullets((b) => b.map((x, i) => (i === index ? e.target.value : x)));
                    emit({
                      ...resume,
                      roles: resume.roles.map((r, i) =>
                        i === index ? { ...r, bullets: lines(e.target.value) } : r,
                      ),
                    });
                  }}
                  className={field}
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      {parsed.data.education.length > 0 ? (
        <section aria-labelledby="resume-edu" className="flex flex-col gap-1">
          <h3 id="resume-edu" className="font-semibold">
            {t('education')}
          </h3>
          <ul className="text-sm">
            {parsed.data.education.map((e, i) => (
              <li key={i}>{[e.degree, e.school, e.year].filter(Boolean).join(', ')}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="resume-skills" className="text-sm font-medium">
          {t('skills')}
        </label>
        <textarea
          id="resume-skills"
          rows={4}
          readOnly={readOnly}
          value={skills}
          onChange={(e) => {
            setSkills(e.target.value);
            emit({ ...resume, skills: lines(e.target.value) });
          }}
          className={field}
        />
        <p className="text-xs text-muted">{t('skillsHint')}</p>
      </div>
    </div>
  );
}
