// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'EaseMuse',
  description: 'AI-assisted recruiter workbench',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
