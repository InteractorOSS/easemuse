// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/http/errors';
import { parseIntakeRequest } from './intake-request';

const PROFILE = `Alex Kim\nSenior HR Director at Northwind (2019-present)\nLed a team of 12 across payroll and benefits.\nHR Manager at Contoso (2014-2019)`;
const URL_IN = 'https://www.linkedin.com/in/alex-kim';

const json = (body: unknown) =>
  new Request('http://x.test/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('parseIntakeRequest', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads pasted text and keeps the profile link as text', async () => {
    const { intake, file } = await parseIntakeRequest(
      json({ source: 'referral', profileText: PROFILE, profileUrl: URL_IN }),
    );
    expect(intake).toMatchObject({ source: 'referral', profileUrl: URL_IN });
    expect(file.kind).toBe('profile_text');
    expect(new TextDecoder().decode(file.bytes)).toBe(PROFILE);
  });

  it('forces the source, even when the caller sent another or none', async () => {
    const other = await parseIntakeRequest(
      json({ source: 'referral', profileText: PROFILE }),
      'linkedin',
    );
    expect(other.intake.source).toBe('linkedin');
    const none = await parseIntakeRequest(json({ profileText: PROFILE }), 'linkedin');
    expect(none.intake.source).toBe('linkedin');
  });

  it('reads a LinkedIn PDF export from multipart and forces the source', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array([37, 80, 68, 70])], 'Profile.pdf'));
    form.set('source', 'other');
    form.set('profileUrl', URL_IN);
    const { intake, file } = await parseIntakeRequest(
      new Request('http://x.test/intake', { method: 'POST', body: form }),
      'linkedin',
    );
    expect(intake).toEqual({ source: 'linkedin', profileUrl: URL_IN });
    expect(file).toMatchObject({ filename: 'Profile.pdf', kind: 'resume' });
    expect(file.bytes.length).toBe(4);
  });

  it('never fetches the profile link', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await parseIntakeRequest(json({ profileText: PROFILE, profileUrl: URL_IN }), 'linkedin');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses text that is too short, a bad link and a missing file', async () => {
    await expect(
      parseIntakeRequest(json({ profileText: 'short' }), 'linkedin'),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      parseIntakeRequest(json({ profileText: PROFILE, profileUrl: 'not a url' }), 'linkedin'),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      parseIntakeRequest(
        new Request('http://x.test/intake', { method: 'POST', body: new FormData() }),
        'linkedin',
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
