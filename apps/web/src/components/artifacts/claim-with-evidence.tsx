// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { isInferred, type Claim } from '@easemuse/core';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';

/**
 * A claim about a candidate with its support (FR-AI-05). A claim that cites the source shows an
 * "Evidence (n)" control whose tooltip quotes the source on hover and on keyboard focus; a claim
 * with no citation carries a visible "Inferred" label, because that fact must never depend on hover.
 */
export function ClaimWithEvidence({ claim }: { claim: Claim }) {
  const t = useTranslations('artifacts.evidence');
  const quotes = claim.evidence.flatMap((e) => (e.type === 'quote' ? [e] : []));
  const inferred = isInferred(claim);

  return (
    <span className="inline-flex flex-wrap items-baseline gap-2">
      <span>{claim.text}</span>
      {inferred ? (
        <Badge variant="draft" title={t('inferredHint')}>
          {t('inferred')}
        </Badge>
      ) : (
        <Tooltip
          content={
            <span className="flex flex-col gap-2">
              {quotes.map((quote, index) => (
                <span key={index} className="block">
                  <span className="block text-[11px] opacity-80">
                    {t('from', { source: t(`source.${quote.source}`) })}
                    {quote.location ? ` · ${quote.location}` : ''}
                  </span>
                  <q>{quote.excerpt}</q>
                </span>
              ))}
            </span>
          }
        >
          <button
            type="button"
            className="rounded-sm border border-border px-1.5 text-xs underline decoration-dotted"
          >
            {t('count', { count: quotes.length })}
          </button>
        </Tooltip>
      )}
    </span>
  );
}
