// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { removeTestData, seedUser, signIn, type TestUser } from './support/session';

/**
 * In-app help (goal G#4): each audience can open its help, every page frame links to the topic that
 * fits the page, and the help pages have no axe violations in a real browser (contrast included).
 */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}

test.describe.configure({ mode: 'serial' });

test.describe('help pages', () => {
  const users: TestUser[] = [];
  const slug = `help-${Date.now().toString(36)}`;
  let owner: TestUser;
  let recruiter: TestUser;
  let inviteLink = '';

  test.beforeAll(async () => {
    owner = await seedUser('Olivia Owner', { platformRole: 'owner' });
    recruiter = await seedUser('Riley Recruiter');
    users.push(owner, recruiter);
  });
  test.afterAll(async () => {
    await removeTestData(users);
  });

  test('platform administrators: help link on admin pages, accessible topics', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await signIn(context, owner);
    const page = await context.newPage();

    await page.goto('/admin/agencies');
    await page.getByRole('button', { name: 'Create agency' }).click();
    await page.getByLabel('Agency name').fill('Help Talent');
    await page.getByLabel('URL name').fill(slug);
    await page.getByLabel("First admin's email").fill(recruiter.email);
    await page.getByRole('button', { name: 'Create and invite' }).click();
    // The invitation link is shown once in a dialog; keep it for the recruiter's test.
    inviteLink = await page
      .getByRole('textbox', { name: 'Send this invitation link' })
      .inputValue();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('link', { name: 'Help Talent' }).first()).toBeVisible();

    for (const [path, topic] of [
      ['/admin/agencies', 'agencies'],
      ['/admin/usage', 'monitoring'],
      ['/admin/audit', 'audit-and-deletions'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'Help', exact: true })).toHaveAttribute(
        'href',
        `/admin/help/${topic}`,
      );
    }
    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.goto('/admin/help');
    await expect(
      page.getByRole('heading', { name: /Help for platform administrators/ }),
    ).toBeVisible();
    await expectAccessible(page);
    expect((await page.goto('/admin/help/nonsense'))?.status()).toBe(404);
    await context.close();
  });

  test('recruiters: help on the workbench, the principles and every process step', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await signIn(context, recruiter);
    const page = await context.newPage();
    await page.goto(inviteLink);
    await page.getByRole('button', { name: /accept|join/i }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to Help Talent' })).toBeVisible();

    const A = `/a/${slug}`;
    for (const [path, topic] of [
      ['/tasks', 'getting-started'],
      ['/clients', 'client-intake'],
      ['/positions', 'client-intake'],
      ['/candidates', 'sourcing'],
      ['/analytics', 'analytics'],
      ['/settings/branding', 'agency-admin'],
    ] as const) {
      await page.goto(`${A}${path}`);
      await expect(page.getByRole('link', { name: 'Help', exact: true })).toHaveAttribute(
        'href',
        `${A}/help/${topic}`,
      );
    }

    await page.goto(`${A}/help`);
    await expectAccessible(page);
    await page
      .getByRole('link', { name: /five rules/i })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 2, name: /recruiter decides/i })).toBeVisible();
    await expectAccessible(page);
    for (const topic of ['client-intake', 'matching', 'submission', 'experience']) {
      await page.goto(`${A}/help/${topic}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
    }
    expect((await page.goto(`${A}/help/nonsense`))?.status()).toBe(404);
    await context.close();
  });

  test('hiring managers and candidates can read their help without signing in', async ({
    page,
  }) => {
    for (const prefix of ['h', 'c']) {
      await page.goto(`/${prefix}/${slug}/enter`);
      await expect(page.getByRole('link', { name: 'Help', exact: true })).toHaveAttribute(
        'href',
        `/${prefix}/${slug}/help/getting-started`,
      );
      await page.getByRole('link', { name: 'Help', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
      await page.goto(`/${prefix}/${slug}/help`);
      await expectAccessible(page);
    }
    expect((await page.goto(`/c/${slug}/help/nonsense`))?.status()).toBe(404);
  });
});
