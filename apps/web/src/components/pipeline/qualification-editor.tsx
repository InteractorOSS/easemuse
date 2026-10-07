// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import {
  LEVEL_TOPICS,
  QUALIFICATION_LEVELS,
  QUALIFICATION_TOPICS,
  qualificationContentSchema,
  unconfirmedTopics,
  type QualificationField,
  type QualificationLevel,
  type QualificationTopic,
} from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { SelectField, TextField } from '@/components/ui/field';

const isLevelTopic = (k: QualificationTopic) => (LEVEL_TOPICS as readonly string[]).includes(k);

/** The qualification record as a form; each filled field is confirmed by the recruiter (US-602). */
export function QualificationEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('pipeline.qualification');
  const parsed = qualificationContentSchema.safeParse(content);
  if (!parsed.success) return null;
  // Edit the raw content so typed spaces are kept; the parsed copy is only for reading.
  const raw = content as {
    fields?: Partial<Record<QualificationTopic, Partial<QualificationField>>>;
    notes?: string;
  };
  const fieldOf = (k: QualificationTopic) => ({ ...parsed.data.fields[k], ...raw.fields?.[k] });
  const set = (k: QualificationTopic, patch: Partial<QualificationField>) =>
    onChange({
      ...content,
      fields: {
        ...parsed.data.fields,
        ...raw.fields,
        // Changing what was said means it has to be checked again.
        [k]: { ...fieldOf(k), ...patch, ...('confirmed' in patch ? {} : { confirmed: false }) },
      },
    });
  const open = unconfirmedTopics(parsed.data);

  return (
    <div className="flex flex-col gap-4">
      {open.length > 0 ? <p className="text-sm text-muted">{t('unconfirmed')}</p> : null}
      <ul className="flex flex-col gap-3">
        {QUALIFICATION_TOPICS.map((k) => {
          const f = fieldOf(k);
          const label = t(`topics.${k}`);
          return (
            <li key={k} className="grid gap-2 sm:grid-cols-[12rem_1fr_8rem_auto] sm:items-end">
              <span className="text-sm font-medium">
                {label}
                {f.inferred ? (
                  <span className="block text-xs text-muted">{t('inferred')}</span>
                ) : null}
              </span>
              <TextField
                label={t('value')}
                readOnly={readOnly}
                value={f.value ?? ''}
                onChange={(e) => set(k, { value: e.target.value, inferred: false })}
              />
              {isLevelTopic(k) ? (
                <SelectField
                  label={t('level')}
                  disabled={readOnly}
                  value={f.level ?? ''}
                  onChange={(e) =>
                    set(k, { level: (e.target.value || null) as QualificationLevel | null })
                  }
                >
                  <option value="">{t('levels.none')}</option>
                  {QUALIFICATION_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {t(`levels.${l}`)}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <span />
              )}
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  aria-label={t('confirmField', { topic: label })}
                  checked={Boolean(f.confirmed)}
                  onChange={(e) => set(k, { confirmed: e.target.checked })}
                />
                {t('confirm')}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-1">
        <label htmlFor="qual-notes" className="text-sm font-medium">
          {t('notesStored')}
        </label>
        <textarea
          id="qual-notes"
          rows={5}
          readOnly={readOnly}
          value={raw.notes ?? ''}
          onChange={(e) => onChange({ ...content, notes: e.target.value })}
          className="rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>
    </div>
  );
}
