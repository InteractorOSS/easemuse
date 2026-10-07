// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe on rendered markup and fails with the rule and the elements (NFR-U01, T-QA-07). jsdom has
 * no layout or painting, so colour contrast is left to the browser run; the labelling, roles,
 * names and structure rules are checked.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}
