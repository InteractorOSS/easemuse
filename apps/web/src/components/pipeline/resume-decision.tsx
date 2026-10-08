// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { APPROVAL_METHODS, CONSENT_ACTIONS } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { dayAsInstant, localDay } from '@/lib/dates';
import type { ApprovalsOverview } from '@/server/resume/approval';

/** The candidate's answer on the approved resume, and the consent to submit to this client (US-702, brief 9.2). */
export function ResumeDecision({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.resume');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;
  const key = ['resume-approvals', agencyId, entryId];
  const view = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<ApprovalsOverview & { candidateId: string }>(
        `${base}/pipeline/${entryId}/approvals`,
        {
          signal,
        },
      ),
  });
  const entry = useQuery({
    queryKey: ['pipeline-entry', agencyId, entryId],
    queryFn: ({ signal }) =>
      apiFetch<{ candidateId: string }>(`${base}/pipeline/${entryId}`, { signal }),
  });
  const [form, setForm] = useState({
    decision: 'approved',
    approverName: '',
    method: 'email',
    decidedAt: localDay(),
    comments: '',
  });
  const [consent, setConsent] = useState({ action: 'given', method: 'email', at: localDay() });
  const done = async (title: string) => {
    toast({ title });
    await queryClient.invalidateQueries({ queryKey: key });
    await onChanged();
  };
  const record = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/pipeline/${entryId}/approvals`, {
        body: {
          decision: form.decision,
          approverName: form.approverName.trim(),
          method: form.method,
          decidedAt: dayAsInstant(form.decidedAt),
          ...(form.comments.trim() ? { comments: form.comments.trim() } : {}),
        },
      }),
    onSuccess: () => done(t('recorded')),
  });
  const o = view.data?.data;
  const candidateId = entry.data?.data.candidateId;
  const recordConsent = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/candidates/${candidateId}/consents`, {
        body: {
          clientId: o!.clientId,
          action: consent.action,
          method: consent.method,
          at: dayAsInstant(consent.at),
        },
      }),
    onSuccess: () => done(t('consentRecorded')),
  });
  if (!o) return null;
  const date = (d: string | Date) => format.dateTime(new Date(d), { dateStyle: 'medium' });
  const method = (m: string | null) => (m ? t(`methods.${m as 'email'}`) : '');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-md flex-col gap-2">
        <h3 className="font-medium">{t('approvalTitle')}</h3>
        <p className="text-sm text-muted">{t('approvalHint')}</p>
        {o.resumeVersionId ? (
          <>
            <SelectField
              label={t('decision')}
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
              label={t('approver')}
              value={form.approverName}
              placeholder={o.candidateName}
              onChange={(e) => setForm((f) => ({ ...f, approverName: e.target.value }))}
            />
            <SelectField
              label={t('method')}
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
              label={t('decidedAt')}
              type="date"
              value={form.decidedAt}
              max={localDay()}
              onChange={(e) => setForm((f) => ({ ...f, decidedAt: e.target.value }))}
            />
            <TextField
              label={t('comments')}
              value={form.comments}
              onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
            />
            <div>
              <Button
                disabled={record.isPending || form.approverName.trim().length < 2}
                onClick={() => record.mutate()}
              >
                {t('record')}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{t('approvalNeeded')}</p>
        )}
        {o.approvals.length === 0 ? (
          <p className="text-sm text-muted">{t('none')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {o.approvals.map((a) => (
              <li key={a.id}>
                {t('decisionLine', {
                  decision: t(`decisions.${a.decision}`),
                  name: a.approverName,
                  date: date(a.decidedAt),
                  method: method(a.method),
                })}
                {a.current ? '' : ` ${t('outdated')}`}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex max-w-md flex-col gap-2">
        <h3 className="font-medium">{t('consentTitle', { client: o.clientName })}</h3>
        <SelectField
          label={t('consentAction')}
          value={consent.action}
          onChange={(e) => setConsent((c) => ({ ...c, action: e.target.value }))}
        >
          {CONSENT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {t(`consentActions.${a}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('method')}
          value={consent.method}
          onChange={(e) => setConsent((c) => ({ ...c, method: e.target.value }))}
        >
          {APPROVAL_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('decidedAt')}
          type="date"
          value={consent.at}
          max={localDay()}
          onChange={(e) => setConsent((c) => ({ ...c, at: e.target.value }))}
        />
        <div>
          <Button
            variant="secondary"
            disabled={recordConsent.isPending || !candidateId}
            onClick={() => recordConsent.mutate()}
          >
            {t('recordConsent')}
          </Button>
        </div>
        {o.consents.length === 0 ? (
          <p className="text-sm text-muted">{t('consentNone')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {o.consents.map((c) => (
              <li key={c.id}>
                {t('consentLine', {
                  action: t(`consentActions.${c.action as 'given'}`),
                  date: date(c.at),
                  method: method(c.method),
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
