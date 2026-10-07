// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface FieldFrameProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  id: string;
  children: ReactNode;
}

function FieldFrame({ label, hint, error, id, children }: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'h-10 rounded-md border border-border bg-background px-3 text-sm aria-[invalid=true]:border-danger';

type CommonProps = { label: ReactNode; hint?: ReactNode; error?: string | undefined };

/** Labelled text input. The error is announced and linked with aria-describedby. */
export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: CommonProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldFrame label={label} hint={hint} error={error} id={id}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
          undefined
        }
        className={cn(CONTROL, className)}
        {...props}
      />
    </FieldFrame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: CommonProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldFrame label={label} hint={hint} error={error} id={id}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(CONTROL, className)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}
