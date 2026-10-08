// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { SUBMISSION_METHODS } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { SubmissionOverview } from '@/server/submission/submit';

const today = () => new Date().toISOString().slice(0, 10);

/** Records the submission to the client (US-802, FR-SUB-03), after the report and resume are approved with PDFs. */
export function SubmissionPanel({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.submission');
  const guardNames = useTranslations('pipeline.submission.guards');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/pipeline/${entryId}/submissions`;
  const key = ['submissions', agencyId, entryId];
  const view = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<SubmissionOverview>(url, { signal }),
  });
  const [form, setForm] = useState({
    toContactId: '',
    method: 'email',
    submittedAt: today(),
    duplicateReason: '',
  });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guards, setGuards] = useState<
    { guard: string; mode: 'block' | 'warn'; message: string }[]
  >([]);
  const o = view.data?.data;

  const submit = useMutation({
    mutationFn: (overrides: { guard: string; reason: string }[] = []) =>
      apiFetch(url, {
        body: {
          reportVersionId: o!.report!.versionId,
          tailoredResumeId: o!.resume!.tailoredResumeId,
          toContactId: form.toContactId,
          method: form.method,
          submittedAt: new Date(`${form.submittedAt}T12:00:00Z`).toISOString(),
          ...(form.duplicateReason.trim() ? { duplicateReason: form.duplicateReason.trim() } : {}),
          ...(overrides.length ? { overrideGuards: overrides } : {}),
        },
      }),
    onSuccess: async () => {
      setError(null);
      setGuards([]);
      toast({ title: t('recorded') });
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-entry', agencyId, entryId] });
      await onChanged();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === 'guard_failed') {
        setError(null);
        setGuards(e.guards);
        return;
      }
      setGuards([]);
      setError(
        e instanceof ApiClientError && e.code === 'pdf_missing'
          ? t('pdfMissing')
          : e instanceof ApiClientError && e.status === 409 && e.code !== 'duplicate_submission'
            ? t('changed')
            : e instanceof ApiClientError && e.code === 'duplicate_submission'
              ? null
              : t('error'),
      );
    },
  });
  if (!o) return null;
  const date = (d: string | Date) => format.dateTime(new Date(d), { dateStyle: 'medium' });
  const ready = Boolean(o.report?.pdfFileId && o.resume?.pdfFileId);
  const needsReason = o.earlierToClient.length > 0;
  const canOverride = guards.length > 0 && guards.every((g) => g.mode === 'warn');
  const check = (ok: boolean) => (ok ? t('done') : t('todo'));

  return (
    <section aria-labelledby="submission-heading" className="flex max-w-2xl flex-col gap-4">
      <div>
        <h2 id="submission-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('hint')}</p>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt>{t('reportReady')}</dt>
        <dd>{check(Boolean(o.report))}</dd>
        <dt>{t('reportPdf')}</dt>
        <dd>{check(Boolean(o.report?.pdfFileId))}</dd>
        <dt>{t('resumeReady')}</dt>
        <dd>{check(Boolean(o.resume))}</dd>
        <dt>{t('resumePdf')}</dt>
        <dd>{check(Boolean(o.resume?.pdfFileId))}</dd>
      </dl>

      {o.state === 'candidate_approved' ? (
        <div className="flex max-w-md flex-col gap-2">
          {o.contacts.length === 0 ? <p className="text-sm text-muted">{t('noContacts')}</p> : null}
          <SelectField
            label={t('contact')}
            value={form.toContactId}
            onChange={(e) => setForm((f) => ({ ...f, toContactId: e.target.value }))}
          >
            <option value="">{t('contactNone')}</option>
            {o.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title ? [c.name, c.title].join(', ') : c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('method')}
            value={form.method}
            onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
          >
            {SUBMISSION_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`methods.${m}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('submittedAt')}
            type="date"
            value={form.submittedAt}
            max={today()}
            onChange={(e) => setForm((f) => ({ ...f, submittedAt: e.target.value }))}
          />
          {needsReason ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-border p-3 text-sm"
            >
              <p className="font-medium">{t('duplicateTitle', { client: o.clientName })}</p>
              <ul>
                {o.earlierToClient.map((e) => (
                  <li key={`${e.positionTitle}-${String(e.submittedAt)}`}>
                    {t('duplicateLine', { title: e.positionTitle, date: date(e.submittedAt) })}
                  </li>
                ))}
              </ul>
              <TextField
                label={t('duplicateReason')}
                value={form.duplicateReason}
                onChange={(e) => setForm((f) => ({ ...f, duplicateReason: e.target.value }))}
              />
            </div>
          ) : null}
          {guards.length > 0 ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-border p-3 text-sm"
            >
              <p className="font-medium">{t('guardTitle')}</p>
              <p>{canOverride ? t('guardWarn') : t('guardBlocked')}</p>
              <ul className="flex flex-col gap-2">
                {guards.map((g) => (
                  <li key={g.guard} className="flex flex-col gap-1">
                    <span>{guardNames(g.guard as 'consent')}</span>
                    {canOverride ? (
                      <TextField
                        label={t('guardReason', { guard: guardNames(g.guard as 'consent') })}
                        value={reasons[g.guard] ?? ''}
                        onChange={(e) => setReasons((r) => ({ ...r, [g.guard]: e.target.value }))}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
              {canOverride ? (
                <div>
                  <Button
                    variant="secondary"
                    disabled={guards.some((g) => (reasons[g.guard] ?? '').trim().length < 3)}
                    onClick={() =>
                      submit.mutate(
                        guards.map((g) => ({ guard: g.guard, reason: reasons[g.guard]!.trim() })),
                      )
                    }
                  >
                    {t('guardGo')}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Button
              disabled={
                submit.isPending ||
                !ready ||
                form.toContactId === '' ||
                (needsReason && form.duplicateReason.trim().length < 3)
              }
              onClick={() => submit.mutate([])}
            >
              {t('submit')}
            </Button>
          </div>
        </div>
      ) : null}

      {o.submissions.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{t('history')}</h3>
          <ul className="text-sm">
            {o.submissions.map((s) => (
              <li key={s.id}>
                {t('historyLine', {
                  name: s.toContactName ?? '',
                  method: t(`methods.${s.method as 'email'}`),
                  date: date(s.submittedAt),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
