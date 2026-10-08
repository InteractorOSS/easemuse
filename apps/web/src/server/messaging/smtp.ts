// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv } from '@/lib/env';
import { PermanentSendError, type OutgoingMessage, type Transport } from './transport-core';

/**
 * The SMTP transport (T-5-02, ADR-009): mail goes out through the SMTP service the platform operator
 * configured (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`). The visible sender
 * is the configured address, named after the recruiter and the agency, and replies go to the
 * recruiter's own address, so the conversation continues in their inbox. Reply sync is not part of
 * SMTP; use a connected mailbox for that (T-5-12).
 */
export interface SmtpConfig {
  host: string;
  port: number;
  user?: string | undefined;
  password?: string | undefined;
  /** Implicit TLS (port 465). Other ports upgrade with STARTTLS when the server offers it. */
  secure: boolean;
  from: string;
}

/** The environment's SMTP settings, or null when the host or the sender address is missing. */
export function smtpConfigFromEnv(env = getEnv()): SmtpConfig | null {
  if (!env.SMTP_HOST || !env.MAIL_FROM) return null;
  const port = env.SMTP_PORT ?? 587;
  return {
    host: env.SMTP_HOST,
    port,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    secure: port === 465,
    from: env.MAIL_FROM,
  };
}

/** A display name that cannot break the header: no quotes, angle brackets or line breaks. */
const displayName = (value: string) =>
  value
    .replace(/["<>\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function fromHeader(config: SmtpConfig, message: OutgoingMessage): string {
  const who = displayName(message.senderName ?? '');
  const agency = displayName(message.agencyName ?? '');
  const name = who && agency ? `${who} (${agency})` : who || agency;
  return name ? `"${name}" <${config.from}>` : config.from;
}

type CreateTransport = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}) => Pick<Transporter, 'sendMail'>;

const TIMEOUT_MS = 20_000;

export function createSmtpTransport(
  config: SmtpConfig,
  create: CreateTransport = nodemailer.createTransport as unknown as CreateTransport,
): Transport {
  return {
    name: 'smtp',
    async send(message) {
      const transporter = create({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: TIMEOUT_MS,
      });
      try {
        const info = await transporter.sendMail({
          from: fromHeader(config, message),
          to: message.toAddress,
          ...(message.senderEmail ? { replyTo: message.senderEmail } : {}),
          subject: message.subject,
          text: message.bodyText,
          html: message.bodyHtml,
          headers: { 'X-EaseMuse-Message': message.id },
        });
        return { status: 'sent', providerId: info.messageId };
      } catch (error) {
        const e = error as { code?: string; responseCode?: number; message?: string };
        // 5xx replies mean the server refused this message or these credentials; trying again will not help.
        if (e.code === 'EAUTH') throw new PermanentSendError('The SMTP server refused the login');
        if (typeof e.responseCode === 'number' && e.responseCode >= 500) {
          throw new PermanentSendError(
            `The SMTP server rejected the message (${e.responseCode}): ${(e.message ?? '').slice(0, 200)}`,
          );
        }
        throw error;
      }
    },
  };
}
