// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';
import { e2eModeProblem, isE2eMode } from '@/lib/e2e-mode';
import { EnvError, parseEnv } from '@/lib/env';
import { promptRegistry } from './prompts';
import { registerBuiltInPrompts } from './prompts/index';
import { PURPOSES, type PurposeId } from './purposes';
import { sampleFromSchema } from './sample-from-schema';
import { createStubModelClient } from './stub-client';

afterEach(() => vi.unstubAllEnvs());

/** The registry is process-wide; register the built-in prompts once per file. */
const withPrompts = () => {
  if (!promptRegistry.get('jd.structure')) registerBuiltInPrompts(promptRegistry);
};

describe('the end-to-end test model (T-QA-06)', () => {
  it('cannot be built, or switched on, unless E2E_MODE=1 outside production', () => {
    vi.stubEnv('E2E_MODE', '');
    expect(isE2eMode()).toBe(false);
    expect(() => createStubModelClient()).toThrow(/end-to-end test mode/);
    vi.stubEnv('E2E_MODE', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(isE2eMode()).toBe(false);
    expect(() => createStubModelClient()).toThrow(/end-to-end test mode/);
    vi.stubEnv('NODE_ENV', 'development');
    expect(isE2eMode()).toBe(true);
    expect(() => createStubModelClient()).not.toThrow();
  });

  it('keeps a production process from starting with it set', () => {
    const production: Record<string, string> = {
      NODE_ENV: 'production',
      E2E_MODE: '1',
      DATABASE_URL: 'postgresql://x',
    };
    expect(e2eModeProblem(production as NodeJS.ProcessEnv)).toMatch(
      /must not be set in production/,
    );
    expect(() => parseEnv(production)).toThrow(EnvError);
    expect(() => parseEnv(production)).toThrow(/E2E_MODE/);
    // Fine in development, and an ordinary production setup without it is not affected by this check.
    expect(
      e2eModeProblem({ NODE_ENV: 'development', E2E_MODE: '1' } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(e2eModeProblem({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeNull();
    expect(() =>
      parseEnv({ NODE_ENV: 'development', E2E_MODE: '1', DATABASE_URL: 'x' }),
    ).not.toThrow();
  });

  it('answers every purpose that has a prompt with something its real schema accepts', async () => {
    vi.stubEnv('E2E_MODE', '1');
    vi.stubEnv('NODE_ENV', 'development');
    withPrompts();
    const model = createStubModelClient();
    for (const id of Object.keys(PURPOSES) as PurposeId[]) {
      const prompt = promptRegistry.get(id);
      if (!prompt) continue;
      const chunks: string[] = [];
      const response = await model.complete({
        purpose: id,
        model: PURPOSES[id].model,
        effort: 'low',
        system: 's',
        user: 'u',
        schema: prompt.schema as never,
        maxTokens: 1000,
        onDelta: (text) => chunks.push(text),
      });
      expect(prompt.schema.safeParse(response.parsed).success, id).toBe(true);
      expect(chunks.join('')).toBe(JSON.stringify(response.parsed));
    }
  });

  it('gives the screens something to show: a named candidate, must-have requirements, a draft outreach', async () => {
    vi.stubEnv('E2E_MODE', '1');
    vi.stubEnv('NODE_ENV', 'development');
    withPrompts();
    const model = createStubModelClient();
    const ask = async (id: PurposeId) =>
      (
        await model.complete({
          purpose: id,
          model: 'm',
          effort: 'low',
          system: 's',
          user: 'u',
          schema: promptRegistry.get(id)!.schema as never,
          maxTokens: 1,
        })
      ).parsed as Record<string, unknown>;
    expect((await ask('profile.structure')).fullName).toBe('Alex Kim');
    expect(JSON.stringify(await ask('jd.structure'))).toContain('must_have');
    expect(String((await ask('outreach.draft')).body)).toContain('{{first_name}}');
  });
});

describe('sampleFromSchema', () => {
  it('gives a value every registered schema accepts, except where a rule needs a real answer', () => {
    withPrompts();
    const failures: string[] = [];
    for (const id of Object.keys(PURPOSES) as PurposeId[]) {
      const prompt = promptRegistry.get(id);
      if (prompt && !prompt.schema.safeParse(sampleFromSchema(prompt.schema as never)).success)
        failures.push(id);
    }
    // match.analyze needs exactly seven criteria; the stub supplies them.
    expect(failures).toEqual(['match.analyze']);
  });
});
