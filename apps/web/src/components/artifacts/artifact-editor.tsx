// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useMemo, useState, type ComponentType } from 'react';
import type { FactCheckResolutionsInput } from '@easemuse/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { DiffView } from './diff-view';
import { FactCheckPanel } from './fact-check-panel';
import type { ArtifactView, ContentEditorProps, VersionView } from './types';
import { VersionStatus } from './version-status';

const pretty = (content: Record<string, unknown>) => JSON.stringify(content, null, 2);

function parseObject(
  text: string,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: 'invalidJson' | 'notObject' } {
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return { ok: false, reason: 'notObject' };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, reason: 'invalidJson' };
  }
}

export interface ArtifactEditorProps {
  agencyId: string;
  artifactId: string;
  /** A feature's own form for the kind; the JSON text editor is used when absent. */
  ContentEditor?: ComponentType<ContentEditorProps>;
}

/**
 * The generic review surface for any AI draft (T-AI-10, ADR-006): status badge ("AI draft" until
 * approved), editable content, the version history with a diff against the AI original, the
 * fact-check decisions, and the approve / discard bar. Approval is the only way content becomes
 * official, and it is always the recruiter's click.
 */
export function ArtifactEditor({ agencyId, artifactId, ContentEditor }: ArtifactEditorProps) {
  const t = useTranslations('artifacts');
  const states = useTranslations('common.states');
  const history = useTranslations('artifacts.history');
  const format = useFormatter();
  const base = `/api/v1/agencies/${agencyId}/artifacts/${artifactId}`;
  const [selected, setSelected] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['artifact', agencyId, artifactId],
    queryFn: ({ signal }) => apiFetch<ArtifactView>(base, { signal }),
  });
  const artifact = query.data?.data;

  const visible = useMemo(
    () => artifact?.versions.filter((v) => v.status !== 'discarded') ?? [],
    [artifact],
  );
  const current: VersionView | undefined = visible.find((v) => v.id === selected) ?? visible[0];

  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError || !artifact) return <p role="alert">{states('error')}</p>;
  if (!current) return <p className="text-muted">{t('streaming.cancelled')}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t(`kinds.${artifact.kind}`)}</h1>
        <VersionStatus version={current} />
        <span className="text-sm text-muted">{t('version', { n: current.version })}</span>
      </div>

      <VersionEditor
        key={current.id}
        agencyId={agencyId}
        artifact={artifact}
        version={current}
        ContentEditor={ContentEditor}
        base={base}
      />

      <nav aria-label={history('title')} className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{history('title')}</h2>
        <ul className="flex flex-col gap-1">
          {artifact.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 text-sm">
              <Button
                variant={v.id === current.id ? 'secondary' : 'ghost'}
                size="sm"
                aria-current={v.id === current.id ? 'true' : undefined}
                aria-label={history('select', { n: v.version })}
                onClick={() => setSelected(v.id)}
              >
                {t('version', { n: v.version })}
              </Button>
              <VersionStatus version={v} />
              <Badge>{history(`origin.${v.origin}`)}</Badge>
              <span className="text-muted">
                {format.dateTime(new Date(v.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function VersionEditor({
  agencyId,
  artifact,
  version,
  ContentEditor,
  base,
}: {
  agencyId: string;
  artifact: ArtifactView;
  version: VersionView;
  ContentEditor?: ComponentType<ContentEditorProps>;
  base: string;
}) {
  const t = useTranslations('artifacts');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textId = useId();
  const stored = useMemo(() => pretty(version.content), [version.content]);
  const [text, setText] = useState(stored);
  const [showDiff, setShowDiff] = useState(false);
  const [resolutions, setResolutions] = useState<FactCheckResolutionsInput>({});
  const [error, setError] = useState<string | null>(null);

  const editable = version.status === 'draft' || version.status === 'approved';
  const isDraft = version.status === 'draft';
  const parsed = parseObject(text);
  const dirty = text !== stored;
  const original = [...artifact.versions].reverse().find((v) => v.origin === 'ai');

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['artifact', agencyId, artifact.id] });
  const explain = (e: unknown): string => {
    if (!(e instanceof ApiClientError)) return t('errors.generic');
    const map: Record<string, string> = {
      factcheck_unresolved: t('errors.factcheckUnresolved'),
      missing_recruiter_assessment: t('errors.missingAssessment'),
      missing_required_field: t('errors.missingRequired'),
      factcheck_not_run: t('errors.factcheckNotRun'),
      not_draft: t('errors.notDraft'),
      human_only_field: t('errors.humanOnly'),
    };
    return map[e.code] ?? t('errors.generic');
  };

  const save = useMutation({
    mutationFn: (content: Record<string, unknown>) =>
      apiFetch(`${base}/versions`, { body: { content } }),
    onSuccess: async () => {
      setError(null);
      toast({ title: t('messages.saved') });
      await refresh();
    },
    onError: (e) => setError(explain(e)),
  });
  const approve = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/versions/${version.id}/approve`, {
        body: { factCheckResolutions: resolutions },
      }),
    onSuccess: async () => {
      setError(null);
      toast({ title: t('messages.approved') });
      await refresh();
      // Approval makes content official everywhere it is shown (the "confirmed" line of a profile, the
      // approved requirements of a JD...), and the screen around this editor owns those queries.
      await queryClient.invalidateQueries();
    },
    onError: (e) => setError(explain(e)),
  });
  const discard = useMutation({
    mutationFn: () => apiFetch(`${base}/versions/${version.id}/discard`, { body: {} }),
    onSuccess: async () => {
      toast({ title: t('messages.discarded') });
      await refresh();
    },
    onError: (e) => setError(explain(e)),
  });

  const content = parsed.ok ? parsed.value : version.content;
  const busy = save.isPending || approve.isPending || discard.isPending;

  return (
    <div className="flex flex-col gap-4">
      {ContentEditor ? (
        <ContentEditor
          content={content}
          onChange={(next) => setText(pretty(next))}
          readOnly={!editable}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={textId} className="text-sm font-medium">
            {t('content.label')}
          </label>
          <textarea
            id={textId}
            value={text}
            readOnly={!editable}
            spellCheck={false}
            rows={18}
            aria-invalid={parsed.ok ? undefined : true}
            aria-describedby={`${textId}-hint`}
            onChange={(event) => setText(event.target.value)}
            className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
          />
          <p id={`${textId}-hint`} className="text-xs text-muted">
            {parsed.ok ? t('content.hint') : t(`content.${parsed.reason}`)}
          </p>
        </div>
      )}

      {original ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showDiff}
              onChange={(event) => setShowDiff(event.target.checked)}
            />
            {t('diff.toggle')}
          </label>
          {showDiff ? <DiffView before={pretty(original.content)} after={text} /> : null}
        </div>
      ) : null}

      {version.factCheck ? (
        <FactCheckPanel
          factCheck={version.factCheck}
          resolutions={resolutions}
          onChange={setResolutions}
          readOnly={!isDraft}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {dirty && isDraft ? <p className="text-sm text-muted">{t('messages.unsaved')}</p> : null}

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy || !dirty || !parsed.ok}
            onClick={() => parsed.ok && save.mutate(parsed.value)}
          >
            {t('actions.save')}
          </Button>
          {isDraft ? (
            <Button disabled={busy || dirty} onClick={() => approve.mutate()}>
              {t('actions.approve')}
            </Button>
          ) : null}
          {isDraft ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="danger" disabled={busy}>
                  {t('actions.discard')}
                </Button>
              </DialogTrigger>
              <DialogContent
                title={t('actions.confirmDiscardTitle')}
                description={t('actions.confirmDiscardBody')}
              >
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary">{t('streaming.cancel')}</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="danger" onClick={() => discard.mutate()}>
                      {t('actions.discard')}
                    </Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
