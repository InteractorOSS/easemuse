// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  FEEDBACK_CRITERIA,
  FEEDBACK_FROM,
  FEEDBACK_RATINGS,
  interviewFeedbackContentSchema,
  unconfirmedFeedbackCriteria,
  type FeedbackCriterion,
  type FeedbackRatingDraft,
} from '@easemuse/core';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import type { ArtifactView, ContentEditorProps } from '@/components/artifacts/types';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { FeedbackDraftOverview } from '@/server/interviews/feedback-draft';

/** The draft ratings as a form; each rating the email gave is confirmed by the recruiter (FR-IVW-04). */
export function FeedbackDraftEditor({ content, onChange, readOnly }: ContentEditorProps) {
  const t = useTranslations('pipeline.interviews');
  const e = useTranslations('pipeline.interviews.fromEmail');
  const parsed = interviewFeedbackContentSchema.safeParse(content);
  if (!parsed.success) return null;
  const raw = content as {
    ratings?: Partial<Record<FeedbackCriterion, Partial<FeedbackRatingDraft>>>;
  };
  const ratingOf = (k: FeedbackCriterion) => ({ ...parsed.data.ratings[k], ...raw.ratings?.[k] });
  const set = (k: FeedbackCriterion, patch: Partial<FeedbackRatingDraft>) =>
    onChange({
      ...content,
      ratings: {
        ...parsed.data.ratings,
        ...raw.ratings,
        // Changing a rating means it has to be checked again.
        [k]: { ...ratingOf(k), ...patch, ...('confirmed' in patch ? {} : { confirmed: false }) },
      },
    });
  const open = unconfirmedFeedbackCriteria(parsed.data);

  return (
    <div className="flex flex-col gap-4">
      {open.length > 0 ? <p className="text-sm text-muted">{e('unconfirmed')}</p> : null}
      <ul className="flex flex-col gap-3">
        {FEEDBACK_CRITERIA.map((k) => {
          const r = ratingOf(k);
          return (
            <li key={k} className="grid gap-2 sm:grid-cols-[12rem_10rem_1fr_auto] sm:items-end">
              <span className="text-sm font-medium">{t(`criteria.${k}`)}</span>
              <SelectField
                label={t('rating', { criterion: t(`criteria.${k}`) })}
                disabled={readOnly}
                value={r.rating ?? ''}
                onChange={(ev) =>
                  set(k, {
                    rating: (ev.target.value || null) as FeedbackRatingDraft['rating'],
                    evidence: ev.target.value === '' ? '' : r.evidence,
                  })
                }
              >
                <option value="">{t('ratings.none')}</option>
                {FEEDBACK_RATINGS.map((v) => (
                  <option key={v} value={v}>
                    {t(`ratings.${v}`)}
                  </option>
                ))}
              </SelectField>
              <span className="text-xs text-muted">
                {r.evidence ? e('evidence', { quote: r.evidence }) : ''}
              </span>
              {r.rating ? (
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    aria-label={e('confirmRating', { criterion: t(`criteria.${k}`) })}
                    checked={Boolean(r.confirmed)}
                    onChange={(ev) => set(k, { confirmed: ev.target.checked })}
                  />
                  {e('confirm')}
                </label>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-1">
        <label htmlFor="fb-draft-comments" className="text-sm font-medium">
          {t('comments')}
        </label>
        <textarea
          id="fb-draft-comments"
          rows={4}
          readOnly={readOnly}
          value={parsed.data.comments}
          onChange={(ev) => onChange({ ...content, comments: ev.target.value })}
          className="rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted">{e('sourceTitle')}</summary>
        <p className="whitespace-pre-wrap text-sm">{parsed.data.source}</p>
      </details>
    </div>
  );
}

/**
 * Paste a feedback email and get a draft of the five ratings (A17, US-903). The draft is checked and
 * confirmed rating by rating; approving it records the feedback of the round.
 */
export function FeedbackFromEmail({
  agencyId,
  url,
  roundId,
  onRecorded,
}: {
  agencyId: string;
  /** `/api/v1/agencies/:id/pipeline/:entryId/interviews` */
  url: string;
  roundId: string;
  onRecorded: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.interviews');
  const e = useTranslations('pipeline.interviews.fromEmail');
  const [email, setEmail] = useState('');
  const [fromRole, setFromRole] = useState<'hm' | 'candidate'>('hm');
  const draftUrl = `${url}/${roundId}/feedback/draft`;
  const draft = useQuery({
    queryKey: ['feedback-draft', agencyId, roundId],
    queryFn: ({ signal }) => apiFetch<FeedbackDraftOverview | null>(draftUrl, { signal }),
  });
  const structure = useAiRun(`${url}/${roundId}/feedback/structure`, {
    body: { fromRole, email },
    onDone: () => void draft.refetch(),
  });
  const artifactId = draft.data?.data?.artifactId;
  // When the draft is approved the feedback is recorded: tell the round to reload its list.
  const artifact = useQuery({
    queryKey: ['artifact', agencyId, artifactId],
    queryFn: ({ signal }) =>
      apiFetch<ArtifactView>(`/api/v1/agencies/${agencyId}/artifacts/${artifactId}`, { signal }),
    enabled: Boolean(artifactId),
  });
  const approved = artifact.data?.data.approvedVersionId ?? null;
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (seen.current !== undefined && approved !== seen.current && approved) void onRecorded();
    seen.current = approved;
  }, [approved, onRecorded]);

  return (
    <fieldset className="flex max-w-xl flex-col gap-2">
      <legend className="text-sm font-semibold">{e('title')}</legend>
      <p className="text-xs text-muted">{e('hint')}</p>
      <SelectField
        label={t('from')}
        value={fromRole}
        onChange={(ev) => setFromRole(ev.target.value as 'hm' | 'candidate')}
      >
        {FEEDBACK_FROM.map((f) => (
          <option key={f} value={f}>
            {t(`fromRoles.${f}`)}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-col gap-1">
        <label htmlFor={`fb-email-${roundId}`} className="text-sm font-medium">
          {e('paste')}
        </label>
        <textarea
          id={`fb-email-${roundId}`}
          rows={5}
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          className="rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>
      <div>
        <Button
          size="sm"
          disabled={email.trim().length < 10 || structure.state.status === 'running'}
          onClick={() => void structure.start()}
        >
          {e('structure')}
        </Button>
      </div>
      <StreamingDraft
        state={structure.state}
        onCancel={structure.cancel}
        onRetry={() => void structure.start()}
      />
      {artifactId ? (
        <ArtifactEditor
          agencyId={agencyId}
          artifactId={artifactId}
          ContentEditor={FeedbackDraftEditor}
        />
      ) : null}
    </fieldset>
  );
}
