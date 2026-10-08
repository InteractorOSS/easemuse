// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { IDS, SEED } from './support/env';
import { signInAsRecruiter } from './support/session';

/**
 * The release 1 loop, by a recruiter in a real browser (T-QA-06, Release 1 exit criterion): create a
 * position, structure and approve the JD, record the hiring manager's decision, write the success
 * profile, add a candidate, analyze, screen, reach out, qualify, tailor the resume, write the report
 * and record the submission. The AI is the canned model (E2E_MODE=1); mail stays in the outbox;
 * everything else is the real application, database, queue and worker.
 */
const base = `/a/${SEED.agencySlug}`;
const JD_TEXT =
  'Head of HR, Northwind Corp, Seoul (hybrid). Lead the HR function for a mid-size manufacturer: payroll, labour relations and people analytics. Required: 8+ years in HR, 3+ years leading a team. Offers a competitive package.';

const RESUME_TEXT =
  'Alex Kim, HR Director at Northwind (2019 to now). Managed a team of 20 and ran payroll for 1,200 staff. Earlier HR Manager at Contoso (2014 to 2019). BA Business, Seoul National University. Skills: payroll, labour relations, people analytics. Based in Seoul.';

/** Approves the draft on screen and waits for the confirmation (approval is always the recruiter's click). */
async function approveDraft(page: Page, which: 'only' | 'first' = 'only') {
  const button = page.getByRole('button', { name: 'Approve', exact: true });
  await (which === 'first' ? button.first() : button).click();
  await expect(page.getByText(/This version is now the official one/).first()).toBeVisible();
}

/** Axe on the current screen: no violations that a screen reader or keyboard user would hit. */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
}

