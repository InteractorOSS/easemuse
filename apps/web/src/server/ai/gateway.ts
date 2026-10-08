// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import type { AgencyActor, SystemActor } from '@easemuse/core';
import type { Scope } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { addDraftVersion, findOrCreateArtifact, type Subject } from '@/server/artifacts/service';
import { AiCallError, AiCancelledError, toApiError } from './errors';
import { assertWithinBudget, recordLlmCall } from './ledger';
import type { ModelClient, SearchResponse } from './anthropic';
import type { TokenUsage } from './pricing';
import { createPromptRegistry, type PromptRegistry } from './prompts';
import { PURPOSES, isPurposeId, type PurposeId } from './purposes';

/** Everything `ai.run` needs to know about the request (ADR-004, FR-AI-01, FR-AI-03). */
export interface AiRunContext {
  agencyId: string;
  /** A signed-in recruiter. AI never starts on its own (brief §1.1). */
  actor: AgencyActor | SystemActor;
  /** Charged to this position in cost reports (FR-AI-08). */
  positionId?: string;
  /** Where the resulting draft is stored; required for purposes that produce an artifact. */
  subject?: Subject;
  /** Add the draft to this artifact instead of finding or creating one for the subject. */
  artifactId?: string;
  /** Ids and versions of every record the prompt used: the provenance of the result. */
  inputRefs: Record<string, unknown>;
  /** Receives generated text as it arrives (streaming drafts). */
  onDelta?: (text: string) => void;
  /** Aborts the call (the recruiter cancelled, FR-AI-07). */
  signal?: AbortSignal;
}

export interface AiRunResult<O = unknown> {
  generationId: string;
  output: O;
  /** The draft created from the output, when the purpose produces an artifact. */
  draft: { artifactId: string; versionId: string; version: number } | null;
  usage: TokenUsage;
  costUsd: number;
}

export interface GatewayDeps {
  scope: Pick<Scope, 'withAgency'>;
  model: ModelClient;
  prompts?: PromptRegistry;
  log?: (message: string, data: Record<string, unknown>) => void;
}

/**
 * The AI gateway (ADR-004): the single path from the application to a model. `ai.run` checks that a
 * person asked, enforces the agency's budget, builds the prompt, calls the model, records the call
 * and the provenance, and stores the answer as a DRAFT. A failure leaves existing data unchanged
 * and saves no partial draft (FR-AI-07).
 */
