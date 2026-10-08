// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  CHANNEL_LIMITS,
  SEQUENCE_ENDING_RESPONSES,
  candidateProfileContentSchema,
  fillOutreachTokens,
  outreachMessageContentSchema,
  successProfileContentSchema,
  type AgencyActor,
  type OutreachChannelValue,
  type OutreachInclude,
  type OutreachMessageContent,
  type ResponseInput,
  type SequenceInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { OutreachDraftInput } from '@/server/ai/prompts/outreach-draft';
import { logActivity } from '@/server/activity/service';
import { assertNoProtectedFields, redactStructured } from '@/server/ai/redaction';
import { createArtifact, readApproved, readApprovedVersionById } from '@/server/artifacts/service';
import { createOutboxMessage } from '@/server/messaging/outbox';
import { loadBrand } from '@/server/branding/brand';
import { brandHeaderHtml, renderUnsubscribeFooter } from '@/server/messaging/templates';
import { requireEntry, transitionEntry } from '@/server/pipeline/service';
import { getAgencySettings } from '@/server/tenancy/settings';

const DAY_MS = 86_400_000;
const TASK_ENTITY = 'pipeline_entry';

export interface TouchView {
  touchNumber: number;
  channel: OutreachChannelValue;
  status: string;
  dueAt: Date | null;
  sentAt: Date | null;
  response: string | null;
  artifactId: string | null;
  /** The newest draft or approved version of the message, if one was written. */
  approvedVersionId: string | null;
}

export interface OutreachView {
  entryId: string;
  doNotContact: boolean;
  doNotContactReason: string | null;
  hasEmail: boolean;
  /** Fills the `{{first_name}}` / `{{recruiter_name}}` placeholders when previewing a draft. */
  names: { firstName: string; recruiter: string };
  /** Someone at the agency contacted this candidate within the warning window (FR-OUT-07). */
  recentlyContacted: { at: Date; byOtherPosition: boolean } | null;
  touches: TouchView[];
}

async function candidateOf(tx: ScopedTx, candidateId: string) {
  return tx.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    select: {
      fullName: true,
      email: true,
      doNotContact: true,
      doNotContactReason: true,
    },
  });
}

function assertContactable(candidate: { doNotContact: boolean }): void {
  if (candidate.doNotContact) {
    throw new ApiError('do_not_contact', 'This candidate is marked do not contact', {
      status: 409,
    });
  }
}

export async function getOutreach(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  now: Date = new Date(),
): Promise<OutreachView> {
  const entry = await requireEntry(tx, actor, entryId, 'read');
  const [candidate, rows, settings] = await Promise.all([
    candidateOf(tx, entry.candidateId),
    tx.outreachTouch.findMany({ where: { entryId }, orderBy: { touchNumber: 'asc' } }),
    getAgencySettings(tx, actor.agencyId),
  ]);
  const since = new Date(now.getTime() - settings.recentlyContactedDays * DAY_MS);
  const recent =
    settings.recentlyContactedDays > 0
      ? await tx.outreachTouch.findFirst({
          where: {
            status: 'sent',
            sentAt: { gte: since },
            entry: { candidateId: entry.candidateId },
          },
          orderBy: { sentAt: 'desc' },
          select: { sentAt: true, entryId: true },
        })
      : null;
  const touches: TouchView[] = [];
  for (const t of rows) {
    const artifact = t.artifactId
      ? await tx.artifact.findUnique({
          where: { id: t.artifactId },
          select: { approvedVersionId: true },
        })
      : null;
    touches.push({
      touchNumber: t.touchNumber,
      channel: t.channel,
      status: t.status,
      dueAt: t.dueAt,
      sentAt: t.sentAt,
      response: t.response,
      artifactId: t.artifactId,
      approvedVersionId: artifact?.approvedVersionId ?? null,
    });
  }
  return {
    entryId,
    doNotContact: candidate.doNotContact,
    doNotContactReason: candidate.doNotContactReason,
    hasEmail: Boolean(candidate.email),
    names: {
      firstName: firstNameOf(candidate.fullName),
      recruiter: await recruiterName(tx, entry.ownerId),
    },
    recentlyContacted: recent?.sentAt
      ? { at: recent.sentAt, byOtherPosition: recent.entryId !== entryId }
      : null,
    touches,
  };
}

/**
 * Sets up (or changes) the three-touch sequence (T-5-06, US-502, brief 7.2): one channel, touch 1
 * due now, the others after the agency's intervals. Touches already sent are left alone. The
 * recruiter gets a task when a touch is due; nothing is sent by itself.
 */
