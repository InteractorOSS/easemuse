// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { clsx, type ClassValue } from 'clsx';

/** Joins class names, skipping falsy values. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
