// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor, OutreachTemplateInput } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { readyMatchEntry } from '@/test/match-fixtures';
import { planOutreachDraft, setSequence } from './service';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from './templates';

const include = {
  keyAppeal: true,
  company: true,
  growth: true,
  impact: true,
  compensation: false,
  location: true,
  nextStep: true,
};
const base = (over: Partial<OutreachTemplateInput> = {}): OutreachTemplateInput => ({
  name: 'Warm intro',
  channel: 'email',
  body: 'Hi {{first_name}}, I came across your profile and thought of a role.\n\n{{recruiter_name}}',
  clientId: null,
  shared: false,
  ...over,
});

describe.skipIf(!dbAvailable())('outreach templates (T-5-11, FR-OUT-06)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let other: string;
  let alice: AgencyActor;
  let bob: AgencyActor;
  let lead: AgencyActor;
  let outsider: AgencyActor;
  let clientA: string;
  let clientB: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const member = async (ag: string, role: 'recruiter' | 'lead'): Promise<AgencyActor> => {
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
      [ag, u, role],
    );
    return { kind: 'agency', userId: u, agencyId: ag, role };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Templates A');
    other = await createAgency(admin, 'Templates B');
    alice = await member(agency, 'recruiter');
    bob = await member(agency, 'recruiter');
    lead = await member(agency, 'lead');
    outsider = await member(other, 'lead');
    clientA = (await run((tx) => createClient(tx, lead, { name: 'Client A' }))).client.id;
    clientB = (await run((tx) => createClient(tx, lead, { name: 'Client B' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency, other] });
    await admin.end();
    await handle.close();
  });

  it('keeps personal templates private; a lead shares one with the agency; a recruiter cannot', async () => {
    const mine = await run((tx) => createTemplate(tx, alice, base({ name: 'Alice only' })));
    expect(mine).toMatchObject({ shared: false, canEdit: true, ownerId: alice.userId });
    await expect(
      run((tx) => createTemplate(tx, alice, base({ shared: true, name: 'Nope' }))),
    ).rejects.toMatchObject({ status: 403 });
    const shared = await run((tx) =>
      createTemplate(tx, lead, base({ shared: true, name: 'House style' })),
    );
    expect(shared).toMatchObject({ shared: true, ownerId: null });

    const aliceSees = (await run((tx) => listTemplates(tx, alice))).map((t) => t.name);
    expect(aliceSees).toEqual(['House style', 'Alice only']);
    const bobSees = await run((tx) => listTemplates(tx, bob));
    expect(bobSees.map((t) => t.name)).toEqual(['House style']);
    expect(bobSees[0]!.canEdit).toBe(false);
    // Someone else's personal template is not even found.
    await expect(run((tx) => deleteTemplate(tx, bob, mine.id))).rejects.toMatchObject({
      status: 404,
    });
    // A shared one is for leads to change; a recruiter gets a clear refusal.
    await expect(
      run((tx) => updateTemplate(tx, bob, shared.id, base({ shared: true }))),
    ).rejects.toMatchObject({ status: 403 });
    await run((tx) =>
      updateTemplate(tx, lead, shared.id, base({ shared: true, name: 'House style 2' })),
    );
    await run((tx) => deleteTemplate(tx, alice, mine.id));
    expect((await run((tx) => listTemplates(tx, alice))).map((t) => t.name)).toEqual([
      'House style 2',
    ]);
  });

  it('narrows the list to a candidate’s client, and refuses a client of another agency', async () => {
    const forA = await run((tx) =>
      createTemplate(tx, alice, base({ name: 'For A', clientId: clientA })),
    );
    await run((tx) => createTemplate(tx, alice, base({ name: 'For B', clientId: clientB })));
    expect(forA.clientName).toBe('Client A');
    const { entry } = await readyMatchEntry(run, alice, clientA);
    const fitting = await run((tx) => listTemplates(tx, alice, { entryId: entry.id }));
    expect(fitting.map((t) => t.name)).toContain('For A');
    expect(fitting.map((t) => t.name)).not.toContain('For B');
    await expect(
      run((tx) =>
        createTemplate(tx, alice, base({ clientId: '11111111-1111-4111-8111-111111111111' })),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('starts a draft from the chosen template, if it fits the channel and the client', async () => {
    const { entry, positionId } = await readyMatchEntry(run, alice, clientA);
    await admin.query(`UPDATE "Position" SET status = 'sourcing' WHERE id = $1`, [positionId]);
    await admin.query(
      `UPDATE "PipelineEntry" SET state = 'screened', "screeningClass" = 'priority' WHERE id = $1`,
      [entry.id],
    );
    await run((tx) => setSequence(tx, alice, entry.id, { channel: 'email' }));
    const good = await run((tx) =>
      createTemplate(tx, alice, base({ name: 'Good fit', clientId: clientA })),
    );
    const plan = await run((tx) => planOutreachDraft(tx, alice, entry.id, 1, include, good.id));
    expect(plan.input.template).toEqual({ name: 'Good fit', body: good.body });
    expect(plan.inputRefs).toMatchObject({ templateId: good.id });
    // Without one, the draft is as before.
    const plain = await run((tx) => planOutreachDraft(tx, alice, entry.id, 1, include));
    expect(plain.input.template).toBeUndefined();

    const wrongChannel = await run((tx) =>
      createTemplate(tx, alice, base({ channel: 'linkedin' })),
    );
    await expect(
      run((tx) => planOutreachDraft(tx, alice, entry.id, 1, include, wrongChannel.id)),
    ).rejects.toMatchObject({ status: 409 });
    const wrongClient = await run((tx) => createTemplate(tx, alice, base({ clientId: clientB })));
    await expect(
      run((tx) => planOutreachDraft(tx, alice, entry.id, 1, include, wrongClient.id)),
    ).rejects.toMatchObject({ status: 409 });
    const bobs = await run((tx) => createTemplate(tx, bob, base({ name: 'Bob private' })));
    await expect(
      run((tx) => planOutreachDraft(tx, alice, entry.id, 1, include, bobs.id)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("never shows or touches another agency's templates", async () => {
    const asOther = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(other, fn);
    const t = await run((tx) => createTemplate(tx, lead, base({ shared: true, name: 'Ours' })));
    expect(await asOther((tx) => listTemplates(tx, outsider))).toEqual([]);
    await expect(asOther((tx) => deleteTemplate(tx, outsider, t.id))).rejects.toMatchObject({
      status: 404,
    });
  });
});
