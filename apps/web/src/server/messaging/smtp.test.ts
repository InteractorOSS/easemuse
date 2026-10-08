// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { createSmtpTransport, fromHeader, smtpConfigFromEnv, type SmtpConfig } from './smtp';
import { PermanentSendError, selectTransport, type OutgoingMessage } from './transport';

const config: SmtpConfig = {
  host: 'smtp.example.test',
  port: 587,
  user: 'u',
  password: 'p',
  secure: false,
  from: 'noreply@easemuse.test',
};
const message: OutgoingMessage = {
  id: 'm1',
  agencyId: 'a1',
  toAddress: 'jane@example.com',
  subject: 'A role for you',
  bodyText: 'Hi Jane',
  bodyHtml: '<p>Hi Jane</p>',
  senderName: 'Sam "Sammy" <Recruiter>',
  senderEmail: 'sam@agency.test',
  agencyName: 'Acme Search',
};

describe('SMTP transport (T-5-02)', () => {
  it('sends from the configured address named after the recruiter, with replies to the recruiter', async () => {
    const sendMail = vi.fn(async () => ({ messageId: '<abc@smtp>' }));
    const create = vi.fn(() => ({ sendMail }));
    const transport = createSmtpTransport(config, create as never);
    const outcome = await transport.send(message);
    expect(outcome).toEqual({ status: 'sent', providerId: '<abc@smtp>' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 587,
        secure: false,
        auth: { user: 'u', pass: 'p' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Sam Sammy Recruiter (Acme Search)" <noreply@easemuse.test>',
        to: 'jane@example.com',
        replyTo: 'sam@agency.test',
        subject: 'A role for you',
        text: 'Hi Jane',
        html: '<p>Hi Jane</p>',
        headers: { 'X-EaseMuse-Message': 'm1' },
      }),
    );
  });

  it('works without a login and for system mail without a sender', async () => {
    const sendMail = vi.fn(async (_options: Record<string, unknown>) => ({ messageId: 'x' }));
    const create = vi.fn((_options: Record<string, unknown>) => ({ sendMail }));
    await createSmtpTransport(
      { ...config, user: undefined, password: undefined },
      create as never,
    ).send({
      id: 'm2',
      agencyId: 'a1',
      toAddress: 'x@y.test',
      subject: 's',
      bodyText: 't',
      bodyHtml: 'h',
    });
    expect(create.mock.calls[0]![0]).not.toHaveProperty('auth');
    const sent = sendMail.mock.calls[0]![0];
    expect(sent.from).toBe('noreply@easemuse.test');
    expect(sent).not.toHaveProperty('replyTo');
  });

  it('treats a refused login or a 5xx answer as permanent, and a 4xx or a dropped connection as worth retrying', async () => {
    const failing = (error: object) =>
      createSmtpTransport(config, (() => ({
        sendMail: async () => {
          throw Object.assign(new Error('boom'), error);
        },
      })) as never).send(message);
    await expect(failing({ code: 'EAUTH' })).rejects.toBeInstanceOf(PermanentSendError);
    await expect(failing({ responseCode: 550 })).rejects.toBeInstanceOf(PermanentSendError);
    const transient = await failing({ responseCode: 421 }).catch((e: unknown) => e);
    expect(transient).not.toBeInstanceOf(PermanentSendError);
    const dropped = await failing({ code: 'ECONNECTION' }).catch((e: unknown) => e);
    expect(dropped).not.toBeInstanceOf(PermanentSendError);
  });

  it('reads the environment: host and sender address are both needed', () => {
    const env = (over: object) => ({ ...over }) as never;
    expect(smtpConfigFromEnv(env({ SMTP_HOST: 'h' }))).toBeNull();
    expect(smtpConfigFromEnv(env({ MAIL_FROM: 'a@b.test' }))).toBeNull();
    expect(smtpConfigFromEnv(env({ SMTP_HOST: 'h', MAIL_FROM: 'a@b.test' }))).toMatchObject({
      port: 587,
      secure: false,
    });
    expect(
      smtpConfigFromEnv(env({ SMTP_HOST: 'h', MAIL_FROM: 'a@b.test', SMTP_PORT: 465 })),
    ).toMatchObject({ secure: true });
  });

  it('keeps a hostile display name from breaking the header', () => {
    expect(
      fromHeader(config, { ...message, senderName: 'A"\r\nBcc: x@y.test', agencyName: null }),
    ).toBe('"A Bcc: x@y.test" <noreply@easemuse.test>');
  });
});

describe('selectTransport', () => {
  it('chooses SMTP when asked and configured; otherwise a transport that fails each send clearly', async () => {
    expect(selectTransport({ emailTransport: 'smtp' }, { smtp: config }).name).toBe('smtp');
    const missing = selectTransport({ emailTransport: 'smtp' }, { smtp: null });
    await expect(missing.send(message)).rejects.toMatchObject({
      name: 'PermanentSendError',
      message: 'SMTP is not configured on this server',
    });
    const noMailbox = selectTransport({ emailTransport: 'mailbox' });
    await expect(noMailbox.send(message)).rejects.toBeInstanceOf(PermanentSendError);
  });

  it('keeps capture as the default and for the test modes', async () => {
    expect(selectTransport(null).name).toBe('dev-capture');
    expect(selectTransport({ emailTransport: 'dev-capture' }).name).toBe('dev-capture');
    expect(selectTransport({ emailTransport: 'log-only' }).name).toBe('log-only');
  });
});