export async function setSequence(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: SequenceInput,
  now: Date = new Date(),
): Promise<OutreachView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (!['screened', 'contacting', 'no_response', 'not_interested'].includes(entry.state)) {
    throw new ApiError('conflict', 'Screen the candidate before planning outreach', {
      status: 409,
    });
  }
  if (
    entry.state === 'screened' &&
    !['priority', 'potential'].includes(entry.screeningClass ?? '')
  ) {
    throw new ApiError('conflict', 'Only Priority and Potential candidates continue to outreach', {
      status: 409,
    });
  }
  assertContactable(await candidateOf(tx, entry.candidateId));
  const settings = await getAgencySettings(tx, actor.agencyId);
  const [d1, d2] = input.intervalsDays ?? settings.outreachIntervalsDays;
  const existing = await tx.outreachTouch.findMany({ where: { entryId } });
  const byNumber = new Map(existing.map((t) => [t.touchNumber, t]));
  const sent = existing.filter((t) => t.status === 'sent');
  if (sent.length === 3) {
    throw new ApiError('conflict', 'All three touches were already sent', { status: 409 });
  }
  const anchor = sent.length
    ? Math.max(...sent.map((t) => (t.sentAt ?? now).getTime()))
    : now.getTime();
  const gaps = [0, d1, d2];
  let due = anchor;
  for (const n of [1, 2, 3] as const) {
    const touch = byNumber.get(n);
    if (touch?.status === 'sent') continue;
    due = sent.length || n > 1 ? due + gaps[n - 1]! * DAY_MS : due;
    const data = {
      channel: input.channel,
      dueAt: new Date(due),
      status: touch?.status === 'drafted' ? ('drafted' as const) : ('planned' as const),
    };
    if (touch) await tx.outreachTouch.update({ where: { id: touch.id }, data });
    else
      await tx.outreachTouch.create({
        data: { agencyId: actor.agencyId, entryId, touchNumber: n, ...data },
      });
  }
  await ensureDueTask(tx, actor, entry.ownerId, entryId);
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'outreach.sequence_set',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { entryId, channel: input.channel },
  });
  return getOutreach(tx, actor, entryId, now);
}

/** One open "outreach due" task for the next touch that has not gone out (FR-OUT-04). */
async function ensureDueTask(tx: ScopedTx, actor: AgencyActor, ownerId: string, entryId: string) {
  await closeDueTask(tx, entryId, ownerId);
  const next = await tx.outreachTouch.findFirst({
    where: { entryId, status: { in: ['planned', 'drafted'] } },
    orderBy: { touchNumber: 'asc' },
  });
  if (!next?.dueAt) return;
  await tx.task.create({
    data: {
      agencyId: actor.agencyId,
      ownerId,
      kind: 'outreach_due',
      entityType: TASK_ENTITY,
      entityId: entryId,
      dueAt: next.dueAt,
    },
  });
}

async function closeDueTask(tx: ScopedTx, entryId: string, ownerId: string) {
  await tx.task.updateMany({
    where: {
      ownerId,
      kind: 'outreach_due',
      entityType: TASK_ENTITY,
      entityId: entryId,
      completedAt: null,
    },
    data: { completedAt: new Date() },
  });
}

async function requireTouch(tx: ScopedTx, entryId: string, touchNumber: number) {
  const touch = await tx.outreachTouch.findUnique({
    where: { entryId_touchNumber: { entryId, touchNumber } },
  });
  if (!touch) throw new ApiError('not_found', 'Plan the sequence first', { status: 404 });
  return touch;
}

export interface OutreachPlan {
  entryId: string;
  touchNumber: 1 | 2 | 3;
  artifactId: string;
  input: OutreachDraftInput;
  inputRefs: Record<string, unknown>;
}

/**
 * Prepares A12 for one touch (T-5-07). Needs the confirmed profile and success profile; a
 * do-not-contact candidate is refused (FR-OUT-07). The model gets no name or contact details and
 * only what earlier touches said, so a follow-up adds something new.
 */
