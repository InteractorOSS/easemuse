// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { useTranslations } from 'next-intl';
import { diffLines, hasChanges } from '@/lib/text-diff';
import { cn } from '@/lib/utils';

/**
 * Changes against the AI original (FR-AI-04). Added and removed lines carry a text marker as well
 * as a color, so the meaning does not rely on color alone.
 */
export function DiffView({ before, after }: { before: string; after: string }) {
  const t = useTranslations('artifacts.diff');
  const lines = diffLines(before, after);
  if (!hasChanges(lines)) return <p className="text-sm text-muted">{t('none')}</p>;
  return (
    <pre
      className="overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs leading-5"
      aria-label={t('toggle')}
    >
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            line.type === 'add' && 'bg-green-100 text-green-900',
            line.type === 'remove' && 'bg-red-100 text-red-900 line-through',
          )}
        >
          <span aria-hidden="true">
            {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}
          </span>
          {line.type !== 'same' ? (
            <span className="sr-only">{`${line.type === 'add' ? t('added') : t('removed')}: `}</span>
          ) : null}
          {line.text}
        </div>
      ))}
    </pre>
  );
}
