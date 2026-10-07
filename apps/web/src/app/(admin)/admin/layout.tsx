// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { QueryProvider } from '@/components/providers/query-provider';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { platformAdminAccess } from '@/lib/auth/page-access';

/**
 * /admin for platform administrators (FR-ADM-01, ADR-012). Anyone without a platform role gets the
 * same 404 as a page that does not exist; a signed-out visitor goes to sign-in.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await platformAdminAccess();
  return (
    <QueryProvider>
      <ToastProvider>
        <TooltipProvider>
          <AdminShell userName={access.user.name ?? access.user.email} role={access.actor.role}>
            {children}
          </AdminShell>
        </TooltipProvider>
      </ToastProvider>
    </QueryProvider>
  );
}
