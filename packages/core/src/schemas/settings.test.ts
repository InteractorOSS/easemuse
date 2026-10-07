// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_WEIGHTS,
  DEFAULT_REJECTION_REASONS,
  MATCH_WEIGHT_KEYS,
  agencySettingsPatchSchema,
  agencySettingsSchema,
  matchingWeightsSchema,
  parseAgencySettings,
} from './settings';

describe('matching weights (brief §5.1)', () => {
  it('defaults to the brief: 40/20/15/10/5/5/5, which adds up to 100', () => {
    expect(Object.values(DEFAULT_MATCH_WEIGHTS)).toEqual([40, 20, 15, 10, 5, 5, 5]);
    expect(matchingWeightsSchema.safeParse(DEFAULT_MATCH_WEIGHTS).success).toBe(true);
    expect(MATCH_WEIGHT_KEYS).toHaveLength(7);
  });

  it('rejects weights that do not add up to 100, or a non-integer or out-of-range weight', () => {
    expect(
      matchingWeightsSchema.safeParse({ ...DEFAULT_MATCH_WEIGHTS, coreCompetencies: 41 }).success,
    ).toBe(false);
    expect(
      matchingWeightsSchema.safeParse({
        ...DEFAULT_MATCH_WEIGHTS,
        coreCompetencies: 39.5,
        relevantExperience: 20.5,
      }).success,
    ).toBe(false);
    expect(
      matchingWeightsSchema.safeParse({
        ...DEFAULT_MATCH_WEIGHTS,
        coreCompetencies: -5,
        relevantExperience: 65,
      }).success,
    ).toBe(false);
    expect(
      matchingWeightsSchema.safeParse({ ...DEFAULT_MATCH_WEIGHTS, coreCompetencies: undefined })
        .success,
    ).toBe(false);
  });

  it('accepts any distribution that sums to 100, including zero weights', () => {
    expect(
      matchingWeightsSchema.safeParse({
        ...Object.fromEntries(MATCH_WEIGHT_KEYS.map((k) => [k, 0])),
        coreCompetencies: 100,
      }).success,
    ).toBe(true);
  });
});

describe('agency settings', () => {
  it('has a default for every key', () => {
    const s = agencySettingsSchema.parse({});
    expect(s).toMatchObject({
      defaultMatchingWeights: DEFAULT_MATCH_WEIGHTS,
      outreachIntervalsDays: [4, 7],
      recentlyContactedDays: 30,
      guardModes: {
        jdApproval: 'block',
        resumeApproval: 'block',
        consent: 'block',
        recruiterAssessment: 'block',
      },
      visibility: 'all_positions',
    });
    expect(s.rejectionReasons).toEqual([...DEFAULT_REJECTION_REASONS]);
  });

  it('validates ranges, modes and the reasons list', () => {
    expect(agencySettingsSchema.safeParse({ outreachIntervalsDays: [0, 7] }).success).toBe(false);
    expect(agencySettingsSchema.safeParse({ outreachIntervalsDays: [4] }).success).toBe(false);
    expect(
      agencySettingsSchema.safeParse({
        guardModes: {
          jdApproval: 'ignore',
          resumeApproval: 'block',
          consent: 'block',
          recruiterAssessment: 'block',
        },
      }).success,
    ).toBe(false);
    expect(agencySettingsSchema.safeParse({ rejectionReasons: [] }).success).toBe(false);
    expect(
      agencySettingsSchema.safeParse({ rejectionReasons: ['Too junior', 'too junior'] }).success,
    ).toBe(false);
    expect(agencySettingsSchema.safeParse({ rejectionReasons: ['x'] }).success).toBe(false);
    expect(agencySettingsSchema.safeParse({ visibility: 'everything' }).success).toBe(false);
    expect(agencySettingsSchema.safeParse({ guardModes: { consent: 'warn' } }).success).toBe(false); // all four together
    expect(
      agencySettingsSchema.safeParse({
        guardModes: {
          jdApproval: 'warn',
          resumeApproval: 'block',
          consent: 'block',
          recruiterAssessment: 'block',
        },
      }).success,
    ).toBe(true);
  });
});

describe('parseAgencySettings (lenient read)', () => {
  it('returns defaults for null, arrays and junk', () => {
    for (const raw of [null, undefined, [], 'text', 42])
      expect(parseAgencySettings(raw).recentlyContactedDays).toBe(30);
  });

  it('keeps valid keys and falls back per key for invalid ones', () => {
    const s = parseAgencySettings({
      recentlyContactedDays: 14,
      outreachIntervalsDays: 'soon',
      visibility: 'own_and_shared',
      unknown: true,
      locale: 'ko',
    });
    expect(s).toMatchObject({
      recentlyContactedDays: 14,
      outreachIntervalsDays: [4, 7],
      visibility: 'own_and_shared',
      locale: 'ko',
    });
    expect(s).not.toHaveProperty('unknown');
  });

  it('falls back when the stored weights no longer add up', () => {
    expect(
      parseAgencySettings({
        defaultMatchingWeights: { ...DEFAULT_MATCH_WEIGHTS, coreCompetencies: 99 },
      }).defaultMatchingWeights,
    ).toEqual(DEFAULT_MATCH_WEIGHTS);
  });
});

describe('settings patch', () => {
  it('needs at least one key and accepts any subset', () => {
    expect(agencySettingsPatchSchema.safeParse({}).success).toBe(false);
    expect(agencySettingsPatchSchema.safeParse({ recentlyContactedDays: 7 }).success).toBe(true);
    expect(
      agencySettingsPatchSchema.safeParse({
        guardModes: {
          jdApproval: 'warn',
          resumeApproval: 'block',
          consent: 'block',
          recruiterAssessment: 'block',
        },
      }).success,
    ).toBe(true);
    expect(agencySettingsPatchSchema.safeParse({ recentlyContactedDays: 'x' }).success).toBe(false);
    expect(agencySettingsPatchSchema.safeParse({ guardModes: { consent: 'warn' } }).success).toBe(
      false,
    ); // must send all four
    expect(agencySettingsPatchSchema.parse({ recentlyContactedDays: 7 })).toEqual({
      recentlyContactedDays: 7,
    }); // no defaults leak in
  });
});
