// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  QUESTION_TOPICS,
  intakeQuestionsContentSchema,
  type IntakeQuestionsContent,
  type QuestionTopic,
} from '@easemuse/core';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/** The question list as plain text, grouped by topic, for sending or pasting into an email. */
export function questionsAsText(
  content: IntakeQuestionsContent,
  topicLabel: (t: QuestionTopic) => string,
): string {
  return QUESTION_TOPICS.flatMap((topic) => {
    const items = content.questions.filter((q) => q.topic === topic);
    return items.length
      ? [topicLabel(topic), ...items.map((q, i) => `${i + 1}. ${q.question}`), '']
      : [];
  })
    .join('\n')
    .trim();
}

/** The intake questions as an editable list (US-104): edit, reorder, add, delete, copy and download. */
export function IntakeQuestionsEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('positions.questionsEditor');
  const { toast } = useToast();
  const parsed = intakeQuestionsContentSchema.safeParse(content);
  const [draft, setDraft] = useState({ text: '', topic: 'business_reason' as QuestionTopic });
  if (!parsed.success) return <p role="alert">{t('invalid')}</p>;
  const list = parsed.data;
  const emit = (next: IntakeQuestionsContent) =>
    onChange(next as unknown as Record<string, unknown>);
  const set = (index: number, patch: Partial<IntakeQuestionsContent['questions'][number]>) =>
    emit({ questions: list.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) });
  const move = (index: number, by: -1 | 1) => {
    const next = [...list.questions];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    emit({ questions: next });
  };
  const text = () => questionsAsText(list, (topic) => t(`topics.${topic}`));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(text()).catch(() => undefined);
            toast({ title: t('copied') });
          }}
        >
          {t('copy')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([text()], { type: 'text/plain;charset=utf-8' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = 'intake-questions.txt';
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t('download')}
        </Button>
      </div>
      {list.questions.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
      <ol className="flex flex-col gap-3">
        {list.questions.map((q, index) => {
          const n = index + 1;
          return (
            <li key={q.id} className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t(`topics.${q.topic}`)}</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={t('question', { n })}
                  readOnly={readOnly}
                  value={q.question}
                  onChange={(e) => set(index, { question: e.target.value })}
                  className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                />
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
                      disabled={index === list.questions.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      {'↓'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('remove', { n })}
                      onClick={() =>
                        emit({ questions: list.questions.filter((_, i) => i !== index) })
                      }
                    >
                      {'×'}
                    </Button>
                  </>
                )}
              </div>
              {q.reason ? (
                <span className="text-xs text-muted">{t('reason', { reason: q.reason })}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {readOnly ? null : (
        <div role="group" aria-label={t('add')} className="flex flex-wrap items-center gap-2">
          <input
            aria-label={t('newQuestion')}
            value={draft.text}
            onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
            className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          />
          <select
            aria-label={t('newTopic')}
            value={draft.topic}
            onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value as QuestionTopic }))}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {QUESTION_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {t(`topics.${topic}`)}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={draft.text.trim() === ''}
            onClick={() => {
              emit({
                questions: [
                  ...list.questions,
                  {
                    id: crypto.randomUUID(),
                    topic: draft.topic,
                    question: draft.text.trim(),
                    reason: '',
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
    </div>
  );
}
