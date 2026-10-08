// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { removeTestData, seedUser, signIn, withAdmin, type TestUser } from './support/session';

/**
 * The release 1 loop in a real browser (T-QA-06): a platform administrator opens an agency, its
 * first recruiter joins through the invitation, and takes one candidate from intake to submission.
 * AI drafts come from the fake model (AI_FAKE), so this runs without a provider or credit; every
 * other part is the real application.
 */
const EVAL = path.resolve(__dirname, '../../../../eval-data');
const resumeText = () =>
  readFileSync(path.join(EVAL, 'resumes-synthetic/resumes/rs-004.md'), 'utf8');
const JD_TEXT = `HR Business Partner, remote in the United States.

You will partner with people leaders on performance, employee relations and organisation design.

Requirements:
- 7+ years of HR business partner experience in a fast-growing company
- Strong employee relations and performance management skills
- Experience with an HRIS such as Workday
- Authorised to work in the United States

Pay range: $130,000 to $165,000.`;

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}

test.describe.configure({ mode: 'serial' });

test.describe('release 1 happy path (T-QA-06)', () => {
  const users: TestUser[] = [];
  const slug = `e2e-${Date.now().toString(36)}`;
  let owner: TestUser;
  let recruiter: TestUser;

  test.beforeAll(async () => {
    owner = await seedUser('Olivia Owner', { platformRole: 'owner' });
    recruiter = await seedUser('Riley Recruiter');
    users.push(owner, recruiter);
  });
  test.afterAll(async () => {
    await removeTestData(users);
  });

  test('a platform administrator opens an agency and its first recruiter joins', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    await signIn(ownerContext, owner);
    const admin = await ownerContext.newPage();
    await admin.goto('/admin/agencies');
    await admin.getByRole('button', { name: 'Create agency' }).click();
    await admin.getByLabel('Agency name').fill('E2E Talent');
    await admin.getByLabel('URL name').fill(slug);
    await admin.getByLabel("First admin's email").fill(recruiter.email);
    await admin.getByRole('button', { name: 'Create and invite' }).click();
    await expect(admin.getByRole('link', { name: 'E2E Talent' }).first()).toBeVisible();
    await ownerContext.close();

    // The invitation goes through the outbox; outside production it is captured, not sent.
    const link = await withAdmin(async (c) => {
      const { rows } = await c.query<{ bodyText: string }>(
        `SELECT "bodyText" FROM "OutboxMessage" WHERE "toAddress" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
        [recruiter.email],
      );
      return rows[0]?.bodyText.match(/\/invite\/\S+/)?.[0];
    });
    expect(link).toBeTruthy();

    const context = await browser.newContext();
    await signIn(context, recruiter);
    const page = await context.newPage();
    await page.goto(link!);
    await page.getByRole('button', { name: /accept|join/i }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to E2E Talent' })).toBeVisible();
    await context.close();
  });

  test('the recruiter takes a candidate from intake to submission', async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(context, recruiter);
    const page = await context.newPage();
    const A = `/a/${slug}`;

    // Brief §3: a client, a position and its job description.
    await page.goto(`${A}/clients`);
    await page.getByRole('button', { name: 'New client' }).click();
    await page.getByLabel('Company name').fill('Northwind Health');
    await page.getByRole('button', { name: 'Create client' }).click();
    await expect(page.getByText('Northwind Health', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Add contact' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Dana Park');
    await page.getByLabel('Email', { exact: true }).fill('dana.park@example.com');
    await page.getByRole('button', { name: 'Add contact' }).last().click();
    await expect(page.getByText('Contact added.', { exact: true }).first()).toBeVisible();

    await page.goto(`${A}/positions/new`);
    await expectAccessible(page);
    await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Northwind Health' });
    await page.getByLabel('Job title', { exact: true }).fill('HR Business Partner');
    await page.getByLabel('Location', { exact: true }).fill('Remote, United States');
    await page.getByLabel('Pay minimum', { exact: true }).fill('130000');
    await page.getByLabel('Pay maximum', { exact: true }).fill('165000');
    await page.getByRole('button', { name: 'Create position' }).click();
    await expect(page.getByRole('heading', { name: 'HR Business Partner' })).toBeVisible();
    const positionUrl = page.url();

    await page.getByLabel('Job description text', { exact: true }).fill(JD_TEXT);
    await page.getByRole('button', { name: 'Save pasted text' }).click();
    await expect(page.getByLabel('Job description text', { exact: true })).toHaveValue('');

    // Brief §4: AI structures the JD; the recruiter approves it, and records the HM's approval.
    await page.goto(`${positionUrl}/structure`);
    await page.getByRole('button', { name: 'Structure JD' }).click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    await page.goto(positionUrl);
    await page.getByLabel('Move to', { exact: true }).selectOption('intake');
    await page.getByRole('button', { name: 'Change status' }).click();
    await expect(page.getByText('Northwind Health · Intake')).toBeVisible();
    await page.getByLabel('Decision', { exact: true }).selectOption('approved');
    await page.getByLabel('Hiring manager name', { exact: true }).fill('Dana Park');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await expect(page.getByText('Decision recorded.', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Why this person is needed (business reason)').fill('Two new offices.');
    await page
      .getByLabel('Experience that is a must')
      .fill('Seven years as an HR business partner.');
    await page.getByRole('button', { name: 'Save intake' }).click();
    await expect(page.getByText('Intake saved.', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Move to', { exact: true }).selectOption('sourcing');
    await page.getByRole('button', { name: 'Change status' }).click();
    await expect(page.getByText('Northwind Health · Sourcing')).toBeVisible();

    // Brief §5: the success profile, from the approved JD and the intake.
    await page.goto(`${positionUrl}/profile`);
    await page.getByRole('button', { name: 'Write success profile' }).click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    // Brief §6: a resume in; AI reads it; the recruiter adds the name and email the model never sees.
    await page.goto(`${A}/candidates/new`);
    await page.getByLabel('Where did you find them?').selectOption('linkedin');
    await page.getByLabel('Paste text').check();
    await page.getByLabel('Profile text').fill(resumeText());
    await page.getByRole('button', { name: 'Add and read' }).click();
    await expect(page.getByRole('heading', { name: 'Review new candidate' })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Luis Ortega');
    await page.getByLabel('Email', { exact: true }).fill('luis.ortega@example.com');
    await page.getByRole('button', { name: 'Save edit' }).click();
    await expect(page.getByRole('button', { name: 'Save edit' })).toBeDisabled();
    await page.getByRole('button', { name: 'Confirm candidate' }).click();
    await expect(page.getByRole('heading', { name: 'Luis Ortega' })).toBeVisible();

    // Brief §7: found in the pool, added to the position, analysed and reviewed.
    await page.goto(`${positionUrl}/pool`);
    await page.getByRole('button', { name: 'Find in my pool' }).click();
    await page.getByRole('button', { name: 'Add Luis Ortega to this position' }).click();
    await expect(page.getByText('Added to the position', { exact: true }).first()).toBeVisible();
    await page.goto(`${positionUrl}/candidates`);
    await page.getByRole('checkbox', { name: 'Select Luis Ortega' }).check();
    await page.getByRole('button', { name: /Analyze selected/ }).click();
    await page.getByRole('link', { name: 'Luis Ortega' }).click();
    const stage = (name: string) => expect(page.getByText(`Stage: ${name}`)).toBeVisible();
    const section = (name: string) =>
      page.locator('section', { has: page.getByRole('heading', { name, exact: true }) }).first();
    await page.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(page.getByText('Marked as reviewed.', { exact: true }).first()).toBeVisible();

    // Brief §8: screening, from the profile's suggestions, and a classification.
    await page.getByRole('button', { name: 'Suggest from the profile' }).click();
    await page.getByRole('button', { name: 'Use all suggestions' }).click();
    await page.getByRole('button', { name: 'Save screening' }).click();
    await page.getByLabel('Classification', { exact: true }).selectOption('priority');
    await page.getByRole('button', { name: 'Set classification' }).click();
    await stage('Screened');
    await expectAccessible(page);

    // Brief §9: an approved outreach email goes through the outbox; the candidate answers.
    const outreach = section('Outreach');
    await outreach.getByLabel('Channel', { exact: true }).selectOption('email');
    await outreach.getByRole('button', { name: 'Plan touches' }).click();
    await outreach.getByRole('button', { name: 'Write a draft' }).first().click();
    await outreach.getByRole('button', { name: 'Approve' }).click();
    await outreach.getByRole('button', { name: 'Send email' }).click();
    await stage('Contacting');
    await outreach.getByLabel('Answer', { exact: true }).selectOption('interested');
    await outreach.getByRole('button', { name: 'Record answer' }).click();
    await stage('Interested');
    const sent = await withAdmin(async (c) => {
      const { rows } = await c.query<{ subject: string }>(
        `SELECT o.subject FROM "OutboxMessage" o JOIN "Agency" a ON a.id = o."agencyId"
         WHERE a.slug = $1 AND o."toAddress" = 'luis.ortega@example.com'`,
        [slug],
      );
      return rows.length;
    });
    expect(sent).toBe(1);

    // Brief §10: call questions, then the call notes structured and every field confirmed.
    const call = section('Qualification call');
    await call.getByRole('button', { name: 'Write call questions' }).click();
    await call.getByRole('button', { name: 'Approve' }).click();
    await expect(call.getByRole('button', { name: 'Copy list' })).toBeVisible();
    await call
      .getByLabel('Call notes')
      .fill('Interested. Wants 150k base. Remote from Denver. Can start in four weeks.');
    await call.getByRole('button', { name: 'Structure notes' }).click();
    const confirmations = call.getByRole('checkbox', { name: /^Confirm / });
    await expect(confirmations.first()).toBeVisible();
    for (const box of await confirmations.all()) await box.check();
    await call.getByRole('button', { name: 'Save edit' }).last().click();
    await expect(call.getByRole('button', { name: 'Save edit' }).last()).toBeDisabled();
    await call.getByRole('button', { name: 'Approve' }).last().click();
    await page.getByLabel('Move Luis Ortega', { exact: true }).selectOption('qualified');
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await stage('Qualified');

    // Brief §11: the tailored resume, the candidate's approval and consent for this client.
    const resume = section('Tailored resume');
    await resume.getByRole('button', { name: 'Prepare resume' }).click();
    await resume.getByRole('button', { name: 'Approve' }).click();
    await expect(resume.getByRole('button', { name: 'Create PDF' })).toBeVisible();
    await resume.getByRole('button', { name: 'Create PDF' }).click();
    await expect(resume.getByRole('link', { name: /Download PDF/ })).toBeVisible();
    await page.getByLabel('Name of the person who answered').fill('Luis Ortega');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await expect(page.getByText('Decision recorded', { exact: true }).first()).toBeVisible();
    await resume.getByRole('button', { name: 'Record consent' }).click();
    await expect(resume.getByText(/^Given on /)).toBeVisible();

    // Brief §12: the report; section 14 is the recruiter's; every fact-check warning decided.
    const report = section('Submission report');
    await report.getByRole('button', { name: 'Draft report' }).click();
    await report
      .getByLabel("14. Recruiter's assessment")
      .fill('A strong HR business partner from SaaS; I recommend an interview.');
    await report.getByRole('button', { name: 'Save edit' }).click();
    await expect(report.getByRole('button', { name: 'Save edit' })).toBeDisabled();
    for (const choice of await report.getByLabel(/^I edited the text/).all()) await choice.check();
    await report.getByRole('button', { name: 'Approve' }).click();
    await report.getByRole('button', { name: 'Create PDF' }).click();
    await expect(report.getByRole('link', { name: /Download PDF/ })).toBeVisible();
    for (const next of ['resume_ready', 'candidate_approved']) {
      await page.getByLabel('Move Luis Ortega', { exact: true }).selectOption(next);
      await page.getByRole('button', { name: 'Move', exact: true }).click();
    }
    await stage('Candidate approved');

    // Brief §13: the submission is recorded with the exact versions and PDFs.
    const submit = section('Submit to the client');
    await expect(submit.getByText('Not yet')).toHaveCount(0);
    await submit.getByLabel('Submitted to').selectOption({ label: 'Dana Park' });
    await submit.getByLabel('How', { exact: true }).selectOption('email');
    await submit.getByRole('button', { name: 'Record submission' }).click();
    await stage('Submitted');
    await expect(submit.getByText('To Dana Park by Email')).toBeVisible();
    await expectAccessible(page);
    await context.close();
  });
});
