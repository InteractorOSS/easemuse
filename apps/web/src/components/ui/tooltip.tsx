// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = TooltipPrimitive.Provider;

/** Short hint on hover or keyboard focus. Never the only place important information appears. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
