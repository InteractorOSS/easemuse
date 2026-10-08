// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { TASK_SCOPES, type TaskScope } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { TaskView } from '@/server/tasks/service';

const DAY = 24 * 60 * 60 * 1000;
/** Snooze choices: how many days ahead, at 09:00 UTC of that day. */
const SNOOZES = [
  { key: 'tomorrow', days: 1 },
  { key: 'threeDays', days: 3 },
  { key: 'nextWeek', days: 7 },
] as const;

function snoozeUntil(days: number): string {
  const d = new Date(Date.now() + days * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9)).toISOString();
}

/** "My tasks today" (US-006): the person's own reminders. Nothing here sends or changes anything by itself. */
export function TasksView({ agencyId }: { agencyId: string }) {
  const t = useTranslations('tasks');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<TaskScope>('today');

  const query = useQuery({
    queryKey: ['tasks', agencyId, scope],
    queryFn: ({ signal }) =>
      apiFetch<TaskView[]>(`/api/v1/agencies/${agencyId}/tasks?scope=${scope}`, { signal }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tasks', agencyId] });
  const onError = () => toast({ title: t('errors.generic'), variant: 'danger' });
  const complete = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/agencies/${agencyId}/tasks/${id}/complete`, { method: 'POST' }),
    onSuccess: refresh,
    onError,
  });
  const snooze = useMutation({
    mutationFn: (v: { id: string; days: number }) =>
      apiFetch(`/api/v1/agencies/${agencyId}/tasks/${v.id}/snooze`, {
        body: { until: snoozeUntil(v.days) },
      }),
    onSuccess: refresh,
    onError,
  });

  const tasks = query.data?.data ?? [];
  const date = (d: Date | string) => format.dateTime(new Date(d), { dateStyle: 'medium' });
  const name = (task: TaskView) =>
    `${t(`kinds.${task.kind}`)}${task.entityLabel ? `: ${task.entityLabel}` : ''}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <div role="group" aria-label={t('scope.label')} className="flex gap-1">
          {TASK_SCOPES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === scope ? 'primary' : 'secondary'}
              aria-pressed={s === scope}
              onClick={() => setScope(s)}
            >
              {t(`scope.${s}`)}
            </Button>
          ))}
        </div>
      </div>

      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && tasks.length === 0 ? (
        <p className="text-muted">{t(`empty.${scope}`)}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3"
          >
            <div className="flex flex-col text-sm">
              <span className="font-medium">{name(task)}</span>
              <span className="text-muted">
                {task.overdue ? <strong className="text-danger">{t('overdue')} · </strong> : null}
                {t('due', { date: date(task.dueAt) })}
                {task.snoozedUntil
                  ? ` · ${t('snoozedUntil', { date: date(task.snoozedUntil) })}`
                  : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label={t('snooze.for', { task: name(task) })}
                value=""
                disabled={snooze.isPending}
                onChange={(e) => {
                  const choice = SNOOZES.find((s) => s.key === e.target.value);
                  if (choice) snooze.mutate({ id: task.id, days: choice.days });
                }}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">{t('snooze.label')}</option>
                {SNOOZES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {t(`snooze.${s.key}`)}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={complete.isPending}
                aria-label={t('completeFor', { task: name(task) })}
                onClick={() => complete.mutate(task.id)}
              >
                {t('complete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
