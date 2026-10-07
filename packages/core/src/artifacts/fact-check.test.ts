// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { applyResolutions, unresolvedWarnings, type FactCheck } from './fact-check';

const NOW = new Date('2026-10-07T12:00:00Z');
const check = (): FactCheck => ({
  ranAt: '2026-10-07T11:00:00Z',
  warnings: [
    { id: 'w1', claim: 'Led a team of 12', step: 'deterministic' },
    { id: 'w2', claim: 'Reduced cost by 40%', step: 'verifier' },
  ],
});

describe('fact check resolutions', () => {
  it('lists unresolved warnings', () => {
    expect(unresolvedWarnings(check()).map((w) => w.id)).toEqual(['w1', 'w2']);
  });

  it('records who resolved each warning and when, without mutating the input', () => {
    const original = check();
    const result = applyResolutions(
      original,
      { w1: { kind: 'edited' }, w2: { kind: 'confirmed', reason: 'Stated on the call' } },
      'u1',
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(unresolvedWarnings(result.factCheck)).toEqual([]);
    expect(result.factCheck.warnings[1]!.resolution).toEqual({
      kind: 'confirmed',
      reason: 'Stated on the call',
      resolvedById: 'u1',
      resolvedAt: NOW.toISOString(),
    });
    expect(original.warnings.every((w) => !w.resolution)).toBe(true);
  });

  it('leaves warnings with no resolution unresolved (partial resolution)', () => {
    const result = applyResolutions(check(), { w1: { kind: 'edited' } }, 'u1', NOW);
    expect(result.ok && unresolvedWarnings(result.factCheck).map((w) => w.id)).toEqual(['w2']);
  });

  it('refuses a confirmation without a reason', () => {
    expect(
      applyResolutions(check(), { w1: { kind: 'confirmed', reason: '   ' } }, 'u1', NOW),
    ).toEqual({ ok: false, reason: 'reason_required', warningId: 'w1' });
  });

  it('refuses an unknown warning id', () => {
    expect(applyResolutions(check(), { nope: { kind: 'edited' } }, 'u1', NOW)).toEqual({
      ok: false,
      reason: 'unknown_warning',
      warningId: 'nope',
    });
  });

  it('keeps an earlier resolution instead of overwriting it', () => {
    const first = applyResolutions(check(), { w1: { kind: 'edited' } }, 'u1', NOW);
    if (!first.ok) throw new Error('setup');
    const second = applyResolutions(
      first.factCheck,
      { w1: { kind: 'confirmed', reason: 'x' } },
      'u2',
      NOW,
    );
    expect(second.ok && second.factCheck.warnings[0]!.resolution?.resolvedById).toBe('u1');
  });
});
