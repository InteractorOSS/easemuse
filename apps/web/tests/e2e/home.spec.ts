// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home page renders and has no axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'EaseMuse' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
