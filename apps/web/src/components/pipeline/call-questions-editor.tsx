// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  CALL_QUESTION_TOPICS,
  callQuestionsContentSchema,
  type CallQuestionTopic,
} from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

/** The call question list as an editable, copyable list (US-601). */
export function CallQuestionsEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('pipeline.qualification');
  const { toast } = useToast();
  const parsed = callQuestionsContentSchema.safeParse(content);
  const [draft, setDraft] = useState({ text: '', topic: 'interest' as CallQuestionTopic });
  if (!parsed.success) return null;
  const questions =
    (content as { questions?: { id: string; topic: CallQuestionTopic; question: string }[] })
      .questions ?? [];
  const emit = (next: typeof questions) => onChange({ ...content, questions: next });
  const copy = async () => {
    await navigator.clipboard.writeText(
      questions.map((q, i) => `${i + 1}. [${t(`topics.${q.topic}`)}] ${q.question}`).join('\n'),
    );
    toast({ title: t('copied') });
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {questions.map((q, index) => (
          <li key={q.id} className="flex flex-wrap items-center gap-2">
            <span className="w-48 text-sm text-muted">{t(`topics.${q.topic}`)}</span>
            <input
              aria-label={t('question', { n: index + 1 })}
              readOnly={readOnly}
              value={q.question}
              onChange={(e) =>
                emit(questions.map((x) => (x.id === q.id ? { ...x, question: e.target.value } : x)))
              }
              className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-sm"
            />
            {readOnly ? null : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('remove', { n: index + 1 })}
                onClick={() => emit(questions.filter((x) => x.id !== q.id))}
              >
                {'×'}
              </Button>
            )}
          </li>
        ))}
      </ol>
      {readOnly ? null : (
        <div role="group" aria-label={t('addQuestion')} className="flex flex-wrap items-end gap-2">
          <SelectField
            label={t('newTopic')}
            value={draft.topic}
            onChange={(e) =>
              setDraft((d) => ({ ...d, topic: e.target.value as CallQuestionTopic }))
            }
          >
            {CALL_QUESTION_TOPICS.map((k) => (
              <option key={k} value={k}>
                {t(`topics.${k}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('newQuestion')}
            value={draft.text}
            onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          />
          <Button
            size="sm"
            disabled={draft.text.trim().length < 3}
            onClick={() => {
              emit([
                ...questions,
                { id: crypto.randomUUID(), topic: draft.topic, question: draft.text.trim() },
              ]);
              setDraft((d) => ({ ...d, text: '' }));
            }}
          >
            {t('add')}
          </Button>
        </div>
      )}
      <div>
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          {t('copyQuestions')}
        </Button>
      </div>
    </div>
  );
}
