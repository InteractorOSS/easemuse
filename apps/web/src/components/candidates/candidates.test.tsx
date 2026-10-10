// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { CandidateIntakeForm } from './candidate-intake-form';
import { CandidateProfileEditor } from './candidate-profile-editor';
import { CandidateReview } from './candidate-review';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});
const json = (body: unknown, status = 200) => Response.json(body, { status });
const api = '/api/v1/agencies/a1';

describe('CandidateIntakeForm', () => {
  it('uploads a file with the source and link as multipart, then reports the new candidate', async () => {
    const sent: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      sent.push({ url: String(input), body: init.body });
      return json({ data: { candidateId: 'c1', jobRunId: 'j1' } }, 202);
    });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderApp(<CandidateIntakeForm agencyId="a1" onCreated={onCreated} />);
    await user.selectOptions(screen.getByLabelText('Where did you find them?'), 'referral');
    await user.type(
      screen.getByLabelText('Profile link (optional)'),
      'https://www.linkedin.com/in/alex',
    );
    await user.upload(
      screen.getByLabelText(/Resume or profile/),
      new File(['resume'], 'cv.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add and read' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('c1'));
    const form = sent[0]!.body as FormData;
    expect(sent[0]!.url).toBe(`${api}/candidates/intake`);
    expect(form.get('source')).toBe('referral');
    expect(form.get('profileUrl')).toBe('https://www.linkedin.com/in/alex');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('sends pasted text as JSON, and asks for enough text first', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      bodies.push(JSON.parse(String(init.body)));
      return json({ data: { candidateId: 'c2', jobRunId: 'j2' } }, 202);
    });
    const user = userEvent.setup();
    renderApp(<CandidateIntakeForm agencyId="a1" onCreated={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Paste text' }));
    await user.type(screen.getByLabelText('Profile text'), 'too short');
    await user.click(screen.getByRole('button', { name: 'Add and read' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Paste at least 50 characters.');
    expect(bodies).toHaveLength(0);
    await user.clear(screen.getByLabelText('Profile text'));
    await user.type(screen.getByLabelText('Profile text'), 'x'.repeat(60));
    await user.click(screen.getByRole('button', { name: 'Add and read' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ source: 'linkedin', profileText: 'x'.repeat(60) });
  });

  it('asks for a file when none is chosen, and explains a refused file', async () => {
    vi.stubGlobal('fetch', async () =>
      json({ error: { code: 'unsupported_type', message: 'x' } }, 415),
    );
    const user = userEvent.setup({ applyAccept: false });
    renderApp(<CandidateIntakeForm agencyId="a1" onCreated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add and read' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a file.');
    await user.upload(
      screen.getByLabelText(/Resume or profile/),
      new File(['x'], 'photo.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add and read' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Upload a PDF, DOCX or plain text file.'),
    );
  });
});

const emptyProfile = (): Record<string, unknown> => ({
  fullName: 'Alex Kim',
  email: 'alex@x.com',
  phone: null,
  currentPosition: { title: 'Director', company: 'Northwind' },
  careerHistory: [
    {
      company: 'Northwind',
      title: 'Director',
      start: '2019',
      end: null,
      current: true,
      summary: 'Led payroll',
    },
  ],
  education: [{ school: 'Seoul National University', degree: 'BA Business', year: '2008' }],
  coreSkills: ['payroll'],
  industryExperience: [],
  technicalSkills: ['Workday'],
  leadershipExperience: null,
  teamSize: '12',
  careerProgression: null,
  location: 'Seoul',
  workAuthorization: null,
  compensationExpectation: null,
  majorAchievements: [
    {
      text: 'Cut cost 30%',
      evidence: [{ type: 'quote', source: 'resume', excerpt: 'reduced payroll cost by 30%' }],
    },
  ],
  potentialMotivation: {
    text: 'Wants more scope',
    evidence: [{ type: 'inferred', rationale: 'Long tenure at one level' }],
  },
  potentialConcerns: [],
});
function Harness({
  spy,
  readOnly = false,
}: {
  spy: (c: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(emptyProfile());
  return (
    <CandidateProfileEditor
      content={value}
      readOnly={readOnly}
      onChange={(n) => {
        setValue(n);
        spy(n);
      }}
    />
  );
}

describe('CandidateProfileEditor', () => {
  it('shows every field, with empty ones empty rather than guessed', () => {
    renderApp(<Harness spy={vi.fn()} />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Alex Kim');
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Compensation expectation') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Company of job 1') as HTMLInputElement).value).toBe('Northwind');
  });

  it('labels inference as AI inference and shows the quote behind a stated fact', () => {
    renderApp(<Harness spy={vi.fn()} />);
    expect(screen.getAllByText('AI inference')).toHaveLength(1);
    expect(screen.getByText('Long tenure at one level')).toBeTruthy();
    expect(screen.getByText('reduced payroll cost by 30%')).toBeTruthy();
  });

  it('edits text fields, setting a cleared field back to empty (null)', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    await user.clear(screen.getByLabelText('Email'));
    expect(spy.mock.lastCall![0].email).toBeNull();
    await user.type(screen.getByLabelText('Phone'), '010-1111-2222');
    expect(spy.mock.lastCall![0].phone).toBe('010-1111-2222');
    await user.type(screen.getByLabelText('Current title'), ' II');
    expect((spy.mock.lastCall![0].currentPosition as { title: string }).title).toBe('Director II');
  });

  it('adds and removes jobs', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    expect((spy.mock.lastCall![0].careerHistory as unknown[]).length).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Remove job 2' }));
    expect((spy.mock.lastCall![0].careerHistory as unknown[]).length).toBe(1);
  });

  it('shows, edits, adds and removes education entries', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    expect((screen.getByLabelText('School of entry 1') as HTMLInputElement).value).toBe(
      'Seoul National University',
    );
    await user.clear(screen.getByLabelText('Year of entry 1'));
    expect((spy.mock.lastCall![0].education as { year: string | null }[])[0]!.year).toBeNull();
    await user.type(screen.getByLabelText('Degree of entry 1'), ' (hons)');
    expect((spy.mock.lastCall![0].education as { degree: string }[])[0]!.degree).toBe(
      'BA Business (hons)',
    );
    await user.click(screen.getByRole('button', { name: 'Add education' }));
    expect(spy.mock.lastCall![0].education as unknown[]).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Remove education entry 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove education entry 1' }));
    expect(spy.mock.lastCall![0].education).toEqual([]);
    expect(screen.getByText('No education found in the file.')).toBeTruthy();
  });

  it('edits skills one per line', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    await user.type(screen.getByLabelText('Technical skills'), '{enter}SQL');
    expect(spy.mock.lastCall![0].technicalSkills).toEqual(['Workday', 'SQL']);
  });

  it('marks a concern the recruiter adds as theirs, and is read-only when approved', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    const { unmount } = renderApp(<Harness spy={spy} />);
    await user.click(screen.getByRole('button', { name: 'Add to Potential concerns' }));
    const concerns = spy.mock.lastCall![0].potentialConcerns as {
      evidence: { rationale: string }[];
    }[];
    expect(concerns[0]!.evidence[0]!.rationale).toBe('Added by the recruiter');
    unmount();
    renderApp(<Harness spy={vi.fn()} readOnly />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Add job' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add education' })).toBeNull();
    expect((screen.getByLabelText('School of entry 1') as HTMLInputElement).readOnly).toBe(true);
  });
});

