// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ArtifactKind, FactCheck, SubjectType } from '@easemuse/core';

/** The artifact as the review API returns it (dates arrive as ISO strings). */
export interface VersionView {
  id: string;
  version: number;
  status: 'draft' | 'approved' | 'superseded' | 'discarded';
  origin: 'ai' | 'human' | 'ai_edited';
  content: Record<string, unknown>;
  factCheck: FactCheck | null;
  aiGenerationId: string | null;
  parentVersionId: string | null;
  createdAt: string;
  approvedAt: string | null;
}

export interface ArtifactView {
  id: string;
  kind: ArtifactKind;
  subject: { type: SubjectType; id: string };
  approvedVersionId: string | null;
  versions: VersionView[];
}

/**
 * Lets a feature supply a proper form for its kind (for example the structured JD editor). Without
 * one, the editor shows the content as JSON text.
 */
export interface ContentEditorProps {
  content: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly: boolean;
}
