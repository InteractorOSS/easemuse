// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Session } from 'next-auth';
import { describe, expect, it, vi } from 'vitest';
import { createAuthCallbacks, type UserStore } from './callbacks';

const localUser = { id: 'u-1', email: 'a@b.test', name: 'Ann', platformRole: null };

function setup() {
  const store: UserStore = { upsertUserBySubject: vi.fn().mockResolvedValue(localUser) };
  return { store, callbacks: createAuthCallbacks(store) };
}

describe('auth callbacks', () => {
  it('refuses a sign-in without a subject or email', async () => {
    const { callbacks } = setup();
    expect(await callbacks.signIn({ user: { email: 'a@b.test' } })).toBe(false);
    expect(await callbacks.signIn({ user: { interactorSubject: 's' } })).toBe(false);
    expect(await callbacks.signIn({ user: { interactorSubject: 's', email: 'a@b.test' } })).toBe(
      true,
    );
  });

  it('upserts the user by subject on sign-in and stores identity on the token', async () => {
    const { store, callbacks } = setup();
    const token = await callbacks.jwt({
      token: {},
      user: { interactorSubject: 'sub-1', email: 'a@b.test', name: 'Ann', mfa: true },
    });
    expect(store.upsertUserBySubject).toHaveBeenCalledWith({
      subject: 'sub-1',
      email: 'a@b.test',
      name: 'Ann',
    });
    expect(token).toMatchObject({ userId: 'u-1', mfa: true });
  });

  it('leaves the token alone on later reads (no user)', async () => {
    const { store, callbacks } = setup();
    const token = await callbacks.jwt({ token: { userId: 'u-1', mfa: false } });
    expect(store.upsertUserBySubject).not.toHaveBeenCalled();
    expect(token).toEqual({ userId: 'u-1', mfa: false });
  });

  it('exposes only the user id and MFA flag on the session', async () => {
    const { callbacks } = setup();
    const session = await callbacks.session({
      session: { user: { name: 'Ann' }, expires: 'x' } as unknown as Session,
      token: { userId: 'u-1', mfa: true },
    });
    expect(session.user.id).toBe('u-1');
    expect(session.mfa).toBe(true);
  });
});
