// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import { ApiError } from '@/lib/http/errors';
import { intakeDraftState, requestPlacementAnalysis } from './place';
import type { CandidateView } from './service';

const startBatchAnalysis = vi.hoisted(() => vi.fn());
vi.mock('@/server/matching/batch', () => ({ startBatchAnalysis }));

const actor: AgencyActor = { kind: 'agency', userId: 'u1', agencyId: 'a1', role: 'recruiter' };
const placement = { entryId: 'e1', added: true, canAnalyze: true };

afterEach(() => startBatchAnalysis.mockReset());

describe('requestPlacementAnalysis (G#9)', () => {
  it('queues the analysis of the one placed candidate', async () => {
    startBatchAnalysis.mockResolvedValue({ jobRunId: 'run1', total: 1 });
    expect(await requestPlacementAnalysis(actor, 'p1', placement)).toEqual({
      status: 'queued',
      jobRunId: 'run1',
    });
    expect(startBatchAnalysis).toHaveBeenCalledWith(actor, 'p1', { entryIds: ['e1'] });
  });

  it('does not start without a confirmed success profile', async () => {
    expect(
      await requestPlacementAnalysis(actor, 'p1', { ...placement, canAnalyze: false }),
    ).toEqual({ status: 'needs_success_profile' });
    expect(startBatchAnalysis).not.toHaveBeenCalled();
  });

  it('reports a candidate owned by another recruiter, and any other failure, without throwing', async () => {
    startBatchAnalysis.mockRejectedValueOnce(new ApiError('forbidden', 'No', { status: 403 }));
    expect(await requestPlacementAnalysis(actor, 'p1', placement)).toEqual({
      status: 'not_allowed',
    });
    startBatchAnalysis.mockRejectedValueOnce(new Error('queue down'));
    expect(await requestPlacementAnalysis(actor, 'p1', placement)).toEqual({ status: 'failed' });
  });
});

describe('intakeDraftState', () => {
  const view = (over: Partial<CandidateView> = {}) =>
    ({
      profileArtifactId: null,
      profileAi: null,
      documents: [{ extractionStatus: 'ready' }],
      ...over,
    }) as CandidateView;
  const doc = (extractionStatus: 'pending' | 'ready' | 'failed') =>
    [{ extractionStatus }] as CandidateView['documents'];

  it('follows the draft from reading to ready', () => {
    expect(intakeDraftState(view({ documents: doc('pending') }))).toBe('reading');
    expect(intakeDraftState(view({ documents: doc('failed') }))).toBe('readFailed');
    expect(intakeDraftState(view())).toBe('drafting');
    expect(intakeDraftState(view({ profileAi: { status: 'failed', error: 'ai_failed' } }))).toBe(
      'aiFailed',
    );
    expect(intakeDraftState(view({ profileArtifactId: 'art1' }))).toBe('ready');
  });
});
