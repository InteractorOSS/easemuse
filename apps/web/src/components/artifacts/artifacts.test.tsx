// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { renderApp, renderWithIntl, stubApi } from '@/test/render';
import { ArtifactEditor } from './artifact-editor';
import { DiffView } from './diff-view';
import { FactCheckPanel } from './fact-check-panel';
import { StreamingDraft } from './streaming-draft';
import type { ArtifactView, ContentEditorProps, VersionView } from './types';
import { useAiRun } from './use-ai-run';
import { VersionStatus } from './version-status';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });

const version = (n: number, over: Partial<VersionView> = {}): VersionView => ({
  id: `v${n}`,
  version: n,
  status: 'draft',
  origin: 'ai',
  content: { title: `Title ${n}` },
  factCheck: null,
  aiGenerationId: null,
  parentVersionId: null,
  createdAt: '2026-10-07T10:00:00.000Z',
  approvedAt: null,
  ...over,
});
const artifactOf = (
  versions: VersionView[],
  kind: ArtifactView['kind'] = 'improved_jd',
): ArtifactView => ({
  id: 'art1',
  kind,
  subject: { type: 'position', id: 'p1' },
  approvedVersionId: null,
  versions,
});
const base = '/api/v1/agencies/ag1/artifacts/art1';

describe('VersionStatus', () => {
  it.each([
    [{ status: 'draft', origin: 'ai' }, 'AI draft'],
    [{ status: 'draft', origin: 'ai_edited' }, 'Edited draft'],
    [{ status: 'draft', origin: 'human' }, 'Your draft'],
    [{ status: 'approved', origin: 'ai' }, 'Approved'],
    [{ status: 'superseded', origin: 'ai' }, 'Replaced'],
    [{ status: 'discarded', origin: 'ai' }, 'Discarded'],
  ] as const)('shows %j as %s', (v, label) => {
    renderWithIntl(<VersionStatus version={v} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('never shows "AI draft" on an approved AI version (the badge leaves with approval)', () => {
    renderWithIntl(<VersionStatus version={{ status: 'approved', origin: 'ai' }} />);
    expect(screen.queryByText('AI draft')).toBeNull();
  });
});

describe('DiffView', () => {
  it('marks added and removed lines with text, not only color', () => {
    renderWithIntl(<DiffView before={'a\nb'} after={'a\nc'} />);
    expect(screen.getByText('Removed:')).toBeTruthy();
    expect(screen.getByText('Added:')).toBeTruthy();
  });
  it('says so when nothing changed', () => {
    renderWithIntl(<DiffView before="a" after="a" />);
    expect(screen.getByText('No changes from the AI original.')).toBeTruthy();
  });
});

describe('FactCheckPanel', () => {
  const factCheck = {
    ranAt: 'now',
    warnings: [{ id: 'w1', claim: 'Led 12 engineers', step: 'verifier' as const }],
  };

  it('lets the recruiter decide, and asks for a reason when confirming', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithIntl(
      <FactCheckPanel factCheck={factCheck} resolutions={{}} onChange={onChange} />,
    );
    await user.click(screen.getByRole('radio', { name: 'The claim is correct: Led 12 engineers' }));
    expect(onChange).toHaveBeenLastCalledWith({ w1: { kind: 'confirmed', reason: undefined } });
    rerender(
      <FactCheckPanel
        factCheck={factCheck}
        resolutions={{ w1: { kind: 'confirmed', reason: '' } }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Why is it correct?'), {
      target: { value: 'Said on the call' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      w1: { kind: 'confirmed', reason: 'Said on the call' },
    });
  });

  it('shows the all-clear when there are no warnings, and locks decisions already stored', () => {
    const { unmount } = renderWithIntl(
      <FactCheckPanel
        factCheck={{ ranAt: 'now', warnings: [] }}
        resolutions={{}}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('The fact check found nothing unsupported.')).toBeTruthy();
    unmount();
    const resolved = {
      ranAt: 'now',
      warnings: [
        {
          ...factCheck.warnings[0]!,
          resolution: { kind: 'edited' as const, resolvedById: 'u', resolvedAt: 'x' },
        },
      ],
    };
    renderWithIntl(
      <FactCheckPanel factCheck={resolved} resolutions={{}} onChange={() => undefined} />,
    );
    expect(
      (
        screen.getByRole('radio', {
          name: 'I edited the text: Led 12 engineers',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.getByRole('group', { name: 'Led 12 engineers' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});

describe('StreamingDraft and useAiRun', () => {
  const sse = (...events: string[]) => new Response(events.join(''), { status: 200 });

  it('streams text into state and reports done', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse(
          'event: delta\ndata: {"text":"{\\"a\\""}\n\n',
          'event: delta\ndata: {"text":":1}"}\n\n',
          'event: done\ndata: {"data":{"versionId":"v9"}}\n\n',
        ),
      ),
    );
    const onDone = vi.fn();
    const { result } = renderHook(() => useAiRun<{ versionId: string }>('/api/run', { onDone }));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toMatchObject({ status: 'done', text: '{"a":1}' });
    expect(onDone).toHaveBeenCalledWith({ versionId: 'v9' });
  });

  it('reports a failure and can retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse('event: error\ndata: {"error":{"code":"ai_refused","message":"No draft"}}\n\n'),
      ),
    );
    const { result } = renderHook(() => useAiRun('/api/run'));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toMatchObject({ status: 'error', error: 'No draft' });
  });

  it('cancels a running request without saving anything', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            ),
          ),
      ),
    );
    const { result } = renderHook(() => useAiRun('/api/run'));
    let running: Promise<void>;
    act(() => {
      running = result.current.start();
    });
    await waitFor(() => expect(result.current.state.status).toBe('running'));
    act(() => result.current.cancel());
    await act(async () => {
      await running;
    });
    expect(result.current.state.status).toBe('cancelled');
  });

  it('renders the states: running with cancel, cancelled, error with retry, nothing when idle or done', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onRetry = vi.fn();
    const { rerender, container } = renderWithIntl(
      <StreamingDraft state={{ status: 'idle', text: '' }} onCancel={onCancel} onRetry={onRetry} />,
    );
    expect(container.textContent).toBe('');
    rerender(
      <StreamingDraft
        state={{ status: 'running', text: '{"par' }}
        onCancel={onCancel}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('AI draft')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Drafting…');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    rerender(
      <StreamingDraft
        state={{ status: 'cancelled', text: '' }}
        onCancel={onCancel}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Cancelled. Nothing was saved.')).toBeTruthy();
    rerender(
      <StreamingDraft
        state={{ status: 'error', text: '', error: 'No draft' }}
        onCancel={onCancel}
        onRetry={onRetry}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('No draft');
  });
});

describe('ArtifactEditor', () => {
  const serve = (artifact: ArtifactView, extra: Record<string, () => Response> = {}) => {
    const api = stubApi({ [`GET ${base}`]: () => json({ data: artifact }), ...extra });
    vi.stubGlobal('fetch', api.impl);
    return api;
  };

  it('shows an unapproved AI version with the AI draft badge, its content and approve / discard', async () => {
    serve(artifactOf([version(1)]));
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    expect(await screen.findByRole('heading', { name: 'Improved job description' })).toBeTruthy();
    expect(screen.getAllByText('AI draft').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toContain(
      '"title": "Title 1"',
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeTruthy();
  });

  it('saves an edit as a new version, and blocks approval until the edit is saved', async () => {
    const api = serve(artifactOf([version(1)]), {
      [`POST ${base}/versions`]: () => json({ data: {} }, 201),
    });
    const user = userEvent.setup();
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    const box = (await screen.findByLabelText('Content')) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '{"title":"Mine"}' } });
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText('Save your edit before approving.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save edit' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
        content: { title: 'Mine' },
      }),
    );
    expect(await screen.findByText('Edit saved as a new version.')).toBeTruthy();
  });

  it('refuses invalid JSON and non-objects, with a message, and cannot save them', async () => {
    serve(artifactOf([version(1)]));
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    const box = await screen.findByLabelText('Content');
    fireEvent.change(box, { target: { value: '{oops' } });
    expect(screen.getByText('This is not valid JSON.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save edit' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(box, { target: { value: '[1,2]' } });
    expect(screen.getByText('The content must be a JSON object.')).toBeTruthy();
  });

  it('approves, sends fact-check decisions, and explains a refusal', async () => {
    const withCheck = version(1, {
      factCheck: {
        ranAt: 'now',
        warnings: [{ id: 'w1', claim: 'Cut cost 40%', step: 'deterministic' }],
      },
    });
    let refuse = true;
    const api = serve(artifactOf([withCheck], 'tailored_resume'), {
      [`POST ${base}/versions/v1/approve`]: () =>
        refuse
          ? json({ error: { code: 'factcheck_unresolved', message: 'x' } }, 409)
          : json({ data: artifactOf([version(1, { status: 'approved' })]) }),
    });
    const user = userEvent.setup();
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Decide on every fact-check warning first.')).toBeTruthy();

    refuse = false;
    await user.click(screen.getByRole('radio', { name: 'I edited the text: Cut cost 40%' }));
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === 'POST').at(-1)?.body).toEqual({
        factCheckResolutions: { w1: { kind: 'edited' } },
      }),
    );
    expect(await screen.findByText('Approved. This version is now the official one.')).toBeTruthy();
  });

  it('refreshes what the screen around the editor shows once a version is approved', async () => {
    let approved = false;
    const api = serve(artifactOf([version(1)]), {
      [`POST ${base}/versions/v1/approve`]: () => {
        approved = true;
        return json({ data: artifactOf([version(1, { status: 'approved' })]) });
      },
      'GET /api/v1/agencies/ag1/things': () => json({ data: { confirmed: approved } }),
    });
    function Around() {
      const q = useQuery({
        queryKey: ['things'],
        queryFn: () => apiFetch<{ confirmed: boolean }>('/api/v1/agencies/ag1/things'),
      });
      return (
        <>
          <p>{q.data?.data.confirmed ? 'Confirmed' : 'Not confirmed'}</p>
          <ArtifactEditor agencyId="ag1" artifactId="art1" />
        </>
      );
    }
    const user = userEvent.setup();
    renderApp(<Around />);
    expect(await screen.findByText('Not confirmed')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Confirmed')).toBeTruthy();
    expect(api.calls.filter((c) => c.url.pathname.endsWith('/things')).length).toBeGreaterThan(1);
  });

  it.each([
    ['missing_recruiter_assessment', 'Write your own assessment before approving.'],
    ['not_draft', 'This version can no longer be changed.'],
    ['something_else', 'Something went wrong. Try again.'],
  ])('maps %s to plain words', async (code, text) => {
    serve(artifactOf([version(1)]), {
      [`POST ${base}/versions/v1/approve`]: () => json({ error: { code, message: 'x' } }, 409),
    });
    const user = userEvent.setup();
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect((await screen.findByRole('alert')).textContent).toBe(text);
  });

  it('discards after confirmation', async () => {
    const api = serve(artifactOf([version(1)]), {
      [`POST ${base}/versions/v1/discard`]: () => json({ data: {} }),
    });
    const user = userEvent.setup();
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    await user.click(await screen.findByRole('button', { name: 'Discard draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard this draft?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard draft' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.pathname.endsWith('/discard'))).toBe(true),
    );
  });

  it('shows version history, switches versions and compares with the AI original', async () => {
    const v1 = version(1, { status: 'superseded', content: { title: 'AI says' } });
    const v2 = version(2, {
      origin: 'ai_edited',
      content: { title: 'I say' },
      parentVersionId: 'v1',
    });
    serve(artifactOf([v2, v1]));
    const user = userEvent.setup();
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    expect(((await screen.findByLabelText('Content')) as HTMLTextAreaElement).value).toContain(
      'I say',
    );
    expect(screen.getAllByText('Edited draft').length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText('Show changes from the AI original'));
    expect(screen.getByText('Removed:')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Show version 1' }));
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toContain('AI says');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull(); // superseded: read only
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it('keeps an approved version official and read-only of approve, but editable into a new draft', async () => {
    serve(artifactOf([version(1, { status: 'approved' })]));
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    await screen.findByLabelText('Content');
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save edit' })).toBeTruthy();
  });

  it('uses a feature-supplied editor when given one', async () => {
    serve(artifactOf([version(1)]));
    const Custom = ({ content, onChange }: ContentEditorProps) => (
      <button type="button" onClick={() => onChange({ ...content, title: 'From form' })}>
        Custom form: {String(content.title)}
      </button>
    );
    const user = userEvent.setup();
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" ContentEditor={Custom} />);
    await user.click(await screen.findByRole('button', { name: 'Custom form: Title 1' }));
    expect(screen.getByText('Save your edit before approving.')).toBeTruthy();
  });

  it('shows an error state when the artifact cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${base}`]: () => json({ error: { code: 'not_found', message: 'x' } }, 404) })
        .impl,
    );
    renderApp(<ArtifactEditor agencyId="ag1" artifactId="art1" />);
    expect((await screen.findByRole('alert')).textContent).toBe('Could not load this. Try again.');
  });
});