test('a recruiter takes a candidate from a new position to a recorded submission', async ({
  page,
  context,
}) => {
  await signInAsRecruiter(context, IDS.user);
  let positionUrl = '';
  let candidateUrl = '';
  let entryUrl = '';

  await test.step('create the position', async () => {
    await page.goto(`${base}/positions/new`);
    await page.getByLabel('Client', { exact: true }).selectOption({ label: SEED.clientName });
    await page.getByLabel('Job title').fill('Head of HR');
    await page.getByLabel('Location').fill('Seoul');
    await page.getByRole('button', { name: 'Create position' }).click();
    await page.waitForURL(/\/positions\/[0-9a-f-]{36}$/);
    positionUrl = new URL(page.url()).pathname;
    await expect(page.getByRole('heading', { name: 'Head of HR' })).toBeVisible();
    await expectAccessible(page);
  });

  await test.step('add the JD text and structure it', async () => {
    await page.getByLabel('Job description text').fill(JD_TEXT);
    await page.getByRole('button', { name: 'Save pasted text' }).click();
    await page.getByRole('link', { name: 'Structure the JD' }).click();
    await page.getByRole('button', { name: 'Structure JD' }).click();
    // The canned model's answer streams in and becomes an editable draft.
    await expect(page.getByText('Missing from the JD: ask the hiring manager')).toBeVisible();
    await expect(page.getByLabel('Requirement 1', { exact: true })).toHaveValue(
      '8 or more years in HR',
    );
    await approveDraft(page);
    // Approving makes the requirements official; they are listed under "Approved requirements".
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Approved requirements' })).toBeVisible();
    await expect(page.getByText(/8 or more years in HR/).first()).toBeVisible();
  });

  await test.step('record the hiring manager decision and open sourcing', async () => {
    await page.goto(positionUrl);
    await page.getByLabel('Hiring manager name').fill(SEED.contactName);
    await page.getByLabel('How they told you').selectOption('email');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await expect(page.getByText(/Approved by Hana Park/)).toBeVisible();
    for (const status of ['intake', 'sourcing']) {
      await page.getByLabel('Move to').selectOption(status);
      await page.getByRole('button', { name: 'Change status' }).click();
      await expect(page.getByLabel('Move to')).not.toHaveValue(status);
    }
    await page.goto(`${base}/positions`);
    await expect(
      page.getByRole('row', { name: /Head of HR/ }).getByText('Sourcing', { exact: true }),
    ).toBeVisible();
  });

  await test.step('record what the hiring manager said at intake', async () => {
    await page.goto(positionUrl);
    await page
      .getByLabel(/business reason/)
      .fill('The previous head left; payroll needs an owner.');
    await page.getByLabel(/Key challenges to solve/).fill('Harmonise two payroll systems.');
    await page.getByRole('button', { name: 'Save intake' }).click();
    await expect(page.getByText('Intake saved.').first()).toBeVisible();
  });

  await test.step('write and confirm the success profile', async () => {
    await page.goto(`${positionUrl}/profile`);
    await page.getByRole('button', { name: 'Write success profile' }).click();
    await expect(page.getByLabel('Criterion 1', { exact: true })).toHaveValue(
      '8 or more years in HR',
    );
    await approveDraft(page);
    await expect(page.getByText(/Confirmed version/)).toBeVisible();
  });

  await test.step('add a candidate from pasted resume text and confirm the profile', async () => {
    await page.goto(`${base}/candidates/new`);
    await page.getByLabel('Where did you find them?').selectOption('linkedin');
    await page.getByLabel('Paste text').check();
    await page.getByLabel('Profile text').fill(RESUME_TEXT);
    await page.getByRole('button', { name: 'Add and read' }).click();
    await page.waitForURL(/\/candidates\/[0-9a-f-]{36}\/review$/);
    // The worker reads the text, the canned model writes the profile draft, the recruiter reviews it.
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Alex Kim', {
      timeout: 60_000,
    });
    await approveDraft(page);
    await page.getByRole('button', { name: 'Confirm candidate' }).click();
    await page.waitForURL(/\/candidates\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Alex Kim' })).toBeVisible();
    candidateUrl = new URL(page.url()).pathname;
  });

  await test.step('add the candidate to the position', async () => {
    await page.goto(`${positionUrl}/candidates`);
    await page.getByLabel('Search your candidates').fill('Alex');
    await page.getByRole('button', { name: 'Add Alex Kim' }).click();
    await expect(page.getByRole('link', { name: 'Alex Kim' })).toBeVisible();
    await page.getByRole('link', { name: 'Alex Kim' }).click();
    await page.waitForURL(/\/candidates\/[0-9a-f-]{36}$/);
    entryUrl = new URL(page.url()).pathname;
  });

  /** Moves the candidate with the stage control; the select is named "Move <name>". */
  const moveTo = async (stage: string) => {
    await page.getByLabel('Move Alex Kim').selectOption({ label: stage });
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.getByText(`Stage: ${stage}`, { exact: false }).first()).toBeVisible();
  };

  await test.step('analyze the match and mark it reviewed', async () => {
    await page.goto(entryUrl);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.getByText('Not reviewed yet')).toBeVisible();
    await expect(page.getByText(/^Overall/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(page.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);
  });

  await test.step('screen the candidate and classify them Priority', async () => {
    await moveTo('Screened');
    await page.getByLabel('Rating for Job changes').selectOption('strong');
    await page.getByRole('button', { name: 'Save screening' }).click();
    await expect(page.getByText('Screening saved').first()).toBeVisible();
    await page.getByLabel('Classification', { exact: true }).selectOption('priority');
    await page.getByRole('button', { name: 'Set classification' }).click();
    await expect(page.getByText('Classification saved').first()).toBeVisible();
    await moveTo('Contacting');
  });

  await test.step('reach out by email (kept in the outbox) and record that the candidate is interested', async () => {
    await page.getByRole('button', { name: 'Plan touches' }).click();
    const first = page.getByRole('article', { name: /Touch 1/ });
    await first.getByRole('button', { name: 'Write a draft' }).click();
    await expect(first.getByLabel('Subject')).toHaveValue('A role we think fits you');
    await approveDraft(page);
    await first.getByRole('button', { name: 'Send email' }).click();
    await expect(first.getByText(/Sent /).first()).toBeVisible();
    // Test mode: the message is captured in the outbox, nothing leaves the system.
    await page.goto(`${base}/settings/outbox`);
    await expect(page.getByText('A role we think fits you').first()).toBeVisible();
    await page.goto(entryUrl);
    await page.getByLabel('Answer', { exact: true }).selectOption('interested');
    await page.getByRole('button', { name: 'Record answer' }).click();
    await expect(page.getByText('Stage: Interested')).toBeVisible();
  });

  await test.step('prepare the call and record it: every filled field is confirmed by the recruiter', async () => {
    await page.getByRole('button', { name: 'Write call questions' }).click();
    await expect(page.getByLabel('Question 1', { exact: true })).toHaveValue(
      'What would make a move attractive to you?',
    );
    await approveDraft(page, 'first');
    await page
      .getByLabel('Call notes')
      .fill('Keen on the scope of the role. Needs 30 days notice.');
    await page.getByRole('button', { name: 'Structure notes' }).click();
    await expect(page.getByLabel('What the candidate said').first()).not.toHaveValue('');
    // Approving is refused until each filled field has been checked against the call.
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await page.getByLabel('Confirm Interest level').check();
    await page.getByLabel('Confirm Availability and notice').check();
    await page.getByRole('button', { name: 'Save edit' }).last().click();
    await expect(page.getByText('Edit saved as a new version.').first()).toBeVisible();
    await approveDraft(page);
    await moveTo('Qualified');
  });

  await test.step('tailor the resume (facts locked), approve it and record the candidate decision and consent', async () => {
    await page.getByRole('button', { name: 'Prepare resume' }).click();
    await expect(page.getByLabel('Summary', { exact: true })).toHaveValue(/team of 20/);
    await approveDraft(page);
    await page.getByLabel('Name of the person who answered').fill('Alex Kim');
    // The decision form comes first, then the consent form; both ask how the candidate answered.
    await page.getByLabel('How they answered').first().selectOption('email');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await expect(page.getByText('Decision recorded').first()).toBeVisible();
    await page.getByLabel('How they answered').nth(1).selectOption('email');
    await page.getByLabel('Consent', { exact: true }).selectOption('given');
    await page.getByRole('button', { name: 'Record consent' }).click();
    await expect(page.getByText('Consent recorded').first()).toBeVisible();
    await moveTo('Resume ready');
    await moveTo('Candidate approved');
  });

  await test.step('write the submission report: section 14 is the recruiter’s own', async () => {
    await page.getByRole('button', { name: 'Draft report' }).click();
    await expect(page.getByLabel('1. Candidate overview')).toHaveValue(
      /strong, experienced HR director/,
    );
    // The AI leaves section 14 empty; the report cannot be approved until the recruiter writes it.
    await expect(page.getByLabel("14. Recruiter's assessment")).toHaveValue('');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText(/Write your own assessment before approving/)).toBeVisible();
    await page
      .getByLabel("14. Recruiter's assessment")
      .fill('I have spoken with Alex twice; the notice period is the only open point.');
    await page.getByRole('button', { name: 'Save edit' }).last().click();
    await expect(page.getByText('Edit saved as a new version.').first()).toBeVisible();
    await approveDraft(page);
    // Approved for real: no draft is left waiting for approval anywhere on the page.
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  });

  await test.step('create the PDFs of the resume and the report (the worker prints them in Chromium)', async () => {
    const downloads = page.getByRole('link', { name: 'Download PDF' });
    await page.getByRole('button', { name: 'Create PDF', exact: true }).first().click();
    await expect(downloads).toHaveCount(1, { timeout: 60_000 });
    await page.getByRole('button', { name: 'Create PDF', exact: true }).first().click();
    await expect(downloads).toHaveCount(2, { timeout: 60_000 });
    const response = await page.request.get((await downloads.first().getAttribute('href'))!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  await test.step('record the submission to the client contact', async () => {
    await page.reload();
    await expect(page.getByText('Report PDF created')).toBeVisible();
    const contact = page.getByLabel('Submitted to');
    const option = contact.locator('option', { hasText: SEED.contactName });
    await contact.selectOption((await option.getAttribute('value'))!);
    await page.getByLabel('How', { exact: true }).selectOption('email');
    await page.getByLabel('Date', { exact: true }).fill(new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Record submission' }).click();
    await expect(page.getByText('Submission recorded').first()).toBeVisible();
    await expect(page.getByText('Stage: Submitted')).toBeVisible();
    await expect(page.getByText(new RegExp(`To ${SEED.contactName}`))).toBeVisible();
  });

  await test.step('the screens of the loop have no accessibility violations', async () => {
    for (const path of [
      entryUrl,
      `${positionUrl}/candidates`,
      `${base}/positions`,
      `${base}/candidates`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expectAccessible(page);
    }
  });
});
