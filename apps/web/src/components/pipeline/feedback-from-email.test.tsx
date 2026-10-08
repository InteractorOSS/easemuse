// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interviewFeedbackContentSchema } from '@easemuse/core';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, renderWithIntl, stubApi } from '@/test/render';
import { FeedbackDraftEditor, FeedbackFromEmail } from './feedback-from-email';

afterEach(() => vi.unstubAllGlobals());

const content = interviewFeedbackContentSchema.parse({
  fromRole: 'hm',
  ratings: {
    leadershipFit: { rating: 'strong', evidence: 'Great leader', confirmed: false },
    industryExperience: { rating: 'gap', evidence: 'Thin on retail', confirmed: true },
  },
  comments: 'Keen.',
  source: 'Great leader, thin on retail. Keen.',
});

describe('feedback draft editor (A17, FR-IVW-04)', () => {
  it('shows each rating with the words it rests on, and asks for confirmation of the unconfirmed ones', async () => {
    const { container } = renderWithIntl(
      <FeedbackDraftEditor content={content} onChange={() => undefined} readOnly={false} />,
    );
    expect(screen.getByText('From the text: Great leader')).toBeTruthy();
    expect(screen.getByText(/Check each rating against the email/)).toBeTruthy();
    const leadership = screen.getByRole('checkbox', { name: 'Confirm Leadership fit' });
    expect((leadership as HTMLInputElement).checked).toBe(false);
    expect(
      (screen.getByRole('checkbox', { name: 'Confirm Industry experience' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    // A criterion the email did not rate has nothing to confirm.
    expect(screen.queryByRole('checkbox', { name: 'Confirm Communication' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('confirming sets only that rating; changing a rating makes it need checking again', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<FeedbackDraftEditor content={content} onChange={onChange} readOnly={false} />);
    await user.click(screen.getByRole('checkbox', { name: 'Confirm Leadership fit' }));
    expect(onChange.mock.lastCall![0].ratings.leadershipFit.confirmed).toBe(true);
    await user.selectOptions(screen.getByLabelText('Industry experience'), 'moderate');
    expect(onChange.mock.lastCall![0].ratings.industryExperience).toMatchObject({
      rating: 'moderate',
      confirmed: false,
    });
  });
});

describe('FeedbackFromEmail', () => {
  it('sends the pasted text for structuring and shows no editor before there is a draft', async () => {
    const base = '/api/v1/agencies/a1/pipeline/e1/interviews/r1/feedback';
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${base}/draft`]: () => Response.json({ data: null }) }).impl,
    );
    const user = userEvent.setup();
    renderApp(
      <FeedbackFromEmail
        agencyId="a1"
        url="/api/v1/agencies/a1/pipeline/e1/interviews"
        roundId="r1"
        onRecorded={() => undefined}
      />,
    );
    const button = await screen.findByRole('button', { name: 'Make a draft' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Feedback text'), 'Strong on leadership.');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Interview feedback')).toBeNull();
  });
});