describe('CandidateReview', () => {
  const doc = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    fileId: 'f1',
    filename: 'cv.pdf',
    kind: 'resume',
    extractionStatus: 'ready',
    extractionError: null,
    parsedFromImage: false,
    createdAt: '2026-10-07T00:00:00.000Z',
    ...over,
  });
  const candidate = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    fullName: 'Draft: cv',
    email: null,
    phone: null,
    profileUrl: null,
    source: 'linkedin',
    status: 'draft',
    currentTitle: null,
    location: null,
    skills: [],
    yearsExperience: null,
    doNotContact: false,
    createdAt: '2026-10-07T00:00:00.000Z',
    profileArtifactId: null,
    approvedProfileVersionId: null,
    profileAi: null,
    documents: [doc()],
    ...over,
  });
  const match = (over: Record<string, unknown> = {}) => ({
    candidateId: 'old1',
    fullName: 'Alex Kim',
    email: 'alex@x.com',
    currentTitle: 'Director',
    strength: 'exact',
    reasons: ['email'],
    nameScore: null,
    ...over,
  });
  const serve = (
    c: Record<string, unknown>,
    duplicates: unknown[] = [],
    extra: Record<string, () => Response> = {},
  ) => {
    const stub = stubApi({
      [`GET ${api}/candidates/c1`]: () => json({ data: c }),
      [`GET ${api}/candidates/c1/duplicates`]: () => json({ data: duplicates }),
      [`GET ${api}/artifacts/art1`]: () =>
        json({
          data: {
            id: 'art1',
            kind: 'candidate_profile',
            subject: { type: 'candidate', id: 'c1' },
            approvedVersionId: null,
            versions: [
              {
                id: 'v1',
                version: 1,
                status: 'draft',
                origin: 'ai',
                content: emptyProfile(),
                factCheck: null,
                aiGenerationId: null,
                parentVersionId: null,
                createdAt: '2026-10-07T00:00:00.000Z',
                approvedAt: null,
              },
            ],
          },
        }),
      ...extra,
    });
    vi.stubGlobal('fetch', stub.impl);
    return stub;
  };
  const view = () =>
    renderApp(<CandidateReview agencyId="a1" agencySlug="acme" candidateId="c1" />);

  it('shows the file being read, then no profile controls yet', async () => {
    serve(candidate({ documents: [doc({ extractionStatus: 'pending' })] }));
    view();
    expect(await screen.findByText('Reading the file…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Structure with AI' })).toBeNull();
  });

  it('says why a file could not be read', async () => {
    serve(
      candidate({
        documents: [doc({ extractionStatus: 'failed', extractionError: 'The file is empty.' })],
      }),
    );
    view();
    expect(
      (await screen.findByText(/The file could not be read: The file is empty\./)).textContent,
    ).toContain('Add the candidate again by pasting the text.');
  });

  it('offers to ask AI for the profile when the text is read but no draft exists', async () => {
    const stub = serve(candidate(), [], {
      [`POST ${api}/candidates/c1/structure`]: () => json({ data: { jobRunId: 'j' } }, 202),
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Structure with AI' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(
      (screen.getByRole('button', { name: 'Confirm candidate' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('says why the AI could not write the profile, and stops saying it is still writing', async () => {
    serve(candidate({ profileAi: { status: 'failed', error: 'ai_account_no_credit' } }));
    view();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'AI could not write the profile draft. The AI account has run out of credit; a platform administrator has to add credit.',
    );
    expect(screen.queryByText('AI is writing the profile draft…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Structure with AI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter the profile myself' })).toBeTruthy();
  });

  it('explains an unknown AI failure in general words', async () => {
    serve(candidate({ profileAi: { status: 'failed', error: 'something_new' } }));
    view();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'AI could not write the profile draft. Something went wrong.',
    );
  });

  it('lets the recruiter enter the profile by hand, then shows the profile editor', async () => {
    let started = false;
    const stub = serve(candidate(), [], {
      [`GET ${api}/candidates/c1`]: () =>
        json({ data: candidate(started ? { profileArtifactId: 'art1' } : {}) }),
      [`POST ${api}/candidates/c1/manual-profile`]: () => {
        started = true;
        return json({ data: { artifactId: 'art1', created: true } }, 201);
      },
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Enter the profile myself' }));
    await waitFor(() =>
      expect(
        stub.calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/manual-profile')),
      ).toBe(true),
    );
    expect(await screen.findByText('Blank profile ready. Fill it in, then confirm.')).toBeTruthy();
  });

  it('offers to type the profile when the file could not be read', async () => {
    serve(
      candidate({
        documents: [doc({ extractionStatus: 'failed', extractionError: 'The file is empty.' })],
      }),
    );
    view();
    expect(await screen.findByRole('button', { name: 'Enter the profile myself' })).toBeTruthy();
  });

  it('confirms a candidate with no duplicates once the profile draft is there', async () => {
    const stub = serve(candidate({ profileArtifactId: 'art1' }), [], {
      [`POST ${api}/candidates`]: () =>
        json({ data: { candidateId: 'c1', resolution: 'create', mergedIntoId: null } }, 201),
    });
    const user = userEvent.setup();
    view();
    expect(
      await screen.findByText('No one in your database looks like this candidate.'),
    ).toBeTruthy();
    const reads = () =>
      stub.calls.filter((c) => c.method === 'GET' && c.url.pathname.endsWith('/candidates/c1'))
        .length;
    const before = reads();
    await user.click(await screen.findByRole('button', { name: 'Confirm candidate' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/a/acme/candidates/c1'));
    expect(
      stub.calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/candidates'))!.body,
    ).toEqual({ draftId: 'c1' });
    // The candidate is read again, so the next page does not show the draft's cached name.
    expect(reads()).toBeGreaterThan(before);
  });

  it('needs a decision when there is a possible duplicate, and sends the merge with the chosen candidate', async () => {
    const stub = serve(candidate({ profileArtifactId: 'art1' }), [match()], {
      [`POST ${api}/candidates`]: () =>
        json({ data: { candidateId: 'old1', resolution: 'merge', mergedIntoId: 'old1' } }, 201),
    });
    const user = userEvent.setup();
    view();
    expect(await screen.findByText('Same email')).toBeTruthy();
    const confirm = await screen.findByRole('button', { name: 'Confirm candidate' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Use this candidate: Alex Kim' }));
    await user.click(screen.getByRole('radio', { name: /Merge into Alex Kim/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/a/acme/candidates/old1'));
    expect(
      stub.calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/candidates'))!.body,
    ).toEqual({ draftId: 'c1', resolution: 'merge', targetId: 'old1' });
  });

  it('asks why it is not a duplicate before creating anyway', async () => {
    const stub = serve(
      candidate({ profileArtifactId: 'art1' }),
      [match({ strength: 'possible', reasons: ['name_employer'], nameScore: 0.9 })],
      {
        [`POST ${api}/candidates`]: () =>
          json({ data: { candidateId: 'c1', resolution: 'create', mergedIntoId: null } }, 201),
      },
    );
    const user = userEvent.setup();
    view();
    expect(await screen.findByText('Similar name and the same employer')).toBeTruthy();
    await user.click(
      await screen.findByRole('radio', { name: 'Create as a new candidate anyway' }),
    );
    const confirm = screen.getByRole('button', { name: 'Confirm candidate' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Why is this not a duplicate?'), 'A different person');
    await user.click(confirm);
    await waitFor(() =>
      expect(
        stub.calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/candidates')),
      ).toBe(true),
    );
    expect(
      stub.calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/candidates'))!.body,
    ).toEqual({ draftId: 'c1', resolution: 'create', reason: 'A different person' });
  });

  it('tells the user when the server found a duplicate they did not see', async () => {
    serve(candidate({ profileArtifactId: 'art1' }), [], {
      [`POST ${api}/candidates`]: () =>
        json({ error: { code: 'possible_duplicate', message: 'x' } }, 409),
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Confirm candidate' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This looks like someone already in your database. Choose what to do.',
    );
  });

  it('discards the draft and goes back to the list', async () => {
    serve(candidate({ profileArtifactId: 'art1' }), [], {
      [`POST ${api}/candidates/c1/discard`]: () => new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/a/acme/candidates'));
  });

  it('links to the saved candidate instead of reviewing one that is already active', async () => {
    serve(candidate({ status: 'active', fullName: 'Alex Kim' }));
    view();
    expect((await screen.findByRole('link', { name: 'Alex Kim' })).getAttribute('href')).toBe(
      '/a/acme/candidates/c1',
    );
    void within;
  });
});
