// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  LOGO_MAX_BYTES,
  LOGO_MAX_PIXELS,
  parseBranding,
  type AgencyActor,
  type AgencyBranding,
  type AgencyBrandingPatch,
} from '@easemuse/core';
import { withAgency, type ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { readImageInfo } from './image';

/** What the settings page shows (FR-TEN-04). The display name falls back to the agency name. */
export interface BrandingView {
  agencyName: string;
  displayName: string | null;
  primaryColor: string;
  logoFileId: string | null;
}

export interface LogoImage {
  fileId: string;
  contentType: string;
  bytes: Buffer;
  sha256: string;
}

const view = (name: string, branding: AgencyBranding): BrandingView => ({
  agencyName: name,
  displayName: branding.displayName ?? null,
  primaryColor: branding.primaryColor,
  logoFileId: branding.logoFileId ?? null,
});

async function loadAgency(tx: ScopedTx, agencyId: string) {
  const row = await tx.agency.findUnique({
    where: { id: agencyId },
    select: { name: true, branding: true },
  });
  if (!row) throw notFound('Agency');
  return { name: row.name, branding: parseBranding(row.branding) };
}

async function saveBranding(tx: ScopedTx, agencyId: string, branding: AgencyBranding) {
  await tx.agency.update({
    where: { id: agencyId },
    data: { branding: branding as unknown as Prisma.InputJsonValue },
  });
}

const logEntry = (actor: AgencyActor, action: string, data: Prisma.InputJsonValue) => ({
  agencyId: actor.agencyId,
  actorType: 'user',
  actorId: actor.userId,
  action,
  entityType: 'agency',
  entityId: actor.agencyId,
  data,
});

export async function readBranding(actor: AgencyActor): Promise<BrandingView> {
  return withAgency(
    actor.agencyId,
    async (tx) => {
      const { name, branding } = await loadAgency(tx, actor.agencyId);
      return view(name, branding);
    },
    { userId: actor.userId },
  );
}

/** Changes the display name and colour. The change is logged with the names of the fields, not their values. */
export async function updateBranding(
  actor: AgencyActor,
  patch: AgencyBrandingPatch,
): Promise<BrandingView> {
  return withAgency(
    actor.agencyId,
    async (tx) => {
      const { name, branding } = await loadAgency(tx, actor.agencyId);
      const next: AgencyBranding = { ...branding };
      if (patch.primaryColor !== undefined) next.primaryColor = patch.primaryColor;
      if (patch.displayName === null) delete next.displayName;
      else if (patch.displayName !== undefined) next.displayName = patch.displayName;
      await saveBranding(tx, actor.agencyId, next);
      await tx.activityLog.create({
        data: logEntry(actor, 'branding.updated', {
          keys: Object.keys(patch).filter(
            (k) => patch[k as keyof AgencyBrandingPatch] !== undefined,
          ),
        }),
      });
      return view(name, next);
    },
    { userId: actor.userId },
  );
}

/** Deletes the stored logo file of this agency, if any. */
async function dropLogoFile(tx: ScopedTx, agencyId: string, fileId: string | undefined) {
  if (!fileId) return;
  await tx.fileBlob.deleteMany({ where: { agencyId, fileId } });
  await tx.fileObject.deleteMany({ where: { agencyId, id: fileId } });
}

/**
 * Stores a new logo (PNG or JPEG, at most 512 KB and 4000 px a side) and replaces the old one. The
 * type is decided from the bytes. The logo lives in the agency's own database tables, under RLS.
 */
export async function setLogo(
  actor: AgencyActor,
  input: { bytes: Uint8Array },
): Promise<BrandingView> {
  const { bytes } = input;
  if (bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) {
    throw new ApiError('file_too_large', 'The logo can be at most 512 KB', { status: 413 });
  }
  const info = readImageInfo(bytes);
  if (!info) {
    throw new ApiError('unsupported_type', 'Upload a PNG or JPEG image', { status: 415 });
  }
  if (
    info.width < 1 ||
    info.height < 1 ||
    info.width > LOGO_MAX_PIXELS ||
    info.height > LOGO_MAX_PIXELS
  ) {
    throw new ApiError(
      'invalid_input',
      `The logo can be at most ${LOGO_MAX_PIXELS} px wide or high`,
      {
        status: 422,
        fields: { file: 'Too large in pixels' },
      },
    );
  }
  return withAgency(
    actor.agencyId,
    async (tx) => {
      const { name, branding } = await loadAgency(tx, actor.agencyId);
      const file = await tx.fileObject.create({
        data: {
          agencyId: actor.agencyId,
          store: 'db',
          filename: info.contentType === 'image/png' ? 'logo.png' : 'logo.jpg',
          contentType: info.contentType,
          sizeBytes: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          createdById: actor.userId,
        },
      });
      await tx.fileBlob.create({
        data: { agencyId: actor.agencyId, fileId: file.id, bytes: Buffer.from(bytes) },
      });
      await dropLogoFile(tx, actor.agencyId, branding.logoFileId);
      const next = { ...branding, logoFileId: file.id };
      await saveBranding(tx, actor.agencyId, next);
      await tx.activityLog.create({
        data: logEntry(actor, 'branding.logo_set', { contentType: info.contentType }),
      });
      return view(name, next);
    },
    { userId: actor.userId },
  );
}

export async function removeLogo(actor: AgencyActor): Promise<BrandingView> {
  return withAgency(
    actor.agencyId,
    async (tx) => {
      const { name, branding } = await loadAgency(tx, actor.agencyId);
      if (!branding.logoFileId) return view(name, branding);
      await dropLogoFile(tx, actor.agencyId, branding.logoFileId);
      const next = { ...branding };
      delete next.logoFileId;
      await saveBranding(tx, actor.agencyId, next);
      await tx.activityLog.create({ data: logEntry(actor, 'branding.logo_removed', {}) });
      return view(name, next);
    },
    { userId: actor.userId },
  );
}

/** The logo bytes, or null when there is none (or the file is gone: a render must not fail over a logo). */
export async function loadLogo(
  tx: ScopedTx,
  agencyId: string,
  branding: AgencyBranding,
): Promise<LogoImage | null> {
  if (!branding.logoFileId) return null;
  const file = await tx.fileObject.findFirst({
    where: { id: branding.logoFileId, agencyId, store: 'db' },
    select: { id: true, contentType: true, sha256: true },
  });
  const blob = file ? await tx.fileBlob.findUnique({ where: { fileId: file.id } }) : null;
  if (!file || !blob) return null;
  return {
    fileId: file.id,
    contentType: file.contentType,
    bytes: Buffer.from(blob.bytes),
    sha256: file.sha256,
  };
}