export async function planOutreachDraft(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  touchNumber: number,
  include: OutreachInclude,
): Promise<OutreachPlan> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  assertContactable(await candidateOf(tx, entry.candidateId));
  const touch = await requireTouch(tx, entryId, touchNumber);
  if (touch.status === 'sent' || touch.status === 'cancelled') {
    throw new ApiError('conflict', 'This touch is already closed', { status: 409 });
  }
  const [profile, success, position] = await Promise.all([
    readApproved(tx, {
      kind: 'candidate_profile',
      subject: { type: 'candidate', id: entry.candidateId },
    }),
    readApproved(tx, {
      kind: 'success_profile',
      subject: { type: 'position', id: entry.positionId },
    }),
    tx.position.findUniqueOrThrow({
      where: { id: entry.positionId },
      select: {
        title: true,
        location: true,
        workArrangement: true,
        compMin: true,
        compMax: true,
        compCurrency: true,
      },
    }),
  ]);
  if (!profile)
    throw new ApiError('conflict', "Confirm the candidate's profile first", { status: 409 });
  if (!success)
    throw new ApiError('conflict', "Confirm the position's success profile first", { status: 409 });
  const parsed = candidateProfileContentSchema.parse(profile.content);
  const redacted = redactStructured({
    currentPosition: parsed.currentPosition,
    coreSkills: parsed.coreSkills,
    industryExperience: parsed.industryExperience,
    leadershipExperience: parsed.leadershipExperience,
    careerProgression: parsed.careerProgression,
    location: parsed.location,
    achievements: parsed.majorAchievements.slice(0, 4).map((a) => a.text),
  });
  assertNoProtectedFields(redacted.value, 'outreach draft input');
  const earlier: string[] = [];
  for (const t of await tx.outreachTouch.findMany({
    where: { entryId, touchNumber: { lt: touchNumber }, artifactId: { not: null } },
    orderBy: { touchNumber: 'asc' },
  })) {
    const approved = await readApprovedFor(tx, t.artifactId!);
    if (approved) earlier.push(approved.body);
  }
  let artifactId = touch.artifactId;
  if (!artifactId) {
    artifactId = (
      await createArtifact(tx, {
        agencyId: actor.agencyId,
        kind: 'outreach_message',
        subject: { type: 'pipeline_entry', id: entryId },
      })
    ).id;
    await tx.outreachTouch.update({ where: { id: touch.id }, data: { artifactId } });
  }
  const pay =
    position.compMin !== null || position.compMax !== null
      ? `${position.compMin ?? ''}-${position.compMax ?? ''} ${position.compCurrency}`
      : null;
  return {
    entryId,
    touchNumber: touchNumber as 1 | 2 | 3,
    artifactId,
    input: {
      touchNumber: touchNumber as 1 | 2 | 3,
      channel: touch.channel,
      include,
      successProfile: successProfileContentSchema.parse(success.content),
      candidate: redacted.value as OutreachDraftInput['candidate'],
      position: {
        title: position.title,
        location: position.location,
        workArrangement: position.workArrangement,
        compensation: pay,
      },
      earlier,
    },
    inputRefs: {
      entryId,
      touchNumber,
      candidateProfileVersionId: profile.id,
      successProfileVersionId: success.id,
      redactedCategories: redacted.removed,
    },
  };
}

async function readApprovedFor(
  tx: ScopedTx,
  artifactId: string,
): Promise<OutreachMessageContent | null> {
  const artifact = await tx.artifact.findUnique({
    where: { id: artifactId },
    select: { approvedVersionId: true },
  });
  if (!artifact?.approvedVersionId) return null;
  const version = await readApprovedVersionById(tx, artifact.approvedVersionId);
  const parsed = outreachMessageContentSchema.safeParse(version?.content);
  return parsed.success ? parsed.data : null;
}

export type OutreachRunner = (
  purpose: 'outreach.draft',
  input: OutreachDraftInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

/** Runs A12 for one touch; the draft is stored by the gateway and the touch is marked drafted. */
export async function draftTouch(
  deps: { run: OutreachRunner; withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T> },
  actor: AgencyActor,
  entryId: string,
  touchNumber: number,
  include: OutreachInclude,
  options: { onDelta?: (text: string) => void; signal?: AbortSignal } = {},
) {
  const plan = await deps.withAgency((tx) =>
    planOutreachDraft(tx, actor, entryId, touchNumber, include),
  );
  const entry = await deps.withAgency((tx) =>
    tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId }, select: { positionId: true } }),
  );
  const result = await deps.run('outreach.draft', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId: entry.positionId,
    subject: { type: 'pipeline_entry', id: entryId },
    artifactId: plan.artifactId,
    inputRefs: plan.inputRefs,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  await deps.withAgency((tx) =>
    tx.outreachTouch.updateMany({
      where: { entryId, touchNumber, status: 'planned' },
      data: { status: 'drafted' },
    }),
  );
  return { artifactId: plan.artifactId, generationId: result.generationId, draft: result.draft };
}

