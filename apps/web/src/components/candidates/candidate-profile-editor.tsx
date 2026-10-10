// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PROFILE_TEXT_FIELDS,
  candidateProfileContentSchema,
  isInferred,
  type CandidateProfileContent,
  type Claim,
  type ProfileTextField,
} from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { Button } from '@/components/ui/button';

/** The profile schema allows at most this many education entries. */
const MAX_EDUCATION = 15;

const control = 'rounded-md border border-border bg-background p-2 text-sm';

/** The candidate profile as a form (US-202, brief 4.2): every field editable, inference labelled. */
export function CandidateProfileEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('candidates.profile');
  // Raw text of the skill lists, so a new line can be typed; only non-blank lines are saved.
  const [rawLists, setRawLists] = useState<
    Partial<Record<'coreSkills' | 'industryExperience' | 'technicalSkills', string>>
  >({});
  const parsed = candidateProfileContentSchema.safeParse(content);
  if (!parsed.success) return <p role="alert">{t('invalid')}</p>;
  const p = content as unknown as CandidateProfileContent;
  const emit = (next: CandidateProfileContent) =>
    onChange(next as unknown as Record<string, unknown>);
  const setText = (key: ProfileTextField, value: string) =>
    emit({ ...p, [key]: value === '' ? null : value });
  const lines = (key: 'coreSkills' | 'industryExperience' | 'technicalSkills') => ({
    value: rawLists[key] ?? p[key].join('\n'),
    onChange: (e: { target: { value: string } }) => {
      setRawLists((r) => ({ ...r, [key]: e.target.value }));
      emit({
        ...p,
        [key]: e.target.value
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      });
    },
  });

  const claimList = (key: 'majorAchievements' | 'potentialConcerns', label: string) => {
    const items = p[key];
    return (
      <section aria-labelledby={`pf-${key}`} className="flex flex-col gap-2">
        <h3 id={`pf-${key}`} className="font-medium">
          {label}
        </h3>
        <ul className="flex flex-col gap-2">
          {items.map((claim, index) => (
            <li key={index} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  aria-label={t('claimText', { label, n: index + 1 })}
                  readOnly={readOnly}
                  value={claim.text}
                  onChange={(e) =>
                    emit({
                      ...p,
                      [key]: items.map((c, i) =>
                        i === index ? { ...c, text: e.target.value } : c,
                      ),
                    })
                  }
                  className={`${control} min-w-64 flex-1`}
                />
                {readOnly ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('removeClaim', { label, n: index + 1 })}
                    onClick={() => emit({ ...p, [key]: items.filter((_, i) => i !== index) })}
                  >
                    {'×'}
                  </Button>
                )}
              </div>
              <Evidence claim={claim} />
            </li>
          ))}
        </ul>
        {readOnly ? null : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                emit({
                  ...p,
                  [key]: [
                    ...items,
                    {
                      text: t('newClaim'),
                      evidence: [{ type: 'inferred', rationale: t('addedByRecruiter') }],
                    },
                  ],
                })
              }
            >
              {t('addClaim', { label })}
            </Button>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {PROFILE_TEXT_FIELDS.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`pf-${key}`} className="text-sm font-medium">
              {t(`fields.${key}`)}
            </label>
            <input
              id={`pf-${key}`}
              readOnly={readOnly}
              value={p[key] ?? ''}
              onChange={(e) => setText(key, e.target.value)}
              className={control}
            />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label htmlFor="pf-title" className="text-sm font-medium">
            {t('fields.currentTitle')}
          </label>
          <input
            id="pf-title"
            readOnly={readOnly}
            value={p.currentPosition.title ?? ''}
            onChange={(e) =>
              emit({
                ...p,
                currentPosition: { ...p.currentPosition, title: e.target.value || null },
              })
            }
            className={control}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pf-company" className="text-sm font-medium">
            {t('fields.currentCompany')}
          </label>
          <input
            id="pf-company"
            readOnly={readOnly}
            value={p.currentPosition.company ?? ''}
            onChange={(e) =>
              emit({
                ...p,
                currentPosition: { ...p.currentPosition, company: e.target.value || null },
              })
            }
            className={control}
          />
        </div>
      </div>

      <section aria-labelledby="pf-career" className="flex flex-col gap-3">
        <h3 id="pf-career" className="font-medium">
          {t('career.title')}
        </h3>
        {p.careerHistory.length === 0 ? (
          <p className="text-sm text-muted">{t('career.none')}</p>
        ) : null}
        <ol className="flex flex-col gap-3">
          {p.careerHistory.map((job, index) => {
            const set = (patch: Partial<typeof job>) =>
              emit({
                ...p,
                careerHistory: p.careerHistory.map((j, i) =>
                  i === index ? { ...j, ...patch } : j,
                ),
              });
            return (
              <li key={index} className="flex flex-col gap-2 rounded-2xl border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <input
                    aria-label={t('career.company', { n: index + 1 })}
                    readOnly={readOnly}
                    value={job.company}
                    onChange={(e) => set({ company: e.target.value })}
                    className={control}
                  />
                  <input
                    aria-label={t('career.role', { n: index + 1 })}
                    readOnly={readOnly}
                    value={job.title}
                    onChange={(e) => set({ title: e.target.value })}
                    className={control}
                  />
                  <input
                    aria-label={t('career.start', { n: index + 1 })}
                    readOnly={readOnly}
                    value={job.start ?? ''}
                    onChange={(e) => set({ start: e.target.value || null })}
                    className={control}
                  />
                  <input
                    aria-label={t('career.end', { n: index + 1 })}
                    readOnly={readOnly}
                    value={job.end ?? ''}
                    onChange={(e) => set({ end: e.target.value || null })}
                    className={control}
                  />
                </div>
                <textarea
                  aria-label={t('career.summary', { n: index + 1 })}
                  rows={2}
                  readOnly={readOnly}
                  value={job.summary}
                  onChange={(e) => set({ summary: e.target.value })}
                  className={control}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={job.current}
                    onChange={(e) => set({ current: e.target.checked })}
                  />
                  {t('career.current')}
                </label>
                {readOnly ? null : (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('career.remove', { n: index + 1 })}
                      onClick={() =>
                        emit({ ...p, careerHistory: p.careerHistory.filter((_, i) => i !== index) })
                      }
                    >
                      {t('career.removeLabel')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {readOnly ? null : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                emit({
                  ...p,
                  careerHistory: [
                    ...p.careerHistory,
                    { company: '', title: '', start: null, end: null, current: false, summary: '' },
                  ],
                })
              }
            >
              {t('career.add')}
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="pf-education" className="flex flex-col gap-3">
        <h3 id="pf-education" className="font-medium">
          {t('education.title')}
        </h3>
        {p.education.length === 0 ? (
          <p className="text-sm text-muted">{t('education.none')}</p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {p.education.map((entry, index) => {
            const set = (patch: Partial<typeof entry>) =>
              emit({
                ...p,
                education: p.education.map((e, i) => (i === index ? { ...e, ...patch } : e)),
              });
            return (
              <li key={index} className="flex flex-col gap-2 rounded-2xl border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    aria-label={t('education.school', { n: index + 1 })}
                    readOnly={readOnly}
                    maxLength={160}
                    value={entry.school}
                    onChange={(e) => set({ school: e.target.value })}
                    className={control}
                  />
                  <input
                    aria-label={t('education.degree', { n: index + 1 })}
                    readOnly={readOnly}
                    maxLength={160}
                    value={entry.degree}
                    onChange={(e) => set({ degree: e.target.value })}
                    className={control}
                  />
                  <input
                    aria-label={t('education.year', { n: index + 1 })}
                    readOnly={readOnly}
                    maxLength={20}
                    value={entry.year ?? ''}
                    onChange={(e) => set({ year: e.target.value || null })}
                    className={control}
                  />
                </div>
                {readOnly ? null : (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('education.remove', { n: index + 1 })}
                      onClick={() =>
                        emit({ ...p, education: p.education.filter((_, i) => i !== index) })
                      }
                    >
                      {t('education.removeLabel')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {readOnly || p.education.length >= MAX_EDUCATION ? null : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                emit({ ...p, education: [...p.education, { school: '', degree: '', year: null }] })
              }
            >
              {t('education.add')}
            </Button>
          </div>
        )}
      </section>

      {(['coreSkills', 'industryExperience', 'technicalSkills'] as const).map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <label htmlFor={`pf-${key}`} className="text-sm font-medium">
            {t(`lists.${key}`)}
          </label>
          <textarea
            id={`pf-${key}`}
            rows={3}
            readOnly={readOnly}
            {...lines(key)}
            className={control}
          />
          <span className="text-xs text-muted">{t('listHint')}</span>
        </div>
      ))}

      {claimList('majorAchievements', t('claims.majorAchievements'))}

      <section aria-labelledby="pf-motivation" className="flex flex-col gap-2">
        <h3 id="pf-motivation" className="font-medium">
          {t('claims.potentialMotivation')}
        </h3>
        {p.potentialMotivation ? (
          <>
            <input
              aria-label={t('claims.potentialMotivation')}
              readOnly={readOnly}
              value={p.potentialMotivation.text}
              onChange={(e) =>
                emit({
                  ...p,
                  potentialMotivation: { ...p.potentialMotivation!, text: e.target.value },
                })
              }
              className={control}
            />
            <Evidence claim={p.potentialMotivation} />
          </>
        ) : (
          <p className="text-sm text-muted">{t('claims.none')}</p>
        )}
      </section>

      {claimList('potentialConcerns', t('claims.potentialConcerns'))}
    </div>
  );
}

/** Where a claim comes from: the quoted words, or a clear "AI inference" label. */
function Evidence({ claim }: { claim: Claim }) {
  const t = useTranslations('candidates.profile');
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      {isInferred(claim) ? (
        <span className="rounded bg-warning/20 px-1.5 py-0.5 font-medium">{t('inference')}</span>
      ) : null}
      {claim.evidence.map((e, i) =>
        e.type === 'quote' ? (
          <q key={i}>{e.excerpt}</q>
        ) : e.rationale ? (
          <span key={i}>{e.rationale}</span>
        ) : null,
      )}
    </div>
  );
}
