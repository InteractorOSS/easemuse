// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * In-app help (goal G#4). Help is organised by audience; each audience has a list of topics whose
 * copy lives in `messages/<locale>/help.json` under `<audience>.<topic>`. The recruiter guide
 * follows the process steps of the product brief (init.docx §2); the section numbers below are the
 * brief sections each topic explains and are shown on the page so a reader can find the source.
 */
export const HELP_AUDIENCES = ['recruiter', 'hiring_manager', 'candidate', 'admin'] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];

/** Topic slugs per audience, in reading order. */
export const HELP_TOPICS = {
  recruiter: [
    'principles',
    'getting-started',
    'client-intake',
    'benchmarking',
    'hm-validation',
    'sourcing',
    'matching',
    'screening',
    'outreach',
    'qualification',
    'resume-approval',
    'submission',
    'interviews',
    'offer',
    'analytics',
    'experience',
    'agency-admin',
  ],
  hiring_manager: ['getting-started', 'reviewing', 'interviews', 'privacy'],
  candidate: ['getting-started', 'profile', 'consent', 'privacy'],
  admin: ['overview', 'agencies', 'monitoring', 'configuration', 'audit-and-deletions', 'admins'],
} as const satisfies Record<HelpAudience, readonly string[]>;

export type HelpTopic<A extends HelpAudience = HelpAudience> = (typeof HELP_TOPICS)[A][number];

/** Brief sections (init.docx) a topic explains, for the "Based on" line. Empty for product-only topics. */
export const HELP_BRIEF_SECTIONS: Partial<Record<HelpAudience, Record<string, string>>> = {
  recruiter: {
    principles: '§1.1',
    'client-intake': '§3.1–3.2',
    benchmarking: '§3.3',
    'hm-validation': '§3.4',
    sourcing: '§4',
    matching: '§5',
    screening: '§6',
    outreach: '§7',
    qualification: '§8',
    'resume-approval': '§9',
    submission: '§10',
    interviews: '§11',
    offer: '§12',
    analytics: '§13',
    experience: '§14',
  },
  hiring_manager: { reviewing: '§3.4, §10', interviews: '§11' },
  candidate: { profile: '§9.2' },
};

export function isHelpAudience(value: unknown): value is HelpAudience {
  return typeof value === 'string' && (HELP_AUDIENCES as readonly string[]).includes(value);
}

export function isHelpTopic(audience: HelpAudience, topic: string): boolean {
  return (HELP_TOPICS[audience] as readonly string[]).includes(topic);
}

/** Address of the help index (no topic) or of one topic. */
export function helpHref(
  audience: HelpAudience,
  agencySlug: string | null,
  topic?: string,
): string {
  const base =
    audience === 'recruiter'
      ? `/a/${agencySlug}/help`
      : audience === 'hiring_manager'
        ? `/h/${agencySlug}/help`
        : audience === 'candidate'
          ? `/c/${agencySlug}/help`
          : '/admin/help';
  return topic ? `${base}/${topic}` : base;
}

/** Which audience's help covers a page address, from its first path segment. */
export function audienceForPath(pathname: string): HelpAudience | null {
  const first = pathname.split('/')[1];
  if (first === 'a') return 'recruiter';
  if (first === 'h') return 'hiring_manager';
  if (first === 'c') return 'candidate';
  if (first === 'admin') return 'admin';
  return null;
}

type Rule = readonly [RegExp, string];

/**
 * First matching rule wins; the path is relative to the area root (`/a/<slug>`, `/h/<slug>`,
 * `/c/<slug>`, `/admin`) and has no trailing slash. A route with no rule has no topic, which the
 * guard test (topics.test.ts) treats as a failure so a new page cannot ship without help.
 */
const RULES: Record<HelpAudience, readonly Rule[]> = {
  recruiter: [
    [/^\/help\/([^/]+)$/, '$1'],
    [/^\/help$/, 'getting-started'],
    [/^\/tasks$/, 'getting-started'],
    [/^\/clients$/, 'client-intake'],
    [/^\/positions(\/new)?$/, 'client-intake'],
    [/^\/positions\/[^/]+$/, 'client-intake'],
    [/^\/positions\/[^/]+\/structure$/, 'client-intake'],
    [/^\/positions\/[^/]+\/(questions|profile)$/, 'hm-validation'],
    [/^\/positions\/[^/]+\/(search|pool)$/, 'sourcing'],
    [/^\/positions\/[^/]+\/benchmark$/, 'benchmarking'],
    [/^\/positions\/[^/]+\/client-history$/, 'experience'],
    [/^\/positions\/[^/]+\/candidates(\/[^/]+)?$/, 'matching'],
    [/^\/candidates(\/(new|import|bulk))?$/, 'sourcing'],
    [/^\/candidates\/[^/]+(\/review)?$/, 'sourcing'],
    [/^\/artifacts\/[^/]+$/, 'principles'],
    [/^\/analytics$/, 'analytics'],
    [/^\/settings(\/.*)?$/, 'agency-admin'],
    [/^$/, 'getting-started'],
  ],
  hiring_manager: [
    [/^\/help\/([^/]+)$/, '$1'],
    [/^\/help$/, 'getting-started'],
    [/^\/enter$/, 'getting-started'],
    [/^\/s\/[^/]+$/, 'reviewing'],
    [/^$/, 'reviewing'],
  ],
  candidate: [
    [/^\/help\/([^/]+)$/, '$1'],
    [/^\/help$/, 'getting-started'],
    [/^\/enter$/, 'getting-started'],
    [/^\/details$/, 'profile'],
    [/^\/consent$/, 'consent'],
    [/^\/privacy$/, 'privacy'],
    [/^\/s\/[^/]+$/, 'profile'],
    [/^$/, 'getting-started'],
  ],
  admin: [
    [/^\/help\/([^/]+)$/, '$1'],
    [/^\/help$/, 'overview'],
    [/^\/agencies(\/.*)?$/, 'agencies'],
    [/^\/usage$/, 'monitoring'],
    [/^\/health$/, 'monitoring'],
    [/^\/config$/, 'configuration'],
    [/^\/settings$/, 'configuration'],
    [/^\/audit$/, 'audit-and-deletions'],
    [/^\/deletions$/, 'audit-and-deletions'],
    [/^\/admins$/, 'admins'],
    [/^$/, 'overview'],
  ],
};

/** The agency slug in a workbench or portal address, or null (admin has none). */
export function agencySlugForPath(pathname: string): string | null {
  const parts = pathname.split('/');
  return parts[1] === 'admin' ? null : (parts[2] ?? null);
}

/**
 * The help topic that fits a page address, or null when no rule covers it. The result is always a
 * real topic of the audience (a `/help/<unknown>` address has none).
 */
export function topicForPath(pathname: string): { audience: HelpAudience; topic: string } | null {
  const audience = audienceForPath(pathname);
  if (!audience) return null;
  const parts = pathname.replace(/\/+$/, '').split('/');
  const rest = '/' + parts.slice(audience === 'admin' ? 2 : 3).join('/');
  const relative = rest === '/' ? '' : rest;
  for (const [pattern, template] of RULES[audience]) {
    const match = pattern.exec(relative);
    if (!match) continue;
    const topic = template.replace('$1', match[1] ?? '');
    return isHelpTopic(audience, topic) ? { audience, topic } : null;
  }
  return null;
}
