// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import { CredentialsError, type CredentialsClient } from '@/lib/interactor/credentials';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { readyMatchEntry } from '@/test/match-fixtures';
import { runReplySync } from './reply-sync';
import {
  createMailboxTransport,
  disconnectMailbox,
  externalUserId,
  getMyMailbox,
  recordMailbox,
  startMailboxConnection,
  type MailboxDeps,
  type MailboxStore,
} from './mailbox';
import {
  ProviderAuthError,
  ProviderHttpError,
  type MailProvider,
  type ThreadMessage,
} from './providers/types';
import { PermanentSendError } from './transport-core';

const fakeProvider = (over: Partial<MailProvider> = {}): MailProvider => ({
  name: 'gmail',
  address: async () => 'sam@agency.test',
  send: async () => ({ messageId: 'msg-1', threadId: 'thr-1' }),
  listThread: async () => [],
  ...over,
});
const fakeCredentials = (over: Partial<CredentialsClient> = {}): CredentialsClient => ({
  initiateOAuth: async () => ({ flowId: 'f', authorizationUrl: 'https://accounts.example/auth' }),
  getCredential: async () => {
    throw new Error('not stubbed');
  },
  getAccessToken: async () => 'token',
  deleteCredential: async () => undefined,
  ...over,
});

describe.skipIf(!dbAvailable())('connected mailbox (T-5-12, US-505)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let other: string;
  let sam: AgencyActor;
  let lee: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const member = async (ag: string): Promise<AgencyActor> => {
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [ag, u],
    );
    return { kind: 'agency', userId: u, agencyId: ag, role: 'recruiter' };
  };
  const depsWith = (credentials: CredentialsClient, provider = fakeProvider()): MailboxDeps => ({
    credentials,
    providers: { google: provider, microsoft: fakeProvider({ name: 'graph' }) },
    serviceIds: { google: 'gmail', microsoft: 'outlook' },
  });

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Mailbox A');
    other = await createAgency(admin, 'Mailbox B');
    sam = await member(agency);
    lee = await member(agency);
    clientId = (await run((tx) => createClient(tx, sam, { name: 'Mb Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency, other] });
    await admin.end();
    await handle.close();
  });

  describe('connecting', () => {
    it('starts the sign-in for the right service, person and scopes', async () => {
      const initiate = vi.fn(async () => ({
        flowId: 'f',
        authorizationUrl: 'https://accounts.example/x',
      }));
      const result = await startMailboxConnection(
        depsWith(fakeCredentials({ initiateOAuth: initiate })),
        {
          agencyId: agency,
          userId: sam.userId,
          provider: 'google',
          returnUrl: 'https://app.test/a/acme/settings/mailbox',
        },
      );
      expect(result).toEqual({ authorizationUrl: 'https://accounts.example/x' });
      expect(initiate).toHaveBeenCalledWith({
        serviceId: 'gmail',
        externalUserId: externalUserId(agency, sam.userId),
        scopes: expect.arrayContaining(['https://www.googleapis.com/auth/gmail.send']),
        successRedirectUrl: 'https://app.test/a/acme/settings/mailbox?provider=google',
      });
    });

    it('records the connection only for the person it belongs to, and reads the address from the mailbox', async () => {
      const credentials = fakeCredentials({
        getCredential: async (id) => ({
          id,
          externalUserId: externalUserId(agency, sam.userId),
          serviceId: 'gmail',
          status: 'active',
          scopes: [],
        }),
      });
      await expect(
        run((tx) =>
          recordMailbox(tx, depsWith(credentials), {
            agencyId: agency,
            userId: lee.userId,
            provider: 'google',
            credentialId: 'cred-1',
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      const view = await run((tx) =>
        recordMailbox(tx, depsWith(credentials), {
          agencyId: agency,
          userId: sam.userId,
          provider: 'google',
          credentialId: 'cred-1',
        }),
      );
      expect(view).toMatchObject({
        provider: 'google',
        address: 'sam@agency.test',
        status: 'active',
      });
      expect(await run((tx) => getMyMailbox(tx, sam.userId))).toMatchObject({
        address: 'sam@agency.test',
      });
      expect(await run((tx) => getMyMailbox(tx, lee.userId))).toBeNull();
      // Wrong service for the provider chosen.
      await expect(
        run((tx) =>
          recordMailbox(
            tx,
            depsWith(
              fakeCredentials({
                getCredential: async (id) => ({
                  id,
                  externalUserId: externalUserId(agency, lee.userId),
                  serviceId: 'slack',
                  status: 'active',
                  scopes: [],
                }),
              }),
            ),
            { agencyId: agency, userId: lee.userId, provider: 'google', credentialId: 'c2' },
          ),
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses a sign-in that was not completed, and says so when the service cannot be reached', async () => {
      await expect(
        run((tx) =>
          recordMailbox(
            tx,
            depsWith(
              fakeCredentials({
                getCredential: async (id) => ({
                  id,
                  externalUserId: externalUserId(agency, lee.userId),
                  serviceId: 'gmail',
                  status: 'pending',
                  scopes: [],
                }),
              }),
            ),
            { agencyId: agency, userId: lee.userId, provider: 'google', credentialId: 'c3' },
          ),
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        run((tx) =>
          recordMailbox(
            tx,
            depsWith(
              fakeCredentials({
                getCredential: async () => {
                  throw new CredentialsError('down', true, 503);
                },
              }),
            ),
            { agencyId: agency, userId: lee.userId, provider: 'google', credentialId: 'c4' },
          ),
        ),
      ).rejects.toMatchObject({ status: 503 });
    });

    it('disconnects: the credential is deleted at Interactor and the record goes', async () => {
      const del = vi.fn(async () => undefined);
      await run((tx) =>
        disconnectMailbox(
          tx,
          { credentials: fakeCredentials({ deleteCredential: del }) },
          {
            agencyId: agency,
            userId: sam.userId,
          },
        ),
      );
      expect(del).toHaveBeenCalledWith('cred-1');
      expect(await run((tx) => getMyMailbox(tx, sam.userId))).toBeNull();
    });

    it("keeps one agency's connections out of another's reach", async () => {
      await admin.query(
        `INSERT INTO "MailConnection" (id, "agencyId", "userId", provider, "credentialId", address, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'google', 'x', 'a@b.test', now())`,
        [agency, lee.userId],
      );
      const rows = await appScope(handle).withAgency(other, (tx) => tx.mailConnection.findMany());
      expect(rows).toEqual([]);
      await admin.query(`DELETE FROM "MailConnection" WHERE "agencyId" = $1`, [agency]);
    });
  });

  describe('sending from the mailbox', () => {
    const message = {
      id: 'm1',
      agencyId: '',
      toAddress: 'jane@example.com',
      subject: 'Hello',
      bodyText: 't',
      bodyHtml: 'h',
      senderId: '',
    };
    const store = (
      found: Awaited<ReturnType<MailboxStore['find']>>,
    ): MailboxStore & { reconnect: ReturnType<typeof vi.fn> } => {
      const reconnect = vi.fn(async () => undefined);
      return { find: async () => found, markNeedsReconnect: reconnect, reconnect };
    };
    const active = {
      provider: 'google' as const,
      credentialId: 'cred-1',
      address: 'sam@agency.test',
      status: 'active' as const,
    };

    it('sends with the token Interactor holds and returns the conversation id', async () => {
      const send = vi.fn(async () => ({ messageId: 'msg-9', threadId: 'thr-9' }));
      const transport = createMailboxTransport(store(active), {
        credentials: fakeCredentials(),
        providers: { google: fakeProvider({ send }), microsoft: fakeProvider({ name: 'graph' }) },
      });
      const outcome = await transport.send({ ...message, agencyId: agency, senderId: sam.userId });
      expect(outcome).toEqual({
        status: 'sent',
        providerId: 'msg-9',
        threadId: 'thr-9',
        transport: 'gmail',
      });
      expect(send).toHaveBeenCalledWith('token', {
        to: 'jane@example.com',
        subject: 'Hello',
        text: 't',
        html: 'h',
        replyTo: 'sam@agency.test',
      });
    });

    it('fails at once with something the recruiter can act on when there is no usable mailbox', async () => {
      const deps = {
        credentials: fakeCredentials(),
        providers: { google: fakeProvider(), microsoft: fakeProvider({ name: 'graph' }) },
      };
      const send = (s: MailboxStore) =>
        createMailboxTransport(s, deps).send({
          ...message,
          agencyId: agency,
          senderId: sam.userId,
        });
      await expect(send(store(null))).rejects.toThrow(/Connect your mailbox first/);
      await expect(send(store({ ...active, status: 'needs_reconnect' }))).rejects.toBeInstanceOf(
        PermanentSendError,
      );
      await expect(
        createMailboxTransport(store(active), deps).send({ ...message, agencyId: agency }),
      ).rejects.toBeInstanceOf(PermanentSendError);
    });

    it('marks the mailbox when the sign-in no longer works, retries a hiccup, and does not retry a rejection', async () => {
      const s = store(active);
      const withProvider = (send: MailProvider['send']) =>
        createMailboxTransport(s, {
          credentials: fakeCredentials(),
          providers: { google: fakeProvider({ send }), microsoft: fakeProvider({ name: 'graph' }) },
        }).send({ ...message, agencyId: agency, senderId: sam.userId });
      await expect(
        withProvider(async () => {
          throw new ProviderAuthError();
        }),
      ).rejects.toThrow(/connected again/);
      expect(s.reconnect).toHaveBeenCalledWith(agency, sam.userId);
      await expect(
        withProvider(async () => {
          throw new ProviderHttpError('busy', 503, true);
        }),
      ).rejects.not.toBeInstanceOf(PermanentSendError);
      await expect(
        withProvider(async () => {
          throw new ProviderHttpError('bad request', 400, false);
        }),
      ).rejects.toBeInstanceOf(PermanentSendError);
      // The credential service saying the credential is gone is the same as a refused token.
      const gone = createMailboxTransport(store(active), {
        credentials: fakeCredentials({
          getAccessToken: async () => {
            throw new CredentialsError('gone', false, 404);
          },
        }),
        providers: { google: fakeProvider(), microsoft: fakeProvider({ name: 'graph' }) },
      });
      await expect(
        gone.send({ ...message, agencyId: agency, senderId: sam.userId }),
      ).rejects.toBeInstanceOf(PermanentSendError);
    });
  });

  describe('noticing replies', () => {
    const NOW = new Date('2026-10-20T12:00:00Z');
    /** A candidate with touch 1 sent from Sam's mailbox on `sentAt` and touches 2 and 3 still planned. */
    const sentSequence = async (threadId: string, sentAt = new Date('2026-10-18T09:00:00Z')) => {
      const { entry } = await readyMatchEntry(run, sam, clientId);
      await admin.query(`UPDATE "PipelineEntry" SET state = 'contacting' WHERE id = $1`, [
        entry.id,
      ]);
      const message = await admin.query(
        `INSERT INTO "OutboxMessage" (id, "agencyId", "senderId", "toAddress", subject, "bodyHtml", "bodyText", kind, transport, status, "sentAt", "providerThreadId", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'jane@example.com', 'Hi', 'h', 't', 'outreach', 'gmail', 'sent', $3, $4, now()) RETURNING id`,
        [agency, sam.userId, sentAt, threadId],
      );
      for (const n of [1, 2, 3]) {
        await admin.query(
          `INSERT INTO "OutreachTouch" (id, "agencyId", "entryId", "touchNumber", channel, status, "sentAt", "outboxMessageId", "dueAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, 'email', $4::"TouchStatus", $5, $6, now(), now())`,
          [
            agency,
            entry.id,
            n,
            n === 1 ? 'sent' : 'planned',
            n === 1 ? sentAt : null,
            n === 1 ? message.rows[0].id : null,
          ],
        );
      }
      await admin.query(
        `INSERT INTO "Task" (id, "agencyId", "ownerId", kind, "entityType", "entityId", "dueAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'outreach_due', 'pipeline_entry', $3, now(), now())`,
        [agency, entry.ownerId, entry.id],
      );
      return entry;
    };
    const connect = async (userId: string) => {
      await admin.query(
        `INSERT INTO "MailConnection" (id, "agencyId", "userId", provider, "credentialId", address, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'google', 'cred-sync', 'sam@agency.test', now())
         ON CONFLICT ("agencyId", "userId") DO UPDATE SET status = 'active'`,
        [agency, userId],
      );
    };
    const sync = (threads: Record<string, ThreadMessage[]>, provider?: Partial<MailProvider>) =>
      runReplySync({
        agencyIds: async () => [agency],
        withAgency: (id, fn) => appScope(handle).withAgency(id, fn),
        credentials: fakeCredentials(),
        providers: {
          google: fakeProvider({ listThread: async (_t, id) => threads[id] ?? [], ...provider }),
          microsoft: fakeProvider({ name: 'graph' }),
        },
        now: () => NOW,
      });
    const touches = async (entryId: string) =>
      (
        await admin.query(
          `SELECT "touchNumber", status, response FROM "OutreachTouch" WHERE "entryId" = $1 ORDER BY "touchNumber"`,
          [entryId],
        )
      ).rows;

    it('stops the sequence, marks the touch and gives the recruiter a task, without moving the candidate', async () => {
      await connect(sam.userId);
      const entry = await sentSequence('thr-reply');
      const summary = await sync({
        'thr-reply': [
          { id: 'a', from: 'sam@agency.test', receivedAt: new Date('2026-10-18T09:00:00Z') },
          { id: 'b', from: 'jane@example.com', receivedAt: new Date('2026-10-19T08:00:00Z') },
        ],
      });
      expect(summary).toMatchObject({ mailboxes: 1, replies: 1 });
      expect(await touches(entry.id)).toEqual([
        { touchNumber: 1, status: 'sent', response: 'replied' },
        { touchNumber: 2, status: 'cancelled', response: null },
        { touchNumber: 3, status: 'cancelled', response: null },
      ]);
      const state = (
        await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [entry.id])
      ).rows[0];
      expect(state.state).toBe('contacting');
      const tasks = (
        await admin.query(
          `SELECT kind, "completedAt" FROM "Task" WHERE "entityId" = $1 ORDER BY kind`,
          [entry.id],
        )
      ).rows;
      expect(tasks.find((t) => t.kind === 'reply_received')!.completedAt).toBeNull();
      expect(tasks.find((t) => t.kind === 'outreach_due')!.completedAt).not.toBeNull();
      const log = await admin.query(
        `SELECT "actorType", data FROM "ActivityLog" WHERE "entityType" = 'candidate' AND action = 'outreach.reply_noticed' AND data->>'entryId' = $1`,
        [entry.id],
      );
      expect(log.rows[0].actorType).toBe('system');
      // A second pass changes nothing.
      expect(
        await sync({
          'thr-reply': [
            { id: 'b', from: 'jane@example.com', receivedAt: new Date('2026-10-19T08:00:00Z') },
          ],
        }),
      ).toMatchObject({ replies: 0 });
    });

    it('ignores the recruiter’s own messages, messages from before the send, and conversations nobody answered', async () => {
      await connect(sam.userId);
      const own = await sentSequence('thr-own');
      const earlier = await sentSequence('thr-earlier');
      const quiet = await sentSequence('thr-quiet');
      const summary = await sync({
        'thr-own': [
          {
            id: 'a',
            from: 'SAM@agency.test'.toLowerCase(),
            receivedAt: new Date('2026-10-19T00:00:00Z'),
          },
        ],
        'thr-earlier': [
          { id: 'b', from: 'jane@example.com', receivedAt: new Date('2026-10-17T00:00:00Z') },
        ],
        'thr-quiet': [],
      });
      expect(summary.replies).toBe(0);
      for (const e of [own, earlier, quiet]) {
        expect((await touches(e.id))[0]).toMatchObject({ response: null });
        expect((await touches(e.id))[1]).toMatchObject({ status: 'planned' });
      }
    });

    it('lets the recruiter classify the reply afterwards, which can move the candidate', async () => {
      await connect(sam.userId);
      const entry = await sentSequence('thr-classify');
      await sync({
        'thr-classify': [
          { id: 'b', from: 'jane@example.com', receivedAt: new Date('2026-10-19T08:00:00Z') },
        ],
      });
      const { recordResponse } = await import('@/server/outreach/service');
      await run((tx) => recordResponse(tx, sam, entry.id, { response: 'interested' }));
      expect((await touches(entry.id))[0]).toMatchObject({ response: 'interested' });
      expect(
        (await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [entry.id])).rows[0]
          .state,
      ).toBe('interested');
    });

    it('asks the recruiter to connect again when the sign-in stops working, and keeps going with the others', async () => {
      await connect(sam.userId);
      await sentSequence('thr-auth');
      const summary = await sync(
        {},
        {
          listThread: async () => {
            throw new ProviderAuthError();
          },
        },
      );
      expect(summary.needReconnect).toBe(1);
      const row = (
        await admin.query(`SELECT status FROM "MailConnection" WHERE "userId" = $1`, [sam.userId])
      ).rows[0];
      expect(row.status).toBe('needs_reconnect');
      // A mailbox that needs signing in again is skipped from now on.
      expect((await sync({})).mailboxes).toBe(0);
    });
  });
});