/** Loads the approved version that goes out, or explains why it cannot. */
async function approvedMessage(
  tx: ScopedTx,
  touch: { artifactId: string | null; channel: OutreachChannelValue },
  versionId: string,
): Promise<OutreachMessageContent> {
  const version = await readApprovedVersionById(tx, versionId);
  if (!version || !touch.artifactId || version.artifactId !== touch.artifactId) {
    throw new ApiError('not_approved', 'Approve the message first', { status: 409 });
  }
  const content = outreachMessageContentSchema.parse(version.content);
  if (content.body.length > CHANNEL_LIMITS[touch.channel] * 2) {
    throw new ApiError('invalid_input', 'The message is too long for this channel', {
      status: 422,
    });
  }
  return content;
}

async function recruiterName(tx: ScopedTx, userId: string): Promise<string> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? '';
}

const firstNameOf = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;

/** What the candidate will read: placeholders filled in. */
export async function previewMessage(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  content: OutreachMessageContent,
) {
  const entry = await requireEntry(tx, actor, entryId, 'read');
  const candidate = await candidateOf(tx, entry.candidateId);
  const values = {
    firstName: firstNameOf(candidate.fullName),
    recruiter: await recruiterName(tx, entry.ownerId),
  };
  return {
    subject: fillOutreachTokens(content.subject, values),
    body: fillOutreachTokens(content.body, values),
  };
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function markTouchSent(
  tx: ScopedTx,
  actor: AgencyActor,
  entry: Awaited<ReturnType<typeof requireEntry>>,
  touchNumber: number,
  extra: { outboxMessageId?: string },
  now: Date,
) {
  if (
    entry.state === 'screened' ||
    entry.state === 'no_response' ||
    entry.state === 'not_interested'
  ) {
    await transitionEntry(tx, actor, entry.id, { to: 'contacting' });
  }
  await tx.outreachTouch.update({
    where: { entryId_touchNumber: { entryId: entry.id, touchNumber } },
    data: { status: 'sent', sentAt: now, ...extra },
  });
  // The next touch is due its interval after this one actually went out.
  const later = await tx.outreachTouch.findMany({
    where: {
      entryId: entry.id,
      touchNumber: { gt: touchNumber },
      status: { in: ['planned', 'drafted'] },
    },
    orderBy: { touchNumber: 'asc' },
  });
  const settings = await getAgencySettings(tx, actor.agencyId);
  let at = now.getTime();
  for (const t of later) {
    at += settings.outreachIntervalsDays[t.touchNumber - 2]! * DAY_MS;
    await tx.outreachTouch.update({ where: { id: t.id }, data: { dueAt: new Date(at) } });
  }
  await ensureDueTask(tx, actor, entry.ownerId, entry.id);
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'outreach.sent',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: {
      entryId: entry.id,
      touchNumber,
      ...(extra.outboxMessageId ? { outboxMessageId: extra.outboxMessageId } : {}),
    },
  });
}

/**
 * Sends an approved email touch (T-5-09, US-503): the placeholders are filled in, the message goes
 * to the outbox, and the touch is marked sent. The recruiter's click is the only trigger. The route
 * dispatches the job after this transaction commits.
 */
