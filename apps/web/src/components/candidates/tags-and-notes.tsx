// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { NoteView } from '@/server/candidates/notes';

/** The candidate's tags with an editor (T-2-13, FR-SRC-09); a tag links to the pool filtered by it. */
export function TagsEditor({
  agencyId,
  agencySlug,
  candidateId,
  tags,
}: {
  agencyId: string;
  agencySlug: string;
  candidateId: string;
  tags: string[];
}) {
  const t = useTranslations('candidates.detail.tagsEditor');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (next: string[]) =>
      apiFetch(`/api/v1/agencies/${agencyId}/candidates/${candidateId}/tags`, {
        method: 'PUT',
        body: { tags: next },
      }),
    onSuccess: async () => {
      setError(null);
      setDraft('');
      toast({ title: t('saved') });
      await queryClient.invalidateQueries({ queryKey: ['candidate', agencyId, candidateId] });
      await queryClient.invalidateQueries({
        queryKey: ['timeline', agencyId, 'candidate', candidateId],
      });
    },
    onError: () => setError(t('error')),
  });
  const add = () => {
    const tag = draft.trim().toLowerCase().replace(/\s+/g, ' ');
    if (tag && !tags.includes(tag)) save.mutate([...tags, tag]);
    else setDraft('');
  };

  return (
    <section aria-labelledby="tags-heading" className="flex max-w-xl flex-col gap-2">
      <h2 id="tags-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('hint')}</p>
      {tags.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
      <ul className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li
            key={tag}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm"
          >
            <Link
              className="underline"
              aria-label={t('filter', { tag })}
              href={`/a/${agencySlug}/candidates?tags=${encodeURIComponent(tag)}`}
            >
              {tag}
            </Link>
            <button
              type="button"
              aria-label={t('remove', { tag })}
              disabled={save.isPending}
              className="px-1 text-muted hover:text-foreground"
              onClick={() => save.mutate(tags.filter((x) => x !== tag))}
            >
              {'×'}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextField
          label={t('add')}
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={draft.trim() === '' || save.isPending}>
          {t('addButton')}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Notes on the candidate (T-2-13): newest first, with their author; only the author edits. */
export function CandidateNotes({
  agencyId,
  candidateId,
}: {
  agencyId: string;
  candidateId: string;
}) {
  const t = useTranslations('candidates.detail.notes');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/candidates/${candidateId}/notes`;
  const key = ['candidate-notes', agencyId, candidateId];
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<NoteView[]>(url, { signal }),
  });
  const done = async (message?: string) => {
    setError(null);
    if (message) toast({ title: message });
    await queryClient.invalidateQueries({ queryKey: key });
  };
  const add = useMutation({
    mutationFn: () => apiFetch(url, { body: { body: body.trim() } }),
    onSuccess: async () => {
      setBody('');
      await done(t('saved'));
    },
    onError: () => setError(t('error')),
  });
  const update = useMutation({
    mutationFn: (note: { id: string; body: string }) =>
      apiFetch(`${url}/${note.id}`, { method: 'PATCH', body: { body: note.body.trim() } }),
    onSuccess: async () => {
      setEditing(null);
      await done(t('saved'));
    },
    onError: () => setError(t('error')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${url}/${id}`, { method: 'DELETE' }),
    onSuccess: () => done(),
    onError: () => setError(t('error')),
  });
  const notes = list.data?.data ?? [];

  return (
    <section aria-labelledby="notes-heading" className="flex max-w-2xl flex-col gap-3">
      <h2 id="notes-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('hint')}</p>
      {list.isPending ? <p role="status">{states('loading')}</p> : null}
      {list.isSuccess && notes.length === 0 ? (
        <p className="text-sm text-muted">{t('none')}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {notes.map((n) => (
          <li key={n.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
            <p className="text-xs text-muted">
              {t('by', {
                name: n.authorName ?? '',
                date: format.dateTime(new Date(n.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
              {n.updatedAt !== n.createdAt && n.canEdit ? ` ${t('edited')}` : ''}
            </p>
            {editing?.id === n.id ? (
              <div className="flex flex-col gap-2">
                <label htmlFor={`note-${n.id}`} className="sr-only">
                  {t('editNote')}
                </label>
                <textarea
                  id={`note-${n.id}`}
                  rows={3}
                  value={editing.body}
                  onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                  className="rounded-md border border-border bg-background p-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={editing.body.trim() === '' || update.isPending}
                    onClick={() => update.mutate(editing)}
                  >
                    {t('save')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                <div className="flex gap-2">
                  {n.canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('editNote')}
                      onClick={() => setEditing({ id: n.id, body: n.body })}
                    >
                      {t('edit')}
                    </Button>
                  ) : null}
                  {n.canDelete ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('deleteNote')}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(n.id)}
                    >
                      {t('delete')}
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <label htmlFor="note-new" className="text-sm font-medium">
          {t('label')}
        </label>
        <textarea
          id="note-new"
          rows={3}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="rounded-md border border-border bg-background p-2 text-sm"
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={body.trim() === '' || add.isPending}>
            {t('add')}
          </Button>
        </div>
      </form>
    </section>
  );
}
