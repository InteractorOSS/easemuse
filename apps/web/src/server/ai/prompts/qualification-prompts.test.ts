// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { QUALIFICATION_TOPICS } from '@easemuse/core';
import { callQuestionsPrompt } from './call-questions';
import { qualifyNotesPrompt } from './qualify-notes';

describe('call questions prompt (A13)', () => {
  it('asks for every topic and one question per open point', () => {
    const { system, user } = callQuestionsPrompt.buildPrompt({
      position: { title: 'Head of Platform', location: 'Seoul' },
      mustHaves: ['8 years of Go'],
      toConfirm: ['Notice period', 'Team size managed'],
    });
    for (const t of QUALIFICATION_TOPICS) expect(system).toContain(t);
    expect(user).toContain('1. Notice period');
    expect(user).toContain('2. Team size managed');
  });

  it('gives each stored question an id', () => {
    const out = { questions: [{ topic: 'interest' as const, question: 'What caught your eye?' }] };
    const content = callQuestionsPrompt.toContent!(out, {
      position: { title: 'x', location: 'y' },
      mustHaves: [],
      toConfirm: [],
    }) as { questions: { id: string }[] };
    expect(content.questions[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('qualify notes prompt (A14)', () => {
  const fields = Object.fromEntries(
    QUALIFICATION_TOPICS.map((k) => [k, { value: '', level: null, inferred: false }]),
  ) as never;

  it('keeps the notes in the stored record and leaves every field unconfirmed', () => {
    const content = qualifyNotesPrompt.toContent!(
      { fields },
      { notes: 'keen, 30 days', position: { title: 'x' } },
    ) as { notes: string; fields: Record<string, { confirmed: boolean }> };
    expect(content.notes).toBe('keen, 30 days');
    expect(Object.values(content.fields).every((f) => !f.confirmed)).toBe(true);
  });

  it('tells the model not to record protected details or invent figures', () => {
    const { system } = qualifyNotesPrompt.buildPrompt({ notes: 'x', position: { title: 'y' } });
    expect(system).toMatch(/protected characteristic/);
    expect(system).toMatch(/Never invent/);
  });
});