export async function sendTouchEmail(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  touchNumber: number,
  versionId: string,
  now: Date = new Date(),
  options: { unsubscribeFor?: (address: string) => string } = {},
): Promise<{ outboxMessageId: string }> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  const candidate = await candidateOf(tx, entry.candidateId);
  assertContactable(candidate);
  const touch = await requireTouch(tx, entryId, touchNumber);
  if (touch.status === 'sent')
    throw new ApiError('conflict', 'This touch was already sent', { status: 409 });
  if (touch.status === 'cancelled')
    throw new ApiError('conflict', 'This touch was cancelled', { status: 409 });
  if (touch.channel !== 'email') {
    throw new ApiError(
      'conflict',
      'Only email touches are sent from here; copy and mark the others as sent',
      { status: 409 },
    );
  }
  if (!candidate.email)
    throw new ApiError('conflict', 'The candidate has no email address', { status: 409 });
  const content = await approvedMessage(tx, touch, versionId);
  const to = candidate.email.toLowerCase();
  if (
    await tx.suppression.findUnique({
      where: { agencyId_address: { agencyId: actor.agencyId, address: to } },
    })
  ) {
    throw new ApiError('suppressed', 'This address opted out or bounced', { status: 409 });
  }
  const shown = await previewMessage(tx, actor, entryId, content);
  const footer = options.unsubscribeFor
    ? await renderUnsubscribeFooter({ locale: 'en', url: options.unsubscribeFor(to) })
    : { text: '', html: '' };
  const settings = await tx.agency.findUnique({
    where: { id: actor.agencyId },
    select: { settings: true },
  });
  const brand = await loadBrand(tx, actor.agencyId, getEnv().APP_URL);
  const message = await createOutboxMessage(
    tx,
    {
      agencyId: actor.agencyId,
      senderId: actor.userId,
      toAddress: to,
      subject: shown.subject || '(no subject)',
      bodyText: shown.body + footer.text,
      bodyHtml: `<div style="font-family:system-ui,sans-serif">${brandHeaderHtml(brand)}${escapeHtml(shown.body).replace(/\n/g, '<br>')}${footer.html}</div>`,
      kind: 'outreach',
      entityType: 'pipeline_entry',
      entityId: entryId,
    },
    settings?.settings ?? null,
  );
  await markTouchSent(tx, actor, entry, touchNumber, { outboxMessageId: message.id }, now);
  return { outboxMessageId: message.id };
}

/** LinkedIn, text and phone: the recruiter copies the message, sends it themselves and marks it sent (US-504). */
export async function markTouchSentByHand(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  touchNumber: number,
  versionId: string,
  now: Date = new Date(),
): Promise<OutreachView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  assertContactable(await candidateOf(tx, entry.candidateId));
  const touch = await requireTouch(tx, entryId, touchNumber);
  if (touch.status === 'sent')
    throw new ApiError('conflict', 'This touch was already sent', { status: 409 });
  if (touch.status === 'cancelled')
    throw new ApiError('conflict', 'This touch was cancelled', { status: 409 });
  if (touch.channel === 'email') {
    throw new ApiError('conflict', 'Email touches are sent from the app', { status: 409 });
  }
  await approvedMessage(tx, touch, versionId);
  await markTouchSent(tx, actor, entry, touchNumber, {}, now);
  return getOutreach(tx, actor, entryId, now);
}

/**
 * Records how the candidate answered (T-5-10, FR-OUT-05). A reply ends the sequence: touches not yet
 * sent are cancelled and the due task is closed. "Interested" and "not interested" also move the
 * candidate (the latter needs a reason from the agency's list). No answer after the last touch moves
 * them to "no response".
 */
export async function recordResponse(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: ResponseInput,
  now: Date = new Date(),
): Promise<OutreachView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  const sent = await tx.outreachTouch.findMany({
    where: { entryId, status: 'sent' },
    orderBy: { touchNumber: 'asc' },
  });
  const touch = input.touchNumber
    ? sent.find((t) => t.touchNumber === input.touchNumber)
    : sent.at(-1);
  if (!touch) throw new ApiError('conflict', 'No touch has been sent yet', { status: 409 });
  if (input.response === 'not_interested' && !input.reasonCode) {
    throw new ApiError('invalid_input', 'Choose a reason', {
      status: 422,
      fields: { reasonCode: 'Choose a reason' },
    });
  }
  await tx.outreachTouch.update({ where: { id: touch.id }, data: { response: input.response } });
  const ends = SEQUENCE_ENDING_RESPONSES.includes(input.response);
  if (ends) {
    await tx.outreachTouch.updateMany({
      where: { entryId, status: { in: ['planned', 'drafted'] } },
      data: { status: 'cancelled' },
    });
    await closeDueTask(tx, entryId, entry.ownerId);
  }
  if (entry.state === 'contacting') {
    if (input.response === 'interested')
      await transitionEntry(tx, actor, entryId, { to: 'interested' });
    else if (input.response === 'not_interested') {
      await transitionEntry(tx, actor, entryId, {
        to: 'not_interested',
        reasonCode: input.reasonCode!,
        ...(input.reason ? { reason: input.reason } : {}),
      });
    } else if (input.response === 'no_response' && touch.touchNumber === 3) {
      await transitionEntry(tx, actor, entryId, { to: 'no_response' });
    }
  }
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'outreach.response',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { entryId, touchNumber: touch.touchNumber, response: input.response },
  });
  return getOutreach(tx, actor, entryId, now);
}
