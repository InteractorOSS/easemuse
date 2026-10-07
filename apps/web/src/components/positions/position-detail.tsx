// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  POSITION_TRANSITIONS,
  REASON_REQUIRED,
  type GuardFailure,
  type GuardOverride,
  type MatchWeightKey,
  type PositionStatus,
} from '@easemuse/core';
import { EntityTimeline } from '@/components/activity/entity-timeline';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { PositionView } from '@/server/positions/service';
import { JdPanel } from './jd-panel';
import { PositionForm } from './position-form';
import { IntakePanel } from './intake-panel';
import { WeightsEditor } from './weights-editor';

/** The position page shell (T-1-04): details, edit, status control and timeline. JD, intake and pipeline attach here later. */
export function PositionDetail({
  agencyId,
  agencySlug,
  positionId,
  viewer,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
  /** Who is looking: only the owner, a lead or an admin sees the controls (the API enforces it regardless). */
  viewer: { userId: string; role: 'admin' | 'lead' | 'recruiter' };
}) {
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

  const canEdit = viewer.role !== 'recruiter' || position?.ownerId === viewer.userId;

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
        {editing || !canEdit ? null : (
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

      {canEdit ? (
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}/structure`}>
          {d('structureLink')}
        </Link>
      ) : null}
      {canEdit ? (
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}/questions`}>
          {d('questionsLink')}
        </Link>
      ) : null}
      {canEdit ? (
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}/profile`}>
          {d('profileLink')}
        </Link>
      ) : null}
      {canEdit ? (
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}/search`}>
          {d('searchLink')}
        </Link>
      ) : null}
      <JdPanel agencyId={agencyId} positionId={positionId} canEdit={canEdit} />
      <IntakePanel agencyId={agencyId} positionId={positionId} canEdit={canEdit} />
      <WeightsEditor
        key={JSON.stringify(position.matchingWeights)}
        agencyId={agencyId}
        positionId={positionId}
        weights={position.matchingWeights as Record<MatchWeightKey, number>}
        canEdit={canEdit}
        onSaved={refresh}
      />
      {canEdit ? (
        <StatusControl agencyId={agencyId} position={position} onChanged={refresh} />
      ) : null}
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
  const [guards, setGuards] = useState<GuardFailure[]>([]);
  const [overrideReason, setOverrideReason] = useState('');
  const options = POSITION_TRANSITIONS[position.status];
  const needsReason = target !== '' && REASON_REQUIRED.includes(target);
  const change = useMutation({
    mutationFn: (overrides: GuardOverride[] = []) =>
      apiFetch(`/api/v1/agencies/${agencyId}/positions/${position.id}/status`, {
        body: {
          status: target,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(overrides.length ? { overrideGuards: overrides } : {}),
        },
      }),
    onSuccess: async () => {
      setTarget('');
      setReason('');
      setError(null);
      setGuards([]);
      setOverrideReason('');
      await onChanged();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === 'guard_failed') {
        setError(null);
        setGuards(e.guards as GuardFailure[]);
        return;
      }
      setGuards([]);
      setError(
        e instanceof ApiClientError && e.status === 409
          ? errors('transition')
          : e instanceof ApiClientError && e.status === 403
            ? errors('forbidden')
            : e instanceof ApiClientError && e.status === 422
              ? d('reasonNeeded')
              : errors('generic'),
      );
    },
  });
  const canOverride = guards.length > 0 && guards.every((g) => g.mode === 'warn');
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
          {guards.length > 0 ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
            >
              <p className="font-medium">{d('guard.title')}</p>
              <ul className="list-disc pl-5">
                {guards.map((g) => (
                  <li key={g.guard}>{g.message}</li>
                ))}
              </ul>
              {canOverride ? (
                <>
                  <p>{d('guard.warnIntro')}</p>
                  <TextField
                    label={d('guard.overrideReason')}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                  <div>
                    <Button
                      variant="secondary"
                      disabled={overrideReason.trim().length < 3 || change.isPending}
                      onClick={() =>
                        change.mutate(
                          guards.map((g) => ({ guard: g.guard, reason: overrideReason.trim() })),
                        )
                      }
                    >
                      {d('guard.override')}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-muted">{d('guard.blocked')}</p>
              )}
            </div>
          ) : null}
          <div>
            <Button disabled={target === '' || change.isPending} onClick={() => change.mutate([])}>
              {d('moveButton')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
