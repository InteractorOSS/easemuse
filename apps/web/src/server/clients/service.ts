// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import type {
  AgencyActor,
  ClientInput,
  ClientPatch,
  ContactInput,
  ContactPatch,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { decodeCursor, toPage } from '@/lib/http/pagination';
import { logActivity } from '@/server/activity/service';

/** Clients and their contacts (T-1-01, US-101). Every row belongs to the agency in scope (RLS). */
export interface ContactView {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
}
export interface ClientView {
  id: string;
  name: string;
  description: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  contacts: ContactView[];
  /** Number of positions for this client (any status). */
  positionCount: number;
}

const contactSelect = { id: true, name: true, title: true, email: true, phone: true } as const;
const clientSelect = {
  id: true,
  name: true,
  description: true,
  archivedAt: true,
  createdAt: true,
  contacts: { select: contactSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] },
  _count: { select: { positions: true } },
} satisfies Prisma.ClientSelect;

type ClientRow = Prisma.ClientGetPayload<{ select: typeof clientSelect }>;
const toView = ({ _count, ...c }: ClientRow): ClientView => ({
  ...c,
  positionCount: _count.positions,
});

/** Compares names ignoring case, accents-free spacing and punctuation: "Acme, Inc." ≈ "acme inc". */
export const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export async function listClients(
  tx: ScopedTx,
  input: { limit: number; cursor?: string; q?: string; includeArchived: boolean },
): Promise<{ items: ClientView[]; nextCursor: string | null }> {
  const key = input.cursor ? decodeCursor(input.cursor) : undefined;
  const rows = await tx.client.findMany({
    where: {
      ...(input.includeArchived ? {} : { archivedAt: null }),
      ...(input.q ? { name: { contains: input.q, mode: 'insensitive' } } : {}),
      ...(key ? { OR: [{ name: { gt: key.v } }, { name: key.v, id: { gt: key.id } }] } : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: input.limit + 1,
    select: clientSelect,
  });
  const page = toPage(rows, input.limit, (r) => ({ v: r.name, id: r.id }));
  return { items: page.items.map(toView), nextCursor: page.nextCursor };
}

export async function getClient(tx: ScopedTx, clientId: string): Promise<ClientView> {
  const row = await tx.client.findUnique({ where: { id: clientId }, select: clientSelect });
  if (!row) throw notFound('Client');
  return toView(row);
}

/**
 * Creates a client. A name that matches an existing one (ignoring case and punctuation) is a hint,
 * not an error: the client is created and the similar ones are returned so the UI can say so.
 */
export async function createClient(
  tx: ScopedTx,
  actor: AgencyActor,
  input: ClientInput,
): Promise<{ client: ClientView; similar: { id: string; name: string }[] }> {
  const wanted = normalizeName(input.name);
  const existing = await tx.client.findMany({ select: { id: true, name: true } });
  const similar = existing.filter((c) => normalizeName(c.name) === wanted);
  const row = await tx.client.create({
    data: { agencyId: actor.agencyId, name: input.name, description: input.description ?? null },
    select: clientSelect,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'client.created',
    entityType: 'client',
    entityId: row.id,
  });
  return { client: toView(row), similar };
}

export async function updateClient(
  tx: ScopedTx,
  actor: AgencyActor,
  clientId: string,
  patch: ClientPatch,
): Promise<ClientView> {
  const current = await tx.client.findUnique({
    where: { id: clientId },
    select: { id: true, archivedAt: true },
  });
  if (!current) throw notFound('Client');
  const row = await tx.client.update({
    where: { id: clientId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.archived !== undefined
        ? { archivedAt: patch.archived ? (current.archivedAt ?? new Date()) : null }
        : {}),
    },
    select: clientSelect,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action:
      patch.archived === undefined
        ? 'client.updated'
        : patch.archived
          ? 'client.archived'
          : 'client.restored',
    entityType: 'client',
    entityId: clientId,
  });
  return toView(row);
}

async function ownContact(tx: ScopedTx, clientId: string, contactId: string) {
  // The contact must belong to the client in the URL, so a mismatched pair is simply not found.
  const contact = await tx.clientContact.findFirst({
    where: { id: contactId, clientId },
    select: { id: true },
  });
  if (!contact) throw notFound('Contact');
}

export async function addContact(
  tx: ScopedTx,
  actor: AgencyActor,
  clientId: string,
  input: ContactInput,
): Promise<ContactView> {
  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: { id: true, archivedAt: true },
  });
  if (!client) throw notFound('Client');
  if (client.archivedAt)
    throw new ApiError('conflict', 'Restore this client before adding contacts', { status: 409 });
  const contact = await tx.clientContact.create({
    data: {
      agencyId: actor.agencyId,
      clientId,
      name: input.name,
      title: input.title ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
    },
    select: contactSelect,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'client.contact_added',
    entityType: 'client',
    entityId: clientId,
    data: { contactId: contact.id },
  });
  return contact;
}

export async function updateContact(
  tx: ScopedTx,
  clientId: string,
  contactId: string,
  patch: ContactPatch,
): Promise<ContactView> {
  await ownContact(tx, clientId, contactId);
  return tx.clientContact.update({
    where: { id: contactId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    },
    select: contactSelect,
  });
}

/** Removes a contact unless a position names them as its hiring manager or they have a portal login. */
export async function removeContact(
  tx: ScopedTx,
  actor: AgencyActor,
  clientId: string,
  contactId: string,
): Promise<void> {
  await ownContact(tx, clientId, contactId);
  const [asManager, portal] = await Promise.all([
    tx.position.count({ where: { hiringManagerId: contactId } }),
    tx.portalUser.count({ where: { clientContactId: contactId } }),
  ]);
  if (asManager > 0 || portal > 0) {
    throw new ApiError(
      'conflict',
      'This contact is a hiring manager or has portal access; reassign first',
      { status: 409 },
    );
  }
  await tx.clientContact.delete({ where: { id: contactId } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'client.contact_removed',
    entityType: 'client',
    entityId: clientId,
    data: { contactId },
  });
}
