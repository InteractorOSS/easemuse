// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'border border-border bg-background text-foreground hover:bg-surface',
  ghost: 'text-foreground hover:bg-surface',
  danger: 'bg-danger text-danger-foreground hover:opacity-90',
} as const;

const SIZES = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm' } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
