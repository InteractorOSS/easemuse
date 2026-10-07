// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

// Placeholder shell; real copy moves to next-intl in T-F-19.
const TITLE = 'EaseMuse';
const TAGLINE = 'AI-assisted recruiter workbench';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{TITLE}</h1>
      <p>{TAGLINE}</p>
    </main>
  );
}
