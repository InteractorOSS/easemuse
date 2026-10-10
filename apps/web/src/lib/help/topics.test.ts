// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP_AUDIENCES, HELP_TOPICS, helpHref, topicForPath } from './topics';

const APP = path.resolve(__dirname, '../../app');
const CATALOG = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../messages/en/help.json'), 'utf8'),
);

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return name === 'page.tsx' ? [full] : [];
  });
}

/** `(workbench)/a/[agencySlug]/positions/[positionId]/page.tsx` becomes `/a/acme/positions/p1`. */
function addressOf(file: string): string {
  const dir = path.relative(APP, path.dirname(file)).split(path.sep);
  const parts = dir
    .filter((p) => !(p.startsWith('(') && p.endsWith(')')))
    .map((p) =>
      p === '[agencySlug]'
        ? 'acme'
        : p === '[topic]'
          ? dir.includes('admin')
            ? 'overview'
            : 'getting-started'
          : p.replace(/\[(.+)\]/, '$1-1'),
    );
  return '/' + parts.join('/');
}

const IN_SCOPE = /^\/(a|h|c)\/acme(\/|$)|^\/admin(\/|$)/;

describe('help coverage', () => {
  const pages = pageFiles(APP)
    .map(addressOf)
    .filter((a) => IN_SCOPE.test(a));

  it('finds the workbench, portal and admin pages', () => {
    expect(pages.length).toBeGreaterThan(30);
    for (const prefix of ['/a/acme/', '/h/acme/', '/c/acme/', '/admin/'])
      expect(
        pages.some((p) => p.startsWith(prefix)),
        prefix,
      ).toBe(true);
  });

  it('gives every workbench, portal and admin page a help topic', () => {
    const without = pages.filter((address) => topicForPath(address) === null);
    expect(without, 'pages with no help topic: add a rule in lib/help/topics.ts').toEqual([]);
  });

  it('points every page at a topic that has copy', () => {
    for (const address of pages) {
      const found = topicForPath(address)!;
      expect(CATALOG[found.audience]?.[found.topic]?.title, address).toBeTruthy();
    }
  });
});

describe('help topics', () => {
  it('has copy (title, summary, body) for every topic of every audience', () => {
    for (const audience of HELP_AUDIENCES) {
      for (const topic of HELP_TOPICS[audience]) {
        const entry = CATALOG[audience]?.[topic];
        expect(entry?.title, `${audience}.${topic}.title`).toBeTruthy();
        expect(entry?.summary, `${audience}.${topic}.summary`).toBeTruthy();
        expect(
          Object.keys(entry?.blocks ?? {}).length,
          `${audience}.${topic}.blocks`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('has no copy for a topic that is not listed', () => {
    for (const audience of HELP_AUDIENCES) {
      const listed: readonly string[] = HELP_TOPICS[audience];
      expect(Object.keys(CATALOG[audience] ?? {}).sort(), audience).toEqual([...listed].sort());
    }
  });

  it('covers each recruiter process step of brief §2 with its own guide', () => {
    expect(HELP_TOPICS.recruiter).toEqual(
      expect.arrayContaining([
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
        'principles',
      ]),
    );
  });
});

describe('helpHref and topicForPath', () => {
  it('builds addresses per audience', () => {
    expect(helpHref('recruiter', 'acme', 'matching')).toBe('/a/acme/help/matching');
    expect(helpHref('hiring_manager', 'acme')).toBe('/h/acme/help');
    expect(helpHref('candidate', 'acme', 'privacy')).toBe('/c/acme/help/privacy');
    expect(helpHref('admin', null, 'agencies')).toBe('/admin/help/agencies');
  });

  it('maps pages to topics and ignores unknown addresses', () => {
    expect(topicForPath('/a/acme/analytics')).toEqual({
      audience: 'recruiter',
      topic: 'analytics',
    });
    expect(topicForPath('/a/acme/settings/members')).toEqual({
      audience: 'recruiter',
      topic: 'agency-admin',
    });
    expect(topicForPath('/admin/usage')).toEqual({ audience: 'admin', topic: 'monitoring' });
    expect(topicForPath('/a/acme/help/offer')).toEqual({ audience: 'recruiter', topic: 'offer' });
    expect(topicForPath('/a/acme/help/nonsense')).toBeNull();
    expect(topicForPath('/a/acme/unknown-page')).toBeNull();
    expect(topicForPath('/pricing')).toBeNull();
  });
});
