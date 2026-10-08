// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  CHANNEL_LIMITS,
  OUTREACH_CHANNELS,
  OUTREACH_ELEMENTS,
  OUTREACH_RESPONSES,
  fillOutreachTokens,
  outreachMessageContentSchema,
  type AgencySettings,
  type OutreachChannelValue,
  type OutreachElement,
} from '@easemuse/core';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import type { ArtifactView, ContentEditorProps } from '@/components/artifacts/types';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { TemplateView } from '@/server/outreach/templates';

interface TouchView {
  touchNumber: number;
  channel: OutreachChannelValue;
  status: string;
  dueAt: string | null;
  sentAt: string | null;
  response: string | null;
  artifactId: string | null;
  approvedVersionId: string | null;
}
interface OutreachView {
  doNotContact: boolean;
  doNotContactReason: string | null;
  hasEmail: boolean;
  names: { firstName: string; recruiter: string };
  recentlyContacted: { at: string; byOtherPosition: boolean } | null;
  touches: TouchView[];
}

/** The outreach sequence of one candidate: plan, draft, approve, send, record the answer (brief 7). */
export function OutreachPanel({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.outreach');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/pipeline/${entryId}`;
  const key = ['outreach', agencyId, entryId];
  const view = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<OutreachView>(`${url}/outreach`, { signal }),
  });
  // The person's own templates and the agency's, those that fit this candidate's client (T-5-11).
  const templates = useQuery({
    queryKey: ['outreach-templates', agencyId, entryId],
    queryFn: ({ signal }) =>
      apiFetch<TemplateView[]>(
        `/api/v1/agencies/${agencyId}/outreach-templates?entryId=${entryId}`,
        { signal },
      ),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await onChanged();
  };
  if (!view.data) return null;
  const o = view.data.data;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <section aria-labelledby="outreach-heading" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id="outreach-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('hint')}</p>
      </div>
      {o.doNotContact ? (
        <p role="alert" className="rounded-2xl border border-border p-3 text-sm">
          {t('dnc', { reason: o.doNotContactReason ? `: ${o.doNotContactReason}` : '' })}
        </p>
      ) : null}
      {o.recentlyContacted ? (
        <p role="status" className="rounded-2xl border border-border p-3 text-sm">
          {t(o.recentlyContacted.byOtherPosition ? 'recentOther' : 'recent', {
            date: date(o.recentlyContacted.at),
          })}
        </p>
      ) : null}
      {o.hasEmail ? null : <p className="text-sm text-muted">{t('noEmail')}</p>}

      {o.doNotContact ? null : (
        <SequenceForm
          url={url}
          existing={o.touches.length > 0}
          channel={o.touches.find((x) => x.status !== 'sent')?.channel}
          onSaved={refresh}
        />
      )}

      <ol className="flex flex-col gap-4">
        {o.touches.map((touch) => (
          <li key={touch.touchNumber}>
            <TouchCard
              agencyId={agencyId}
              url={url}
              touch={touch}
              view={o}
              templates={(templates.data?.data ?? []).filter((x) => x.channel === touch.channel)}
              onChanged={refresh}
              date={date}
            />
          </li>
        ))}
      </ol>
      {o.touches.some((x) => x.status === 'sent') ? (
        <ResponseForm agencyId={agencyId} url={url} onSaved={refresh} />
      ) : null}
    </section>
  );
}

