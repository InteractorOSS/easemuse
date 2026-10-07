// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Modal with a required, accessible title; focus is trapped and Escape closes it. */
export function DialogContent({ title, description, children, className }: DialogContentProps) {
  const t = useTranslations('common.actions');
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-foreground/40" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-lg',
          className,
        )}
      >
        <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-sm text-muted">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="mt-4">{children}</div>
        <DialogPrimitive.Close
          aria-label={t('close')}
          className="absolute top-3 right-3 rounded-sm px-2 text-muted hover:bg-surface"
        >
          <span aria-hidden="true">×</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
