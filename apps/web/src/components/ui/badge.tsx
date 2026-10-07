// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  neutral: 'border border-border bg-surface text-foreground',
  draft: 'bg-draft-badge-background text-draft-badge',
} as const;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof VARIANTS;
}

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
