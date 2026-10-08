// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Top bar shared by the public landing page and the signed-in workspace chooser. */
export function SiteHeader({ appName, children }: { appName: string; children?: ReactNode }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          {appName}
        </Link>
        <div className="flex items-center gap-3">{children}</div>
      </div>
    </header>
  );
}
