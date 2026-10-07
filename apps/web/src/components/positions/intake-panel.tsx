// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { APPROVAL_METHODS, INTAKE_TOPICS, type IntakeTopic } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { IntakeView } from '@/server/positions/intake';

/** The ten intake topics (brief 3.4) and the recorded hiring manager decision on the JD (US-106). */
export function IntakePanel({
  agencyId,
  positionId,
  canEdit,
}: {
  agencyId: string;
  positionId: string;
  canEdit: boolean;
}) {
  const states = useTranslations('common.states');
  const path = `/api/v1/agencies/${agencyId}/positions/${positionId}`;
  const query = useQuery({
    queryKey: ['intake', agencyId, positionId],
    queryFn: ({ signal }) => apiFetch<IntakeView>(`${path}/intake`, { signal }),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  return (
    <div className="flex flex-col gap-8">
      <IntakeForm
        agencyId={agencyId}
        positionId={positionId}
        view={query.data.data}
        canEdit={canEdit}
      />
      <ApprovalSection
        agencyId={agencyId}
        positionId={positionId}
        view={query.data.data}
        canEdit={canEdit}
      />
    </div>
  );
}

type Texts = Record<IntakeTopic, string>;

function IntakeForm({
  agencyId,
  positionId,
  view,
  canEdit,
}: {
  agencyId: string;
  positionId: string;
  view: IntakeView;
  canEdit: boolean;
}) {
  const t = useTranslations('positions.intake');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Texts>(
    () => Object.fromEntries(INTAKE_TOPICS.map((k) => [k, view.answers[k]?.value ?? ''])) as Texts,
  );
  const [stages, setStages] = useState((view.answers.interview_process?.stages ?? []).join('\n'));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const answers: Record<string, { value: string; stages?: string[] }> = {};
      for (const topic of INTAKE_TOPICS) {
        const value = values[topic].trim();
        const known = view.answers[topic];
        if (value === '' && !known) continue; // nothing entered, nothing to save
        answers[topic] = { value };
      }
      const list = stages
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length > 0 || view.answers.interview_process?.stages) {
        answers.interview_process = { value: values.interview_process.trim(), stages: list };
      }
      return apiFetch(`/api/v1/agencies/${agencyId}/positions/${positionId}/intake`, {
        method: 'PUT',
        body: { answers },
      });
    },
    onSuccess: async () => {
      setError(null);
      toast({ title: t('saved') });
      await queryClient.invalidateQueries({ queryKey: ['intake', agencyId, positionId] });
      await queryClient.invalidateQueries({
        queryKey: ['timeline', agencyId, 'position', positionId],
      });
    },
    onError: () => setError(t('errors.generic')),
  });
  return (
    <section aria-labelledby="intake-heading" className="flex max-w-2xl flex-col gap-4">
      <h2 id="intake-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro')}</p>
      {INTAKE_TOPICS.map((topic) => (
        <div key={topic} className="flex flex-col gap-1">
          <label htmlFor={`intake-${topic}`} className="text-sm font-medium">
            {t(`topics.${topic}`)}
          </label>
          <textarea
            id={`intake-${topic}`}
            rows={3}
            readOnly={!canEdit}
            value={values[topic]}
            onChange={(e) => setValues((v) => ({ ...v, [topic]: e.target.value }))}
            className="rounded-md border border-border bg-background p-2 text-sm"
          />
          {topic === 'interview_process' ? (
            <>
              <label htmlFor="intake-stages" className="text-sm text-muted">
                {t('stages')}
              </label>
              <textarea
                id="intake-stages"
                rows={3}
                readOnly={!canEdit}
                value={stages}
                onChange={(e) => setStages(e.target.value)}
                className="rounded-md border border-border bg-background p-2 text-sm"
              />
            </>
          ) : null}
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <div>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ApprovalSection({
  agencyId,
  positionId,
  view,
  canEdit,
}: {
  agencyId: string;
  positionId: string;
  view: IntakeView;
  canEdit: boolean;
}) {
  const t = useTranslations('positions.approval');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    decision: 'approved',
    approverName: '',
    method: 'email',
    decidedAt: today,
    comments: '',
  });
  const [error, setError] = useState<string | null>(null);
  const record = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/agencies/${agencyId}/positions/${positionId}/jd-approval`, {
        body: {
          decision: form.decision,
          approverName: form.approverName,
          method: form.method,
          decidedAt: new Date(`${form.decidedAt}T00:00:00Z`).toISOString(),
          ...(form.comments.trim() ? { comments: form.comments.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      setError(null);
      setForm((f) => ({ ...f, approverName: '', comments: '' }));
      toast({ title: t('saved') });
      await queryClient.invalidateQueries({ queryKey: ['intake', agencyId, positionId] });
      await queryClient.invalidateQueries({
        queryKey: ['timeline', agencyId, 'position', positionId],
      });
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && e.status === 409
          ? t('errors.notApproved')
          : t('errors.generic'),
      ),
  });
  const a = view.jdApproval;
  return (
    <section aria-labelledby="approval-heading" className="flex max-w-2xl flex-col gap-3">
      <h2 id="approval-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro')}</p>
      {a ? (
        <>
          <p>
            {t('latest', {
              decision: t(`decisions.${a.decision}`),
              name: a.approverName,
              date: format.dateTime(new Date(a.decidedAt), { dateStyle: 'medium' }),
              method: a.method ? t(`methods.${a.method as 'email'}`) : '',
            })}
          </p>
          {a.current ? null : <p className="text-warning">{t('outOfDate')}</p>}
        </>
      ) : (
        <p className="text-muted">{t('none')}</p>
      )}
      {canEdit ? (
        <form
          noValidate
          aria-label={t('title')}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            record.mutate();
          }}
        >
          <SelectField
            label={t('form.decision')}
            value={form.decision}
            onChange={(e) => setForm((f) => ({ ...f, decision: e.target.value }))}
          >
            {(['approved', 'changes_requested'] as const).map((d) => (
              <option key={d} value={d}>
                {t(`decisions.${d}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('form.approverName')}
            value={form.approverName}
            onChange={(e) => setForm((f) => ({ ...f, approverName: e.target.value }))}
          />
          <SelectField
            label={t('form.method')}
            value={form.method}
            onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
          >
            {APPROVAL_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`methods.${m}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('form.decidedAt')}
            type="date"
            max={today}
            value={form.decidedAt}
            onChange={(e) => setForm((f) => ({ ...f, decidedAt: e.target.value }))}
          />
          <TextField
            label={t('form.comments')}
            value={form.comments}
            onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Button
              type="submit"
              disabled={record.isPending || form.approverName.trim().length < 2}
            >
              {t('form.submit')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
