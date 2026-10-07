-- pgvector for ProfileEmbedding (ADR-008). Requires a role allowed to create extensions.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('trial', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "AgencyRole" AS ENUM ('admin', 'lead', 'recruiter');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('owner', 'admin', 'support');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('draft', 'intake', 'sourcing', 'interviewing', 'offer', 'filled', 'on_hold', 'cancelled');

-- CreateEnum
CREATE TYPE "JdKind" AS ENUM ('original', 'structured', 'improved');

-- CreateEnum
CREATE TYPE "RequirementCategory" AS ENUM ('must_have', 'preferred', 'nice_to_have', 'disqualifying');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('linkedin', 'referral', 'direct_sourcing', 'database', 'networking', 'other');

-- CreateEnum
CREATE TYPE "PipelineState" AS ENUM ('sourced', 'reviewed', 'screened', 'contacting', 'no_response', 'not_interested', 'interested', 'qualified', 'resume_ready', 'candidate_approved', 'submitted', 'client_rejected', 'interviewing', 'rejected', 'on_hold', 'offer', 'declined', 'accepted', 'reneged', 'started', 'withdrawn', 'closed');

-- CreateEnum
CREATE TYPE "ScreeningClass" AS ENUM ('priority', 'potential', 'hold', 'not_qualified');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('linkedin', 'email', 'text', 'phone');

-- CreateEnum
CREATE TYPE "TouchStatus" AS ENUM ('planned', 'drafted', 'sent', 'skipped', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('queued', 'sending', 'sent', 'failed', 'captured', 'suppressed', 'bounced');

-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('strong', 'moderate', 'gap');

-- CreateEnum
CREATE TYPE "ApprovalSubject" AS ENUM ('jd', 'tailored_resume', 'candidate_profile');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'changes_requested');

-- CreateEnum
CREATE TYPE "PortalAudience" AS ENUM ('hiring_manager', 'candidate');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('structured_jd', 'improved_jd', 'intake_questions', 'success_profile', 'benchmark_report', 'search_criteria', 'candidate_profile', 'match_analysis', 'screening_draft', 'outreach_message', 'call_questions', 'qualification', 'tailored_resume', 'submission_report', 'interview_feedback', 'pattern_summary', 'similar_candidates', 'portfolio_fit');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('draft', 'approved', 'superseded', 'discarded');

-- CreateTable
CREATE TABLE "Agency" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AgencyStatus" NOT NULL DEFAULT 'trial',
    "region" TEXT NOT NULL DEFAULT 'us',
    "plan" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "branding" JSONB NOT NULL DEFAULT '{}',
    "aiMonthlyBudgetUsd" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "interactorSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "platformRole" "PlatformRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "AgencyRole" NOT NULL DEFAULT 'recruiter',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberInvite" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AgencyRole" NOT NULL DEFAULT 'recruiter',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAccessGrant" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "grantedById" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdminInvite" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "agencyId" UUID,
    "targetType" TEXT,
    "targetId" UUID,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "hiringManagerId" UUID,
    "status" "PositionStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "department" TEXT,
    "reportingLine" TEXT,
    "location" TEXT NOT NULL,
    "workArrangement" TEXT,
    "compMin" DECIMAL(12,2),
    "compMax" DECIMAL(12,2),
    "compCurrency" TEXT NOT NULL DEFAULT 'USD',
    "requiredExperience" TEXT,
    "requiredSkills" TEXT[],
    "hiringTimeline" TEXT,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "workAuthorization" TEXT,
    "matchingWeights" JSONB NOT NULL,
    "successProfileArtifactId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionTransition" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "fromStatus" "PositionStatus",
    "toStatus" "PositionStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDescription" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "kind" "JdKind" NOT NULL,
    "fileId" UUID,
    "text" TEXT,
    "artifactId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" "RequirementCategory" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeRecord" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "jdApprovalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "profileUrl" TEXT,
    "source" "CandidateSource" NOT NULL,
    "createdById" UUID NOT NULL,
    "profileArtifactId" UUID,
    "tags" TEXT[],
    "currentTitle" TEXT,
    "location" TEXT,
    "seniority" TEXT,
    "skills" TEXT[],
    "yearsExperience" INTEGER,
    "availability" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "doNotContactReason" TEXT,
    "doNotContactAt" TIMESTAMP(3),
    "mergedIntoId" UUID,
    "searchText" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateDocument" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "extractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "store" TEXT NOT NULL,
    "externalRef" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileBlob" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineEntry" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "state" "PipelineState" NOT NULL DEFAULT 'sourced',
    "screeningClass" "ScreeningClass",
    "manualRank" INTEGER,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineTransition" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "fromState" "PipelineState",
    "toState" "PipelineState" NOT NULL,
    "actorId" UUID NOT NULL,
    "reasonCode" TEXT,
    "reason" TEXT,
    "overrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedTransition" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "toState" "PipelineState" NOT NULL,
    "proposedBy" UUID NOT NULL,
    "reason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "accepted" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchAnalysis" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "successProfileVersionId" UUID NOT NULL,
    "weights" JSONB NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "overrideScore" INTEGER,
    "overrideReason" TEXT,
    "criterionOverrides" JSONB,
    "recruiterAssessment" TEXT,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningAssessment" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachTouch" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "touchNumber" INTEGER NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "status" "TouchStatus" NOT NULL DEFAULT 'planned',
    "dueAt" TIMESTAMP(3),
    "artifactId" UUID,
    "outboxMessageId" UUID,
    "sentAt" TIMESTAMP(3),
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "senderId" UUID,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" UUID,
    "transport" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachTemplate" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "ownerId" UUID,
    "clientId" UUID,
    "name" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationRecord" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailoredResume" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "blind" BOOLEAN NOT NULL DEFAULT false,
    "pdfFileId" UUID,
    "docxFileId" UUID,
    "approvalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TailoredResume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionReport" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "pdfFileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "reportVersionId" UUID NOT NULL,
    "reportPdfFileId" UUID NOT NULL,
    "tailoredResumeId" UUID NOT NULL,
    "resumeVersionId" UUID NOT NULL,
    "resumeFileId" UUID NOT NULL,
    "toContactId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submittedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "roundName" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "format" TEXT,
    "interviewers" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewFeedback" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "fromRole" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "technicalFit" "FeedbackRating",
    "leadershipFit" "FeedbackRating",
    "communication" "FeedbackRating",
    "culturalFit" "FeedbackRating",
    "industryExperience" "FeedbackRating",
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "milestones" JSONB NOT NULL,
    "counterofferRisk" TEXT,
    "resignationDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "outcome" TEXT,
    "outcomeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "subject" "ApprovalSubject" NOT NULL,
    "subjectId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comments" TEXT,
    "source" TEXT NOT NULL,
    "method" TEXT,
    "approverName" TEXT NOT NULL,
    "portalUserId" UUID,
    "recordedById" UUID,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "clientId" UUID,
    "action" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "method" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "audience" "PortalAudience" NOT NULL,
    "email" TEXT NOT NULL,
    "clientContactId" UUID,
    "candidateId" UUID,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLink" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "portalUserId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalShare" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "portalUserId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "approvedVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactVersion" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "origin" TEXT NOT NULL,
    "aiGenerationId" UUID,
    "parentVersionId" UUID,
    "factCheck" JSONB,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestedById" UUID,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputRefs" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "aiGenerationId" UUID,
    "requestedById" UUID,
    "positionId" UUID,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileEmbedding" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" UUID NOT NULL,
    "agencyId" UUID,
    "queue" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestedById" UUID,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_interactorSubject_key" ON "User"("interactorSubject");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_agencyId_userId_key" ON "Membership"("agencyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberInvite_tokenHash_key" ON "MemberInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "MemberInvite_agencyId_email_idx" ON "MemberInvite"("agencyId", "email");

-- CreateIndex
CREATE INDEX "SupportAccessGrant_agencyId_expiresAt_idx" ON "SupportAccessGrant"("agencyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdminInvite_tokenHash_key" ON "PlatformAdminInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformAdminInvite_email_idx" ON "PlatformAdminInvite"("email");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_agencyId_createdAt_idx" ON "PlatformAuditLog"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_adminId_createdAt_idx" ON "PlatformAuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_agencyId_name_idx" ON "Client"("agencyId", "name");

-- CreateIndex
CREATE INDEX "ClientContact_agencyId_clientId_idx" ON "ClientContact"("agencyId", "clientId");

-- CreateIndex
CREATE INDEX "Position_agencyId_status_idx" ON "Position"("agencyId", "status");

-- CreateIndex
CREATE INDEX "Position_agencyId_clientId_idx" ON "Position"("agencyId", "clientId");

-- CreateIndex
CREATE INDEX "Position_agencyId_ownerId_idx" ON "Position"("agencyId", "ownerId");

-- CreateIndex
CREATE INDEX "PositionTransition_agencyId_positionId_createdAt_idx" ON "PositionTransition"("agencyId", "positionId", "createdAt");

-- CreateIndex
CREATE INDEX "PositionTransition_agencyId_toStatus_createdAt_idx" ON "PositionTransition"("agencyId", "toStatus", "createdAt");

-- CreateIndex
CREATE INDEX "JobDescription_agencyId_positionId_kind_idx" ON "JobDescription"("agencyId", "positionId", "kind");

-- CreateIndex
CREATE INDEX "Requirement_agencyId_positionId_sortOrder_idx" ON "Requirement"("agencyId", "positionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeRecord_positionId_key" ON "IntakeRecord"("positionId");

-- CreateIndex
CREATE INDEX "IntakeRecord_agencyId_idx" ON "IntakeRecord"("agencyId");

-- CreateIndex
CREATE INDEX "Candidate_agencyId_email_idx" ON "Candidate"("agencyId", "email");

-- CreateIndex
CREATE INDEX "Candidate_agencyId_phone_idx" ON "Candidate"("agencyId", "phone");

-- CreateIndex
CREATE INDEX "Candidate_agencyId_location_idx" ON "Candidate"("agencyId", "location");

-- CreateIndex
CREATE INDEX "Candidate_agencyId_lastContactedAt_idx" ON "Candidate"("agencyId", "lastContactedAt");

-- CreateIndex
CREATE INDEX "Candidate_skills_idx" ON "Candidate" USING GIN ("skills");

-- CreateIndex
CREATE INDEX "Candidate_agencyId_profileUrl_idx" ON "Candidate"("agencyId", "profileUrl");

-- CreateIndex
CREATE INDEX "Candidate_agencyId_fullName_idx" ON "Candidate"("agencyId", "fullName");

-- CreateIndex
CREATE INDEX "CandidateDocument_agencyId_candidateId_idx" ON "CandidateDocument"("agencyId", "candidateId");

-- CreateIndex
CREATE INDEX "FileObject_agencyId_sha256_idx" ON "FileObject"("agencyId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "FileBlob_fileId_key" ON "FileBlob"("fileId");

-- CreateIndex
CREATE INDEX "FileBlob_agencyId_idx" ON "FileBlob"("agencyId");

-- CreateIndex
CREATE INDEX "PipelineEntry_agencyId_positionId_state_idx" ON "PipelineEntry"("agencyId", "positionId", "state");

-- CreateIndex
CREATE INDEX "PipelineEntry_agencyId_candidateId_idx" ON "PipelineEntry"("agencyId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineEntry_positionId_candidateId_key" ON "PipelineEntry"("positionId", "candidateId");

-- CreateIndex
CREATE INDEX "PipelineTransition_agencyId_entryId_createdAt_idx" ON "PipelineTransition"("agencyId", "entryId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineTransition_agencyId_toState_createdAt_idx" ON "PipelineTransition"("agencyId", "toState", "createdAt");

-- CreateIndex
CREATE INDEX "ProposedTransition_agencyId_entryId_resolvedAt_idx" ON "ProposedTransition"("agencyId", "entryId", "resolvedAt");

-- CreateIndex
CREATE INDEX "MatchAnalysis_agencyId_entryId_createdAt_idx" ON "MatchAnalysis"("agencyId", "entryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningAssessment_entryId_key" ON "ScreeningAssessment"("entryId");

-- CreateIndex
CREATE INDEX "ScreeningAssessment_agencyId_idx" ON "ScreeningAssessment"("agencyId");

-- CreateIndex
CREATE INDEX "OutreachTouch_agencyId_status_dueAt_idx" ON "OutreachTouch"("agencyId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachTouch_entryId_touchNumber_key" ON "OutreachTouch"("entryId", "touchNumber");

-- CreateIndex
CREATE INDEX "OutboxMessage_agencyId_status_createdAt_idx" ON "OutboxMessage"("agencyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_agencyId_address_key" ON "Suppression"("agencyId", "address");

-- CreateIndex
CREATE INDEX "OutreachTemplate_agencyId_ownerId_idx" ON "OutreachTemplate"("agencyId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "QualificationRecord_entryId_key" ON "QualificationRecord"("entryId");

-- CreateIndex
CREATE INDEX "QualificationRecord_agencyId_idx" ON "QualificationRecord"("agencyId");

-- CreateIndex
CREATE INDEX "TailoredResume_agencyId_entryId_idx" ON "TailoredResume"("agencyId", "entryId");

-- CreateIndex
CREATE INDEX "SubmissionReport_agencyId_entryId_idx" ON "SubmissionReport"("agencyId", "entryId");

-- CreateIndex
CREATE INDEX "Submission_agencyId_entryId_idx" ON "Submission"("agencyId", "entryId");

-- CreateIndex
CREATE INDEX "Interview_agencyId_entryId_idx" ON "Interview"("agencyId", "entryId");

-- CreateIndex
CREATE INDEX "Interview_agencyId_scheduledAt_idx" ON "Interview"("agencyId", "scheduledAt");

-- CreateIndex
CREATE INDEX "InterviewFeedback_agencyId_interviewId_idx" ON "InterviewFeedback"("agencyId", "interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_entryId_key" ON "Offer"("entryId");

-- CreateIndex
CREATE INDEX "Offer_agencyId_startDate_idx" ON "Offer"("agencyId", "startDate");

-- CreateIndex
CREATE INDEX "Approval_agencyId_subject_subjectId_idx" ON "Approval"("agencyId", "subject", "subjectId");

-- CreateIndex
CREATE INDEX "Consent_agencyId_candidateId_clientId_at_idx" ON "Consent"("agencyId", "candidateId", "clientId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_clientContactId_key" ON "PortalUser"("clientContactId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_candidateId_key" ON "PortalUser"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_agencyId_audience_email_key" ON "PortalUser"("agencyId", "audience", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLink_tokenHash_key" ON "MagicLink"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLink_agencyId_portalUserId_idx" ON "MagicLink"("agencyId", "portalUserId");

-- CreateIndex
CREATE INDEX "PortalShare_agencyId_portalUserId_revokedAt_idx" ON "PortalShare"("agencyId", "portalUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "Artifact_agencyId_subjectType_subjectId_kind_idx" ON "Artifact"("agencyId", "subjectType", "subjectId", "kind");

-- CreateIndex
CREATE INDEX "ArtifactVersion_agencyId_artifactId_idx" ON "ArtifactVersion"("agencyId", "artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactVersion_artifactId_version_key" ON "ArtifactVersion"("artifactId", "version");

-- CreateIndex
CREATE INDEX "AiGeneration_agencyId_purpose_createdAt_idx" ON "AiGeneration"("agencyId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_agencyId_createdAt_idx" ON "LlmCall"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_agencyId_positionId_idx" ON "LlmCall"("agencyId", "positionId");

-- CreateIndex
CREATE INDEX "LlmCall_aiGenerationId_idx" ON "LlmCall"("aiGenerationId");

-- CreateIndex
CREATE INDEX "ProfileEmbedding_agencyId_kind_idx" ON "ProfileEmbedding"("agencyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileEmbedding_kind_versionId_key" ON "ProfileEmbedding"("kind", "versionId");

-- CreateIndex
CREATE INDEX "Task_agencyId_ownerId_completedAt_dueAt_idx" ON "Task"("agencyId", "ownerId", "completedAt", "dueAt");

-- CreateIndex
CREATE INDEX "ActivityLog_agencyId_entityType_entityId_createdAt_idx" ON "ActivityLog"("agencyId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "JobRun_agencyId_createdAt_idx" ON "JobRun"("agencyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_queue_idempotencyKey_key" ON "JobRun"("queue", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionTransition" ADD CONSTRAINT "PositionTransition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRecord" ADD CONSTRAINT "IntakeRecord_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineTransition" ADD CONSTRAINT "PipelineTransition_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedTransition" ADD CONSTRAINT "ProposedTransition_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAnalysis" ADD CONSTRAINT "MatchAnalysis_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningAssessment" ADD CONSTRAINT "ScreeningAssessment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachTouch" ADD CONSTRAINT "OutreachTouch_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationRecord" ADD CONSTRAINT "QualificationRecord_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredResume" ADD CONSTRAINT "TailoredResume_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionReport" ADD CONSTRAINT "SubmissionReport_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalShare" ADD CONSTRAINT "PortalShare_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
