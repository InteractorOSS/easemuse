// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { POSITION_TRANSITIONS, REASON_REQUIRED, type PositionStatus } from '@easemuse/core';
import { EntityTimeline } from '@/components/activity/entity-timeline';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { PositionView } from '@/server/positions/service';
import { PositionForm } from './position-form';

/** The position page shell (T-1-04): details, edit, status control and timeline. JD, intake and pipeline attach here later. */
export function PositionDetail({ agencyId, positionId }: { agencyId: string; positionId: string }) {
  const t = useTranslations('positions');
  const d = useTranslations('positions.detail');
  const states = useTranslations('common.states');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const key = ['position', agencyId, positionId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<PositionView>(`/api/v1/agencies/${agencyId}/positions/${positionId}`, { signal }),
  });
  const position = query.data?.data;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({
      queryKey: ['timeline', agencyId, 'position', positionId],
    });
    await queryClient.invalidateQueries({ queryKey: ['positions', agencyId] });
  };

  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError || !position) return <p role="alert">{states('error')}</p>;

  const none = d('none');
  const compensation =
    position.compMin === null && position.compMax === null
      ? none
      : `${position.compMin ?? '…'} – ${position.compMax ?? '…'} ${position.compCurrency}`;
  const rows: [string, string][] = [
    [d('fields.location'), position.location],
    [d('fields.department'), position.department ?? none],
    [d('fields.reportingLine'), position.reportingLine ?? none],
    [
      d('fields.workArrangement'),
      position.workArrangement ? arrangementLabel(position.workArrangement, t) : none,
    ],
    [d('fields.compensation'), compensation],
    [d('fields.requiredExperience'), position.requiredExperience ?? none],
    [
      d('fields.requiredSkills'),
      position.requiredSkills.length ? position.requiredSkills.join(', ') : none,
    ],
    [d('fields.hiringTimeline'), position.hiringTimeline ?? none],
    [d('fields.openings'), String(position.openings)],
    [d('fields.workAuthorization'), position.workAuthorization ?? none],
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{position.title}</h1>
          <p className="text-muted">
            {position.clientName} · {t(`status.${position.status}`)}
          </p>
          <p className="text-sm text-muted">
            {d('ownerLine', { name: position.ownerName ?? t('unknownOwner') })}
          </p>
        </div>
        {editing ? null : (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {d('edit')}
          </Button>
        )}
      </header>

      {editing ? (
        <PositionForm
          agencyId={agencyId}
          position={position}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await refresh();
          }}
        />
      ) : (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <StatusControl agencyId={agencyId} position={position} onChanged={refresh} />
      <EntityTimeline agencyId={agencyId} entityType="position" entityId={positionId} />
    </div>
  );
}

function arrangementLabel(value: string, t: ReturnType<typeof useTranslations>): string {
  return t.has(`form.arrangement.${value}`) ? t(`form.arrangement.${value}`) : value;
}

function StatusControl({
  agencyId,
  position,
  onChanged,
}: {
  agencyId: string;
  position: PositionView;
  onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations('positions');
  const d = useTranslations('positions.detail');
  const errors = useTranslations('positions.errors');
  const [target, setTarget] = useState<'' | PositionStatus>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const options = POSITION_TRANSITIONS[position.status];
  const needsReason = target !== '' && REASON_REQUIRED.includes(target);
  const change = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/agencies/${agencyId}/positions/${position.id}/status`, {
        body: { status: target, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      }),
    onSuccess: async () => {
      setTarget('');
      setReason('');
      setError(null);
      await onChanged();
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && e.status === 409
          ? errors('transition')
          : e instanceof ApiClientError && e.status === 403
            ? errors('forbidden')
            : e instanceof ApiClientError && e.status === 422
              ? d('reasonNeeded')
              : errors('generic'),
      ),
  });
  return (
    <section aria-labelledby="status-heading" className="flex max-w-md flex-col gap-3">
      <h2 id="status-heading" className="text-lg font-semibold">
        {d('statusSection')}
      </h2>
      {options.length === 0 ? (
        <p className="text-muted">{d('finalStatus')}</p>
      ) : (
        <>
          <SelectField
            label={d('moveTo')}
            value={target}
            onChange={(e) => setTarget(e.target.value as '' | PositionStatus)}
          >
            <option value="" />
            {options.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </SelectField>
          {needsReason ? (
            <TextField
              label={d('reasonLabel')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Button disabled={target === '' || change.isPending} onClick={() => change.mutate()}>
              {d('moveButton')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
