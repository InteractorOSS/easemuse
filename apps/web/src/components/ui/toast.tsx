// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: 'neutral' | 'danger';
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

/** `const { toast } = useToast(); toast({ title: t('saved') })`. Needs a ToastProvider above. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common.actions');
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((input: ToastInput) => {
    setItems((current) => [...current, { ...input, id: Date.now() + Math.random() }]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter((i) => i.id !== item.id));
            }}
            className={cn(
              'rounded-md border p-3 shadow-md',
              item.variant === 'danger'
                ? 'border-danger bg-background'
                : 'border-border bg-background',
            )}
          >
            <ToastPrimitive.Title className="text-sm font-medium">
              {item.title}
            </ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description className="text-sm text-muted">
                {item.description}
              </ToastPrimitive.Description>
            ) : null}
            <ToastPrimitive.Close
              aria-label={t('close')}
              className="absolute top-2 right-2 px-1 text-muted"
            >
              <span aria-hidden="true">×</span>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
