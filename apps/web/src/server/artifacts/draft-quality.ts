// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';
import { editRatio, flattenText } from '@/lib/edit-distance';

/**
 * Draft-quality metric (T-AI-14, ADR-006, BR-002): how much recruiters change AI drafts before they
 * approve them. BR-002 asks to prioritise draft quality when more than 60% of approved drafts needed
 * edits. Lives in the artifacts module because it reads versions, drafts included.
 */
export interface DraftQualityRow {
  /** AI purpose (for example `jd.structure`), or `all`. */
  purpose: string;
  /** AI drafts approved in the period. */
  approved: number;
  /** Approved exactly as the AI wrote them. */
  unchanged: number;
  edited: number;
  /** edited / approved, 0 when nothing was approved. */
  editRate: number;
  /** Mean and median share of words changed, over approved drafts. */
  meanEditRatio: number;
  medianEditRatio: number;
  /** AI drafts discarded in the period. */
  discarded: number;
}

/** The share above which draft quality becomes the priority (BR-002). */
export const EDIT_RATE_ALERT = 0.6;

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const round = (n: number) => Math.round(n * 10_000) / 10_000;

function summarise(purpose: string, ratios: number[], discarded: number): DraftQualityRow {
  const approved = ratios.length;
  const unchanged = ratios.filter((r) => r === 0).length;
  const edited = approved - unchanged;
  return {
    purpose,
    approved,
    unchanged,
    edited,
    editRate: approved === 0 ? 0 : round(edited / approved),
    meanEditRatio: approved === 0 ? 0 : round(ratios.reduce((s, r) => s + r, 0) / approved),
    medianEditRatio: round(median(ratios)),
    discarded,
  };
}

/** Per-purpose draft quality for the agency in scope (RLS), plus an `all` row. */
export async function getDraftQuality(
  tx: ScopedTx,
  input: { since: Date; until?: Date },
): Promise<DraftQualityRow[]> {
  const until = input.until ?? new Date();
  const approvedRows = await tx.artifactVersion.findMany({
    where: { status: 'approved', approvedAt: { gte: input.since, lt: until } },
    select: { artifactId: true, id: true, origin: true, content: true, parentVersionId: true },
  });
  const discardedRows = await tx.artifactVersion.findMany({
    where: { status: 'discarded', origin: 'ai', updatedAt: { gte: input.since, lt: until } },
    select: { aiGenerationId: true },
  });

  const artifactIds = [...new Set(approvedRows.map((v) => v.artifactId))];
  const all = artifactIds.length
    ? await tx.artifactVersion.findMany({
        where: { artifactId: { in: artifactIds } },
        select: {
          id: true,
          origin: true,
          content: true,
          parentVersionId: true,
          aiGenerationId: true,
        },
      })
    : [];
  const byId = new Map(all.map((v) => [v.id, v]));

  const generationIds = new Set<string>();
  const measured: { generationId: string | null; ratio: number }[] = [];
  for (const approved of approvedRows) {
    // Walk back through the edits to the AI original (bounded, in case of a corrupt chain).
    let node: (typeof all)[number] | undefined = byId.get(approved.id);
    for (let hops = 0; node && node.origin !== 'ai' && node.parentVersionId && hops < 100; hops++) {
      node = byId.get(node.parentVersionId);
    }
    if (!node || node.origin !== 'ai') continue; // written by a person from the start: not an AI draft
    if (node.aiGenerationId) generationIds.add(node.aiGenerationId);
    measured.push({
      generationId: node.aiGenerationId,
      ratio:
        node.id === approved.id
          ? 0
          : editRatio(flattenText(node.content), flattenText(approved.content)),
    });
  }
  for (const d of discardedRows) if (d.aiGenerationId) generationIds.add(d.aiGenerationId);

  const generations = generationIds.size
    ? await tx.aiGeneration.findMany({
        where: { id: { in: [...generationIds] } },
        select: { id: true, purpose: true },
      })
    : [];
  const purposeOf = new Map(generations.map((g) => [g.id, g.purpose]));
  const purposeFor = (generationId: string | null) =>
    generationId ? (purposeOf.get(generationId) ?? 'unknown') : 'unknown';

  const ratiosByPurpose = new Map<string, number[]>();
  for (const m of measured) {
    const purpose = purposeFor(m.generationId);
    ratiosByPurpose.set(purpose, [...(ratiosByPurpose.get(purpose) ?? []), m.ratio]);
  }
  const discardedByPurpose = new Map<string, number>();
  for (const d of discardedRows) {
    const purpose = purposeFor(d.aiGenerationId);
    discardedByPurpose.set(purpose, (discardedByPurpose.get(purpose) ?? 0) + 1);
  }

  const purposes = new Set([...ratiosByPurpose.keys(), ...discardedByPurpose.keys()]);
  const rows = [...purposes]
    .sort()
    .map((p) => summarise(p, ratiosByPurpose.get(p) ?? [], discardedByPurpose.get(p) ?? 0));
  return [
    summarise(
      'all',
      measured.map((m) => m.ratio),
      discardedRows.length,
    ),
    ...rows,
  ];
}