function SequenceForm({
  url,
  existing,
  channel,
  onSaved,
}: {
  url: string;
  existing: boolean;
  channel: OutreachChannelValue | undefined;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.outreach');
  const channels = useTranslations('pipeline.outreach.channels');
  const [value, setValue] = useState<OutreachChannelValue>(channel ?? 'email');
  const [open, setOpen] = useState(!existing);
  const save = useMutation({
    mutationFn: () => apiFetch(`${url}/sequence`, { method: 'PUT', body: { channel: value } }),
    onSuccess: async () => {
      setOpen(false);
      await onSaved();
    },
  });
  if (!open) {
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {t('replan')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <h3 className="font-medium">{t('setup')}</h3>
      <SelectField
        label={t('channel')}
        value={value}
        onChange={(e) => setValue(e.target.value as OutreachChannelValue)}
      >
        {OUTREACH_CHANNELS.map((c) => (
          <option key={c} value={c}>
            {channels(c)}
          </option>
        ))}
      </SelectField>
      <div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {t('plan')}
        </Button>
      </div>
    </div>
  );
}

const ALL_ON = Object.fromEntries(OUTREACH_ELEMENTS.map((k) => [k, true])) as Record<
  OutreachElement,
  boolean
>;

function TouchCard({
  agencyId,
  url,
  touch,
  view,
  templates,
  onChanged,
  date,
}: {
  agencyId: string;
  url: string;
  touch: TouchView;
  view: OutreachView;
  templates: TemplateView[];
  onChanged: () => void | Promise<void>;
  date: (iso: string) => string;
}) {
  const t = useTranslations('pipeline.outreach');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const n = touch.touchNumber;
  const [include, setInclude] = useState(ALL_ON);
  const [templateId, setTemplateId] = useState('');
  const closed = touch.status === 'sent' || touch.status === 'cancelled';
  const run = useAiRun(`${url}/touches/${n}/draft`, {
    body: { include, ...(templateId ? { templateId } : {}) },
    onDone: () => {
      void queryClient.invalidateQueries({ queryKey: ['artifact', agencyId] });
      void onChanged();
    },
  });
  // Shares the editor's query, so approving there shows the send buttons here.
  const artifact = useQuery({
    queryKey: ['artifact', agencyId, touch.artifactId],
    queryFn: ({ signal }) =>
      apiFetch<ArtifactView>(`/api/v1/agencies/${agencyId}/artifacts/${touch.artifactId}`, {
        signal,
      }),
    enabled: touch.artifactId !== null,
  });
  const approvedId = artifact.data?.data.approvedVersionId ?? null;
  const approved = artifact.data?.data.versions.find((v) => v.id === approvedId);
  const parsed = outreachMessageContentSchema.safeParse(approved?.content);

  const send = useMutation({
    mutationFn: () => apiFetch(`${url}/touches/${n}/send`, { body: { versionId: approvedId } }),
    onSuccess: async () => {
      toast({ title: t('sent') });
      await onChanged();
    },
  });
  const mark = useMutation({
    mutationFn: () =>
      apiFetch(`${url}/touches/${n}/mark-sent`, { body: { versionId: approvedId } }),
    onSuccess: async () => {
      toast({ title: t('markedSent') });
      await onChanged();
    },
  });
  const copy = async () => {
    if (!parsed.success) return;
    const names = { firstName: view.names.firstName, recruiter: view.names.recruiter };
    const text = [
      fillOutreachTokens(parsed.data.subject, names),
      fillOutreachTokens(parsed.data.body, names),
    ]
      .filter(Boolean)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    toast({ title: t('copied') });
  };
  const error =
    (send.error ?? mark.error) instanceof ApiClientError
      ? (send.error ?? mark.error)!.message
      : null;

  return (
    <article
      aria-labelledby={`touch-${n}`}
      className="flex flex-col gap-3 rounded-2xl border border-border p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`touch-${n}`} className="font-medium">
          {t('touchTitle', { n, name: t(`touchNames.${n}`) })}
        </h3>
        <p className="text-sm text-muted">
          {t(`status.${touch.status}`)}
          {touch.sentAt ? ` · ${t('sentOn', { date: date(touch.sentAt) })}` : ''}
          {!touch.sentAt && touch.dueAt && !closed
            ? ` · ${t('due', { date: date(touch.dueAt) })}`
            : ''}
          {touch.response ? ` · ${t('answer', { value: t(`responses.${touch.response}`) })}` : ''}
        </p>
      </header>

      {closed || view.doNotContact ? null : (
        <>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <legend className="mb-1 font-medium">{t('include')}</legend>
            {OUTREACH_ELEMENTS.map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={include[k]}
                  onChange={(e) => setInclude((s) => ({ ...s, [k]: e.target.checked }))}
                />
                {t(`elements.${k}`)}
              </label>
            ))}
          </fieldset>
          {templates.length > 0 ? (
            <div className="max-w-sm">
              <SelectField
                label={t('template.label')}
                hint={t('template.hint')}
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">{t('template.none')}</option>
                {templates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t('template.option', {
                      name: x.name,
                      scope: x.clientName ?? (x.shared ? t('template.agency') : t('template.mine')),
                    })}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : null}
          <div>
            <Button
              size="sm"
              disabled={run.state.status === 'running'}
              onClick={() => void run.start()}
            >
              {touch.artifactId ? t('redraft') : t('draft')}
            </Button>
          </div>
          <StreamingDraft
            state={run.state}
            onCancel={run.cancel}
            onRetry={() => void run.start()}
          />
        </>
      )}

      {touch.artifactId ? (
        <ArtifactEditor
          agencyId={agencyId}
          artifactId={touch.artifactId}
          ContentEditor={OutreachEditor}
        />
      ) : null}

      {!closed && !view.doNotContact && touch.artifactId ? (
        <div className="flex flex-col gap-2">
          {approvedId && parsed.success ? (
            touch.channel === 'email' ? (
              <div>
                <Button disabled={send.isPending || !view.hasEmail} onClick={() => send.mutate()}>
                  {t('send')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted">{t('copyHint')}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => void copy()}>
                    {t('copy')}
                  </Button>
                  <Button disabled={mark.isPending} onClick={() => mark.mutate()}>
                    {t('markSent')}
                  </Button>
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-muted">{t('needsApproval')}</p>
          )}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** Subject (email only) and message, with a length count for the channel. */
function OutreachEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('pipeline.outreach');
  const channel = (content.channel as OutreachChannelValue | undefined) ?? 'email';
  const body = typeof content.body === 'string' ? content.body : '';
  const subject = typeof content.subject === 'string' ? content.subject : '';
  const limit = CHANNEL_LIMITS[channel];
  return (
    <div className="flex flex-col gap-3">
      {channel === 'email' ? (
        <TextField
          label={t('subject')}
          readOnly={readOnly}
          value={subject}
          onChange={(e) => onChange({ ...content, subject: e.target.value })}
        />
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`outreach-body-${channel}`} className="text-sm font-medium">
          {t('body')}
        </label>
        <textarea
          id={`outreach-body-${channel}`}
          rows={10}
          readOnly={readOnly}
          value={body}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          className="rounded-md border border-border bg-background p-2 text-sm"
        />
        <p className="text-xs text-muted">
          {t('count', { count: body.length, limit })}
          {body.length > limit ? ` ${t('over')}` : ''}
        </p>
        <p className="text-xs text-muted">
          {t('placeholders', {
            first: '{{first_name}}',
            recruiter: '{{recruiter_name}}',
            firstName: t('names.first'),
            recruiterName: t('names.recruiter'),
          })}
        </p>
      </div>
    </div>
  );
}

function ResponseForm({
  agencyId,
  url,
  onSaved,
}: {
  agencyId: string;
  url: string;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.outreach');
  const { toast } = useToast();
  const [response, setResponse] = useState<(typeof OUTREACH_RESPONSES)[number]>('interested');
  const [reasonCode, setReasonCode] = useState('');
  const settings = useQuery({
    queryKey: ['settings', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<AgencySettings>(`/api/v1/agencies/${agencyId}/settings`, { signal }),
    enabled: response === 'not_interested',
  });
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`${url}/response`, {
        body: { response, ...(response === 'not_interested' ? { reasonCode } : {}) },
      }),
    onSuccess: async () => {
      toast({ title: t('recorded') });
      await onSaved();
    },
  });
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <h3 className="font-medium">{t('responseTitle')}</h3>
      <p className="text-sm text-muted">{t('responseHint')}</p>
      <SelectField
        label={t('response')}
        value={response}
        onChange={(e) => setResponse(e.target.value as typeof response)}
      >
        {OUTREACH_RESPONSES.map((r) => (
          <option key={r} value={r}>
            {t(`responses.${r}`)}
          </option>
        ))}
      </SelectField>
      {response === 'not_interested' ? (
        <SelectField
          label={t('reasonCode')}
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
        >
          <option value="" />
          {(settings.data?.data.rejectionReasons ?? []).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectField>
      ) : null}
      <div>
        <Button
          disabled={save.isPending || (response === 'not_interested' && reasonCode === '')}
          onClick={() => save.mutate()}
        >
          {t('record')}
        </Button>
      </div>
    </div>
  );
}
