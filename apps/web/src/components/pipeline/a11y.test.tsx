// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react';
import { afterEach, describe, it, vi } from 'vitest';
import {
  qualificationContentSchema,
  tailoredResumeContentSchema,
  submissionReportContentSchema,
} from '@easemuse/core';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, renderWithIntl, stubApi } from '@/test/render';
import { CallQuestionsEditor } from './call-questions-editor';
import { InterviewPanel } from './interview-panel';
import { OfferPanel } from './offer-panel';
import { OutreachPanel } from './outreach-panel';
import { QualificationEditor } from './qualification-editor';
import { QualificationPanel } from './qualification-panel';
import { ReportEditor } from './report-editor';
import { ResumeEditor } from './resume-editor';
import { ScreeningPanel } from './screening-panel';
import { SubmissionPanel } from './submission-panel';

vi.mock('@/lib/realtime/use-channel', () => ({ useChannel: () => undefined }));
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown) => Response.json({ data: body });
const api = '/api/v1/agencies/a1';
const noop = () => undefined;

/** Accessibility of the screens built for the pipeline stages (T-QA-07): every control has a name, form fields a label, lists a proper structure. */
describe('pipeline panels pass axe', () => {
  it('screening', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/pipeline/e1/screening/prefill`]: () =>
          json({
            versionId: 'v1',
            items: Object.fromEntries(
              [
                'careerConsistency',
                'jobChanges',
                'employmentGaps',
                'scopeOfResponsibility',
                'teamSize',
                'reportingStructure',
                'accomplishments',
                'technicalCompetency',
                'leadershipCompetency',
                'compensationExpectation',
                'location',
                'workAuthorization',
                'relocation',
                'careerMotivation',
              ].map((k) => [
                k,
                k === 'jobChanges'
                  ? { rating: 'concern', note: 'Three roles in two years' }
                  : { rating: null, note: '' },
              ]),
            ),
          }),
        [`GET ${api}/pipeline/e1/screening`]: () =>
          json({
            items: { jobChanges: { rating: 'concern', notes: 'Three in two years' } },
            screeningClass: 'potential',
            updatedAt: null,
          }),
      }).impl,
    );
    const { container } = renderApp(<ScreeningPanel agencyId="a1" entryId="e1" onChanged={noop} />);
    await screen.findByRole('heading', { name: 'Screening' });
    await expectNoA11yViolations(container);
  });

  it('outreach, with a planned and a sent touch', async () => {
    const touch = (n: number, status: string) => ({
      touchNumber: n,
      channel: 'email',
      status,
      dueAt: '2026-10-20T00:00:00Z',
      sentAt: status === 'sent' ? '2026-10-10T00:00:00Z' : null,
      response: null,
      artifactId: null,
      approvedVersionId: null,
    });
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/pipeline/e1/outreach`]: () =>
          json({
            doNotContact: false,
            doNotContactReason: null,
            hasEmail: true,
            names: { firstName: 'Jane', recruiter: 'Sam' },
            recentlyContacted: { at: '2026-10-01T00:00:00Z', byOtherPosition: true },
            touches: [touch(1, 'sent'), touch(2, 'planned'), touch(3, 'planned')],
          }),
      }).impl,
    );
    const { container } = renderApp(<OutreachPanel agencyId="a1" entryId="e1" onChanged={noop} />);
    await screen.findByRole('heading', { name: 'Outreach' });
    await expectNoA11yViolations(container);
  });

  it('qualification', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/pipeline/e1/qualification`]: () =>
          json({ callQuestions: null, qualification: null }),
      }).impl,
    );
    const { container } = renderApp(
      <QualificationPanel agencyId="a1" entryId="e1" onChanged={noop} />,
    );
    await screen.findByRole('heading', { name: 'Qualification call' });
    await expectNoA11yViolations(container);
  });

  it('the editors for questions, qualification, resume and report', async () => {
    const q = renderApp(
      <CallQuestionsEditor
        content={{
          questions: [{ id: 'q1', topic: 'interest', question: 'What caught your eye?' }],
        }}
        onChange={noop}
        readOnly={false}
      />,
    );
    await expectNoA11yViolations(q.container);
    q.unmount();
    const qual = renderWithIntl(
      <QualificationEditor
        content={qualificationContentSchema.parse({
          fields: { interest: { value: 'keen', level: 'high', inferred: true } },
        })}
        onChange={noop}
        readOnly={false}
      />,
    );
    await expectNoA11yViolations(qual.container);
    qual.unmount();
    const resume = renderWithIntl(
      <ResumeEditor
        content={tailoredResumeContentSchema.parse({
          header: { name: 'Alex' },
          headline: 'HR Director',
          summary: 'Leader',
          roles: [
            {
              company: 'Northwind',
              title: 'HR Director',
              start: '2019',
              current: true,
              original: 'Managed 20',
              bullets: ['Led 20'],
            },
          ],
          education: [{ school: 'SNU', degree: 'BA' }],
          skills: ['Payroll'],
        })}
        onChange={noop}
        readOnly={false}
      />,
    );
    await expectNoA11yViolations(resume.container);
    resume.unmount();
    const report = renderWithIntl(
      <ReportEditor
        content={submissionReportContentSchema.parse({
          overview: 'Fine',
          missingInputs: ['qualification'],
        })}
        onChange={noop}
        readOnly={false}
      />,
    );
    await expectNoA11yViolations(report.container);
  });

  it('submission', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/pipeline/e1/submissions`]: () =>
          json({
            state: 'candidate_approved',
            clientName: 'Acme',
            contacts: [{ id: 'c1', name: 'Ms. Park', title: 'VP' }],
            report: { versionId: 'r', pdfFileId: 'f1' },
            resume: { tailoredResumeId: 't', versionId: 'v', pdfFileId: 'f2' },
            earlierToClient: [{ positionTitle: 'Old role', submittedAt: '2026-09-01T00:00:00Z' }],
            submissions: [],
          }),
      }).impl,
    );
    const { container } = renderApp(
      <SubmissionPanel agencyId="a1" entryId="e1" onChanged={noop} />,
    );
    await screen.findByRole('heading', { name: 'Submit to the client' });
    await expectNoA11yViolations(container);
  });

  it('interviews', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/pipeline/e1/interviews`]: () =>
          json([
            {
              id: 'i1',
              roundName: 'HM interview',
              scheduledAt: '2026-10-20T14:00:00Z',
              format: 'video',
              interviewers: ['Ms. Park'],
              status: 'scheduled',
              feedback: [
                {
                  id: 'f1',
                  fromRole: 'hm',
                  source: 'recorded_by_recruiter',
                  ratings: { technicalFit: 'strong' },
                  comments: 'Sharp',
                  createdAt: '2026-10-21T00:00:00Z',
                },
              ],
            },
          ]),
      }).impl,
    );
    const { container } = renderApp(<InterviewPanel agencyId="a1" entryId="e1" onChanged={noop} />);
    await screen.findByRole('heading', { name: 'Interviews' });
    await expectNoA11yViolations(container);
  });

  it('offer', async () => {
    const milestone = { status: 'not_started', date: null, notes: '' };
    const milestones = Object.fromEntries(
      [
        'offerPreparation',
        'compensationDiscussion',
        'candidateExpectation',
        'counterofferRisk',
        'resignationTiming',
        'startDate',
        'offerAcceptance',
        'preEmploymentProcess',
        'onboarding',
      ].map((k) => [k, milestone]),
    );
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/pipeline/e1/offer`]: () =>
          json({
            exists: true,
            state: 'offer',
            milestones,
            counterofferRisk: 'low',
            resignationDate: null,
            startDate: '2026-12-01',
            outcome: null,
            outcomeReason: null,
          }),
      }).impl,
    );
    const { container } = renderApp(<OfferPanel agencyId="a1" entryId="e1" onChanged={noop} />);
    await screen.findByRole('heading', { name: 'Offer and closing' });
    await expectNoA11yViolations(container);
  });
});
