// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeChannel, type ChannelAuthDeps } from './authorize-channel';
import { channels } from './channels';

const me = randomUUID();
const agencyA = randomUUID();
const agencyB = randomUUID();
const jobId = randomUUID();

function deps(overrides: Partial<ChannelAuthDeps> = {}): ChannelAuthDeps {
  return {
    isActiveMember: async (agencyId, userId) => agencyId === agencyA && userId === me,
    getJobRun: async () => null,
    ...overrides,
  };
}

const job = (patch: Partial<{ agencyId: string | null; requestedById: string | null }>) => ({
  id: jobId,
  agencyId: agencyA,
  queue: 'ai',
  name: 'x',
  requestedById: null,
  status: 'running' as const,
  progress: null,
  error: null,
  ...patch,
});

describe('authorizeChannel', () => {
  it("allows an active member to subscribe to their agency's channels", async () => {
    expect((await authorizeChannel(channels.agency(agencyA), me, deps())).kind).toBe('agency');
    expect(
      (await authorizeChannel(channels.position(agencyA, randomUUID()), me, deps())).kind,
    ).toBe('position');
  });

  it("answers 404 for another agency's channels, non-members and malformed names", async () => {
    for (const name of [
      channels.agency(agencyB),
      channels.position(agencyB, randomUUID()),
      'agency:*',
      'garbage',
    ]) {
      await expect(authorizeChannel(name, me, deps())).rejects.toMatchObject({ status: 404 });
    }
  });

  it('allows only your own user channel', async () => {
    await expect(authorizeChannel(channels.user(me), me, deps())).resolves.toMatchObject({
      kind: 'user',
    });
    await expect(authorizeChannel(channels.user(randomUUID()), me, deps())).rejects.toMatchObject({
      status: 404,
    });
  });

  it('allows a job channel to members of the job agency, or to the requester of a system job', async () => {
    const agencyJob = deps({ getJobRun: async () => job({}) });
    await expect(authorizeChannel(channels.job(jobId), me, agencyJob)).resolves.toBeTruthy();
    const foreign = deps({ getJobRun: async () => job({ agencyId: agencyB }) });
    await expect(authorizeChannel(channels.job(jobId), me, foreign)).rejects.toMatchObject({
      status: 404,
    });
    const systemMine = deps({ getJobRun: async () => job({ agencyId: null, requestedById: me }) });
    await expect(authorizeChannel(channels.job(jobId), me, systemMine)).resolves.toBeTruthy();
    const systemOther = deps({
      getJobRun: async () => job({ agencyId: null, requestedById: randomUUID() }),
    });
    await expect(authorizeChannel(channels.job(jobId), me, systemOther)).rejects.toMatchObject({
      status: 404,
    });
    await expect(authorizeChannel(channels.job(jobId), me, deps())).rejects.toMatchObject({
      status: 404,
    });
  });
});
