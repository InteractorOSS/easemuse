// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { FactCheck, FactCheckResolutionsInput } from '@easemuse/core';

export interface FactCheckPanelProps {
  factCheck: FactCheck;
  /** The recruiter's pending decisions, keyed by warning id. */
  resolutions: FactCheckResolutionsInput;
  onChange: (next: FactCheckResolutionsInput) => void;
  /** True for versions that can no longer be approved. */
  readOnly?: boolean;
}

/** Every unsupported claim needs a decision before a generated document can be approved (FR-AI-06). */
export function FactCheckPanel({
  factCheck,
  resolutions,
  onChange,
  readOnly = false,
}: FactCheckPanelProps) {
  const t = useTranslations('artifacts.factCheck');
  const groupId = useId();
  if (factCheck.warnings.length === 0) return <p className="text-sm text-muted">{t('none')}</p>;

  const set = (id: string, value: FactCheckResolutionsInput[string]) =>
    onChange({ ...resolutions, [id]: value });

  return (
    <section aria-labelledby={`${groupId}-title`} className="flex flex-col gap-3">
      <h3 id={`${groupId}-title`} className="font-semibold">
        {t('title')}
      </h3>
      <p className="text-sm text-muted">{t('intro')}</p>
      <ul className="flex flex-col gap-4">
        {factCheck.warnings.map((warning) => {
          const decided = warning.resolution ?? resolutions[warning.id];
          const locked = readOnly || Boolean(warning.resolution);
          const name = `${groupId}-${warning.id}`;
          return (
            <li key={warning.id}>
              <fieldset className="flex flex-col gap-2" disabled={locked}>
                <legend className="text-sm font-medium">{warning.claim}</legend>
                {(['edited', 'confirmed'] as const).map((kind) => (
                  <label key={kind} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={name}
                      checked={decided?.kind === kind}
                      aria-label={`${t(kind)}: ${warning.claim}`}
                      onChange={() =>
                        set(warning.id, { kind, reason: resolutions[warning.id]?.reason })
                      }
                    />
                    {t(kind)}
                  </label>
                ))}
                {decided?.kind === 'confirmed' ? (
                  <label className="flex flex-col gap-1 text-sm">
                    {t('reason')}
                    <input
                      className="h-9 rounded-md border border-border px-2"
                      value={decided.reason ?? ''}
                      readOnly={locked}
                      onChange={(event) =>
                        set(warning.id, { kind: 'confirmed', reason: event.target.value })
                      }
                    />
                  </label>
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
