// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, OutreachChannelValue, OutreachTemplateInput } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';

/**
 * Outreach templates (T-5-11, FR-OUT-06): messages an AI draft starts from. A template is the
 * author's own, or shared with the whole agency (leads and admins), and may be limited to one
 * client. The AI keeps the template's structure and wording and fills in the facts; the recruiter
 * still edits and approves the result (brief §1.1).
 */
export interface TemplateView {
  id: string;
  name: string;
  channel: OutreachChannelValue;
  body: string;
  clientId: string | null;
  clientName: string | null;
  shared: boolean;
  ownerId: string | null;
  /** The person may change or delete it. */
  canEdit: boolean;
  updatedAt: Date;
}

const isManager = (actor: AgencyActor) => actor.role !== 'recruiter';

async function views(
  tx: ScopedTx,
  actor: AgencyActor,
  rows: {
    id: string;
    name: string;
    channel: string;
    body: string;
    clientId: string | null;
    ownerId: string | null;
    updatedAt: Date;
  }[],
): Promise<TemplateView[]> {
  const ids = [...new Set(rows.map((r) => r.clientId).filter((c): c is string => c !== null))];
  const clients = ids.length
    ? await tx.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const names = new Map(clients.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    channel: r.channel as OutreachChannelValue,
    body: r.body,
    clientId: r.clientId,
    clientName: r.clientId ? (names.get(r.clientId) ?? null) : null,
    shared: r.ownerId === null,
    ownerId: r.ownerId,
    canEdit: r.ownerId === null ? isManager(actor) : r.ownerId === actor.userId,
    updatedAt: r.updatedAt,
  }));
}

/** The person's own templates and the agency's shared ones, shared first, by name. */
export async function listTemplates(
  tx: ScopedTx,
  actor: AgencyActor,
  options: { entryId?: string } = {},
): Promise<TemplateView[]> {
  let clientId: string | null | undefined;
  if (options.entryId) {
    const entry = await tx.pipelineEntry.findUnique({
      where: { id: options.entryId },
      select: { position: { select: { clientId: true } } },
    });
    if (!entry) throw notFound('Candidate in position');
    clientId = entry.position.clientId;
  }
  const rows = await tx.outreachTemplate.findMany({
    where: {
      OR: [{ ownerId: null }, { ownerId: actor.userId }],
      ...(clientId !== undefined ? { AND: [{ OR: [{ clientId: null }, { clientId }] }] } : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  const all = await views(tx, actor, rows);
  return [...all.filter((t) => t.shared), ...all.filter((t) => !t.shared)];
}

async function checkClient(tx: ScopedTx, clientId: string | null) {
  if (
    clientId &&
    !(await tx.client.findUnique({ where: { id: clientId }, select: { id: true } }))
  ) {
    throw new ApiError('invalid_input', 'Choose a client of this agency', {
      status: 422,
      fields: { clientId: 'Choose a client' },
    });
  }
}

export async function createTemplate(
  tx: ScopedTx,
  actor: AgencyActor,
  input: OutreachTemplateInput,
): Promise<TemplateView> {
  if (input.shared && !isManager(actor)) {
    throw forbidden('Only a lead or an admin can share a template with the agency');
  }
  await checkClient(tx, input.clientId);
  const row = await tx.outreachTemplate.create({
    data: {
      agencyId: actor.agencyId,
      ownerId: input.shared ? null : actor.userId,
      clientId: input.clientId,
      name: input.name,
      channel: input.channel,
      body: input.body,
    },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'outreach_template.created',
    entityType: 'outreach_template',
    entityId: row.id,
    data: { shared: input.shared, channel: input.channel },
  });
  return (await views(tx, actor, [row]))[0]!;
}

async function requireEditable(tx: ScopedTx, actor: AgencyActor, id: string) {
  const row = await tx.outreachTemplate.findUnique({ where: { id } });
  if (!row) throw notFound('Template');
  // Someone else's personal template is not visible at all.
  if (row.ownerId !== null && row.ownerId !== actor.userId) throw notFound('Template');
  if (row.ownerId === null ? !isManager(actor) : row.ownerId !== actor.userId) {
    throw forbidden('Only a lead or an admin can change a shared template');
  }
  return row;
}

export async function updateTemplate(
  tx: ScopedTx,
  actor: AgencyActor,
  id: string,
  input: OutreachTemplateInput,
): Promise<TemplateView> {
  const current = await requireEditable(tx, actor, id);
  if (input.shared !== (current.ownerId === null)) {
    if (input.shared && !isManager(actor)) {
      throw forbidden('Only a lead or an admin can share a template with the agency');
    }
  }
  await checkClient(tx, input.clientId);
  const row = await tx.outreachTemplate.update({
    where: { id },
    data: {
      ownerId: input.shared ? null : (current.ownerId ?? actor.userId),
      clientId: input.clientId,
      name: input.name,
      channel: input.channel,
      body: input.body,
    },
  });
  return (await views(tx, actor, [row]))[0]!;
}

export async function deleteTemplate(tx: ScopedTx, actor: AgencyActor, id: string): Promise<void> {
  await requireEditable(tx, actor, id);
  await tx.outreachTemplate.delete({ where: { id } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'outreach_template.deleted',
    entityType: 'outreach_template',
    entityId: id,
    data: {},
  });
}

/**
 * The template a draft starts from, if the person may use it for this touch: visible to them, the
 * touch's channel, and either for every client or for this position's client.
 */
export async function templateForDraft(
  tx: ScopedTx,
  actor: AgencyActor,
  templateId: string,
  fit: { channel: OutreachChannelValue; clientId: string },
): Promise<{ id: string; name: string; body: string }> {
  const row = await tx.outreachTemplate.findFirst({
    where: { id: templateId, OR: [{ ownerId: null }, { ownerId: actor.userId }] },
  });
  if (!row) throw notFound('Template');
  if (row.channel !== fit.channel) {
    throw new ApiError('conflict', 'This template is for another channel', { status: 409 });
  }
  if (row.clientId !== null && row.clientId !== fit.clientId) {
    throw new ApiError('conflict', 'This template is for another client', { status: 409 });
  }
  return { id: row.id, name: row.name, body: row.body };
}