export function createGateway(deps: GatewayDeps) {
  const prompts = deps.prompts ?? createPromptRegistry();
  const log = deps.log ?? (() => undefined);

  async function run<I, O = unknown>(
    purposeId: PurposeId,
    input: I,
    ctx: AiRunContext,
  ): Promise<AiRunResult<O>> {
    if (!isPurposeId(purposeId))
      throw new ApiError('invalid_input', `Unknown AI purpose: ${String(purposeId)}`, {
        status: 422,
      });
    const purpose = PURPOSES[purposeId];
    const prompt = prompts.get(purposeId);
    if (!prompt)
      throw new ApiError('ai_not_available', `The ${purposeId} assistant is not available yet`, {
        status: 501,
      });

    // 1. A person must have asked (FR-AI-01). The only exception, embeddings, does not come through here.
    if (ctx.actor.kind !== 'agency' || ctx.actor.agencyId !== ctx.agencyId) {
      throw new ApiError('forbidden', 'AI runs only when a recruiter asks for it', { status: 403 });
    }
    if (purpose.artifactKind && !ctx.subject && !ctx.artifactId) {
      throw new ApiError('invalid_input', `${purposeId} needs a subject for its draft`, {
        status: 422,
      });
    }
    const requestedById = ctx.actor.userId;

    // 2. Budget gate, then the provenance record (short transaction; the model call happens outside it).
    const generationId = await deps.scope.withAgency(ctx.agencyId, async (tx) => {
      await assertWithinBudget(tx, ctx.agencyId);
      const row = await tx.aiGeneration.create({
        data: {
          agencyId: ctx.agencyId,
          purpose: purposeId,
          requestedById,
          promptVersion: prompt.version,
          model: purpose.model,
          inputRefs: ctx.inputRefs as Prisma.InputJsonValue,
          status: 'running',
        },
        select: { id: true },
      });
      return row.id;
    });

    // 3. The optional web search step, recorded on its own so its cost is kept even if the next step fails.
    let research: SearchResponse | null = null;
    let recordedCalls = 0;
    const researchRequest = prompt.research?.buildRequest(input) ?? null;
    if (researchRequest) {
      try {
        if (!deps.model.search) throw new Error('The model client cannot run a web search');
        research = await deps.model.search({
          model: purpose.model,
          effort: purpose.effort,
          system: researchRequest.system,
          user: researchRequest.user,
          maxTokens: purpose.maxTokens,
          maxUses: researchRequest.maxUses,
          blockedDomains: researchRequest.blockedDomains,
          signal: ctx.signal,
        });
        const searched = research;
        await deps.scope.withAgency(ctx.agencyId, (tx) =>
          recordLlmCall(tx, {
            agencyId: ctx.agencyId,
            aiGenerationId: generationId,
            requestedById,
            positionId: ctx.positionId ?? null,
            purpose: purposeId,
            model: purpose.model,
            promptVersion: prompt.version,
            usage: searched.usage,
            latencyMs: searched.latencyMs,
          }),
        );
        recordedCalls = 1;
      } catch (error) {
        const spent = error instanceof AiCallError ? error.usage : undefined;
        await finish(generationId, ctx, purposeId, prompt.version, 'failed', spent, 0, error, 0);
        throw toApiError(error);
      }
    }

    // 4. The model call.
    let usage: TokenUsage | undefined;
    let latencyMs = 0;
    let output: O;
    try {
      const { system, user } = prompt.buildPrompt(input, research);
      const response = await deps.model.complete<O>({
        purpose: purposeId,
        model: purpose.model,
        effort: purpose.effort,
        system,
        user,
        schema: prompt.schema as never,
        maxTokens: purpose.maxTokens,
        onDelta: ctx.onDelta,
        signal: ctx.signal,
      });
      usage = response.usage;
      latencyMs = response.latencyMs;
      output = response.parsed;
    } catch (error) {
      // A refusal or truncated answer still cost tokens: record them.
      usage = error instanceof AiCallError ? error.usage : undefined;
      await finish(
        generationId,
        ctx,
        purposeId,
        prompt.version,
        'failed',
        usage,
        latencyMs,
        error,
        recordedCalls,
      );
      throw toApiError(error);
    }

    // 5. Record the call and store the draft in ONE transaction: either both exist or neither.
    try {
      const stored = await deps.scope.withAgency(ctx.agencyId, async (tx) => {
        const call = await recordLlmCall(tx, {
          agencyId: ctx.agencyId,
          aiGenerationId: generationId,
          requestedById,
          positionId: ctx.positionId ?? null,
          purpose: purposeId,
          model: purpose.model,
          promptVersion: prompt.version,
          usage: usage!,
          latencyMs,
        });
        let draft: AiRunResult['draft'] = null;
        if (purpose.artifactKind) {
          const artifactId =
            ctx.artifactId ??
            (
              await findOrCreateArtifact(tx, {
                agencyId: ctx.agencyId,
                kind: purpose.artifactKind,
                subject: ctx.subject!,
              })
            ).id;
          const content = prompt.toContent
            ? prompt.toContent(output, input as never, research)
            : (output as Record<string, unknown>);
          const version = await addDraftVersion(tx, {
            agencyId: ctx.agencyId,
            artifactId,
            content,
            origin: 'ai',
            createdById: requestedById,
            aiGenerationId: generationId,
          });
          draft = { artifactId, versionId: version.id, version: version.version };
        }
        await tx.aiGeneration.update({
          where: { id: generationId },
          data: { status: 'succeeded' },
        });
        return { draft, costUsd: call.costUsd };
      });
      return { generationId, output, draft: stored.draft, usage: usage!, costUsd: stored.costUsd };
    } catch (error) {
      // The answer was unusable (for example it failed the kind's schema): keep the cost, drop the draft.
      await finish(
        generationId,
        ctx,
        purposeId,
        prompt.version,
        'failed',
        usage,
        latencyMs,
        error,
        recordedCalls,
      );
      throw toApiError(error);
    }
  }

  /** Marks the generation failed or cancelled and records tokens that were spent anyway. */
  async function finish(
    generationId: string,
    ctx: AiRunContext,
    purposeId: PurposeId,
    promptVersion: string,
    status: 'failed',
    usage: TokenUsage | undefined,
    latencyMs: number,
    error: unknown,
    recordedCalls = 0,
  ): Promise<void> {
    const cancelled = error instanceof AiCancelledError;
    const code = cancelled ? 'cancelled' : toApiError(error).code;
    try {
      await deps.scope.withAgency(ctx.agencyId, async (tx) => {
        if (usage && ctx.actor.kind === 'agency') {
          const already = await tx.llmCall.count({ where: { aiGenerationId: generationId } });
          if (already <= recordedCalls) {
            await recordLlmCall(tx, {
              agencyId: ctx.agencyId,
              aiGenerationId: generationId,
              requestedById: ctx.actor.userId,
              positionId: ctx.positionId ?? null,
              purpose: purposeId,
              model: PURPOSES[purposeId].model,
              promptVersion,
              usage,
              latencyMs,
            });
          }
        }
        await tx.aiGeneration.update({
          where: { id: generationId },
          data: { status: cancelled ? 'cancelled' : status, error: code },
        });
      });
    } catch (loggingError) {
      log('ai.finish_failed', { generationId, error: (loggingError as Error).message });
    }
  }

  return { run };
}

export type Gateway = ReturnType<typeof createGateway>;
