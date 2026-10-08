// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { PortalDirectoryQuery } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';

export interface DirectoryPerson {
  /** Client contact id or candidate id. */
  personId: string;
  name: string;
  title: string | null;
  hasEmail: boolean;
  portalUser: { id: string; disabled: boolean } | null;
}

/** Who can be invited to the portal and who already has access, for the recruiter's invite and share screens. */
export async function listDirectory(
  tx: ScopedTx,
  query: PortalDirectoryQuery,
): Promise<DirectoryPerson[]> {
  if (query.positionId || query.entryId) {
    const position = query.positionId
      ? await tx.position.findUnique({
          where: { id: query.positionId },
          select: { clientId: true },
        })
      : (
          await tx.pipelineEntry.findUnique({
            where: { id: query.entryId! },
            select: { position: { select: { clientId: true } } },
          })
        )?.position;
    if (!position) throw notFound('Position');
    const contacts = await tx.clientContact.findMany({
      where: { clientId: position.clientId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        portalUser: { select: { id: true, disabledAt: true } },
      },
    });
    return contacts.map((c) => ({
      personId: c.id,
      name: c.name,
      title: c.title,
      hasEmail: Boolean(c.email),
      portalUser: c.portalUser
        ? { id: c.portalUser.id, disabled: c.portalUser.disabledAt !== null }
        : null,
    }));
  }
  const candidate = await tx.candidate.findUnique({
    where: { id: query.candidateId! },
    select: {
      id: true,
      fullName: true,
      email: true,
      anonymizedAt: true,
      portalUser: { select: { id: true, disabledAt: true } },
    },
  });
  if (!candidate || candidate.anonymizedAt) throw notFound('Candidate');
  return [
    {
      personId: candidate.id,
      name: candidate.fullName,
      title: null,
      hasEmail: Boolean(candidate.email),
      portalUser: candidate.portalUser
        ? { id: candidate.portalUser.id, disabled: candidate.portalUser.disabledAt !== null }
        : null,
    },
  ];
}
