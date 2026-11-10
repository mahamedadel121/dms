-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('ROLE', 'DYNAMIC_CATEGORY_ROLES');

-- CreateEnum
CREATE TYPE "StepKind" AS ENUM ('APPROVAL', 'PAYMENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('IN_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepInstanceStatus" AS ENUM ('PENDING', 'ACTIVE', 'AWAITING_CORRECTION', 'APPROVED', 'NOT_APPLICABLE', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubmissionChannel" AS ENUM ('TELEGRAM', 'WEB');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SUBMITTER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LineEditSource" AS ENUM ('APPROVER', 'SUBMITTER_CORRECTION');

-- CreateEnum
CREATE TYPE "CorrectionFixType" AS ENUM ('REUPLOAD', 'AMOUNT', 'BOTH');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DuplicateKind" AS ENUM ('EXACT', 'NEAR');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('FINAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'TELEGRAM', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('EXCEL', 'ZIP_IMAGES', 'PDF_BUNDLE');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'STOPPED', 'UNDER_MAINTENANCE');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('MANUAL', 'CHANGE_REQUEST', 'IMPORT');

-- CreateEnum
CREATE TYPE "VehicleChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SapPostingStatus" AS ENUM ('PENDING', 'POSTING', 'POSTED', 'FAILED');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fullNameEn" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "departmentId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "telegramUserId" BIGINT,
    "telegramChatId" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "description" TEXT,
    "scopeDepartmentId" TEXT,
    "isSuperUser" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "code" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionCode")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "delegations" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "roleId" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "previousTokenHash" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "submitterId" TEXT,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "width" INTEGER,
    "height" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "submitters" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DRIVER',
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationalId" TEXT,
    "phone" TEXT NOT NULL,
    "telegramUserId" BIGINT,
    "telegramChatId" BIGINT,
    "telegramUsername" TEXT,
    "telegramLinkedAt" TIMESTAMPTZ(3),
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "submitters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "departmentId" TEXT,
    "numberPrefix" TEXT NOT NULL,
    "moduleKey" TEXT,
    "headerFields" JSONB NOT NULL DEFAULT '[]',
    "hasLines" BOOLEAN NOT NULL DEFAULT true,
    "channels" TEXT[] DEFAULT ARRAY['TELEGRAM']::TEXT[],
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_categories" (
    "id" TEXT NOT NULL,
    "requestTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "extraFields" JSONB NOT NULL DEFAULT '[]',
    "quantityFieldKey" TEXT,
    "unitPriceMin" DECIMAL(14,2),
    "unitPriceMax" DECIMAL(14,2),
    "minAttachments" INTEGER NOT NULL DEFAULT 1,
    "maxAttachments" INTEGER NOT NULL DEFAULT 10,
    "allowedMimeTypes" TEXT[] DEFAULT ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::TEXT[],
    "maxAmountWarning" DECIMAL(14,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "line_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_category_approval_roles" (
    "lineCategoryId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "line_category_approval_roles_pkey" PRIMARY KEY ("lineCategoryId","roleId")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "requestTypeId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT,
    "publishedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "stepType" "StepType" NOT NULL DEFAULT 'ROLE',
    "kind" "StepKind" NOT NULL DEFAULT 'APPROVAL',
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "roleId" TEXT,
    "parallelGroup" TEXT,
    "condition" JSONB NOT NULL DEFAULT '{"type":"ALWAYS"}',
    "allowedActions" TEXT[] DEFAULT ARRAY['APPROVE', 'REQUEST_CORRECTION', 'SEND_BACK', 'REJECT']::TEXT[],
    "canEditAmounts" BOOLEAN NOT NULL DEFAULT false,
    "canReclassify" BOOLEAN NOT NULL DEFAULT false,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "slaHours" INTEGER,
    "showInSignatures" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "requestTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "layoutKey" TEXT NOT NULL DEFAULT 'expense-sheet',
    "config" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "publishedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_number_counters" (
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "request_number_counters_pkey" PRIMARY KEY ("prefix","year")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "number" VARCHAR(16) NOT NULL,
    "requestTypeId" TEXT NOT NULL,
    "departmentId" TEXT,
    "workflowVersionId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "channel" "SubmissionChannel" NOT NULL,
    "submitterId" TEXT,
    "submittedByUserId" TEXT,
    "submitterSignatureId" TEXT,
    "clientKey" TEXT,
    "headerValues" JSONB NOT NULL DEFAULT '{}',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "totalOriginal" DECIMAL(14,2) NOT NULL,
    "totalFinal" DECIMAL(14,2) NOT NULL,
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "hasDuplicateWarning" BOOLEAN NOT NULL DEFAULT false,
    "currentStageIndex" INTEGER,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "paidById" TEXT,
    "rejectedAt" TIMESTAMPTZ(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "rowVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_lines" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "originalCategoryId" TEXT NOT NULL,
    "categoryNameAr" TEXT NOT NULL,
    "categoryNameEn" TEXT NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "extraValues" JSONB NOT NULL DEFAULT '{}',
    "originalExtraValues" JSONB NOT NULL DEFAULT '{}',
    "quantity" DECIMAL(14,3),
    "unitPrice" DECIMAL(14,2),
    "lineDate" DATE,
    "note" TEXT,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_edits" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "stepInstanceId" TEXT,
    "correctionRequestId" TEXT,
    "source" "LineEditSource" NOT NULL,
    "editedByUserId" TEXT,
    "editedBySubmitterId" TEXT,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "oldLabel" TEXT,
    "newLabel" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "lineId" TEXT,
    "botSessionId" TEXT,
    "storageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "phash" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "originalName" TEXT,
    "telegramFileUniqueId" TEXT,
    "uploadedBySubmitterId" TEXT,
    "uploadedByUserId" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "supersededAt" TIMESTAMPTZ(3),
    "correctionRequestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_duplicates" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "duplicateOfId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "otherRequestId" TEXT NOT NULL,
    "kind" "DuplicateKind" NOT NULL,
    "distance" INTEGER NOT NULL DEFAULT 0,
    "dismissedAt" TIMESTAMPTZ(3),
    "dismissedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_duplicates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_step_instances" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "workflowStepId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "stageIndex" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "parallelGroup" TEXT,
    "kind" "StepKind" NOT NULL DEFAULT 'APPROVAL',
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "roleNameAr" TEXT NOT NULL,
    "roleNameEn" TEXT NOT NULL,
    "status" "StepInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "actedAt" TIMESTAMPTZ(3),
    "actedById" TEXT,
    "onBehalfOfUserId" TEXT,
    "delegationId" TEXT,
    "signatureId" TEXT,
    "comment" TEXT,
    "checklist" JSONB,
    "correctionRequestedById" TEXT,
    "returnedAt" TIMESTAMPTZ(3),
    "lastReminderAt" TIMESTAMPTZ(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "request_step_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_requests" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepInstanceId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "lineId" TEXT,
    "attachmentId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "fixType" "CorrectionFixType" NOT NULL DEFAULT 'REUPLOAD',
    "comment" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMPTZ(3),
    "resolution" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorSubmitterId" TEXT,
    "stepInstanceId" TEXT,
    "lineId" TEXT,
    "attachmentId" TEXT,
    "comment" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_locks" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "request_locks_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "request_documents" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "kind" "DocumentKind" NOT NULL DEFAULT 'FINAL',
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT true,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipientUserId" TEXT,
    "recipientSubmitterId" TEXT,
    "type" TEXT NOT NULL,
    "requestId" TEXT,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT,
    "data" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL DEFAULT 'default',
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "lockedAt" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "result" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "kind" "ExportKind" NOT NULL,
    "filters" JSONB NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "fileName" TEXT,
    "sizeBytes" INTEGER,
    "rowCount" INTEGER,
    "error" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_sessions" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "submitterId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'UNLINKED',
    "draft" JSONB,
    "correction" JSONB,
    "draftStartedAt" TIMESTAMPTZ(3),
    "draftUpdatedAt" TIMESTAMPTZ(3),
    "draftExpiresAt" TIMESTAMPTZ(3),
    "draftReminderSentAt" TIMESTAMPTZ(3),
    "lastUpdateId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_accounts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gl_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_type_configs" (
    "lineCategoryId" TEXT NOT NULL,
    "glAccountId" TEXT NOT NULL,

    CONSTRAINT "expense_type_configs_pkey" PRIMARY KEY ("lineCategoryId")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "plateNumber" TEXT,
    "vehicleTypeId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "lastOdometer" INTEGER,
    "lastOdometerAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_vehicle_assignments" (
    "id" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMPTZ(3),
    "source" "AssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "vehicleChangeRequestId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_change_requests" (
    "id" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "fromVehicleId" TEXT,
    "toVehicleId" TEXT,
    "requestedVehicleText" TEXT,
    "status" "VehicleChangeStatus" NOT NULL DEFAULT 'PENDING',
    "assignedRoleId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionComment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasuries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cashGlNumber" TEXT NOT NULL,
    "companyCode" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "treasuries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_requests" (
    "requestId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "plateNumber" TEXT,
    "vehicleTypeId" TEXT,
    "vehicleTypeName" TEXT,
    "costCenterId" TEXT NOT NULL,
    "costCenterCode" TEXT NOT NULL,
    "odometer" INTEGER NOT NULL,
    "previousOdometer" INTEGER,
    "odometerWarning" TEXT,
    "treasuryId" TEXT,
    "sapDocNumber" TEXT,
    "sapFiscalYear" TEXT,
    "sapPostedAt" TIMESTAMPTZ(3),

    CONSTRAINT "expense_requests_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "expense_lines" (
    "lineId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "glNumber" TEXT NOT NULL,
    "glName" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "costCenterCode" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,

    CONSTRAINT "expense_lines_pkey" PRIMARY KEY ("lineId")
);

-- CreateTable
CREATE TABLE "sap_postings" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "SapPostingStatus" NOT NULL DEFAULT 'PENDING',
    "adapter" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMPTZ(3),
    "sapDocNumber" TEXT,
    "sapFiscalYear" TEXT,
    "sapCompanyCode" TEXT,
    "postedAt" TIMESTAMPTZ(3),
    "exportFileKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sap_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sap_posting_attempts" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'AUTO',
    "triggeredById" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "success" BOOLEAN,
    "error" TEXT,
    "response" JSONB,

    CONSTRAINT "sap_posting_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramUserId_key" ON "users"("telegramUserId");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE INDEX "delegations_toUserId_startsAt_endsAt_idx" ON "delegations"("toUserId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "delegations_fromUserId_idx" ON "delegations"("fromUserId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_storageKey_key" ON "signatures"("storageKey");

-- CreateIndex
CREATE INDEX "signatures_userId_isActive_idx" ON "signatures"("userId", "isActive");

-- CreateIndex
CREATE INDEX "signatures_submitterId_isActive_idx" ON "signatures"("submitterId", "isActive");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "submitters_code_key" ON "submitters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "submitters_phone_key" ON "submitters"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "submitters_telegramUserId_key" ON "submitters"("telegramUserId");

-- CreateIndex
CREATE INDEX "submitters_kind_isActive_idx" ON "submitters"("kind", "isActive");

-- CreateIndex
CREATE INDEX "submitters_fullName_idx" ON "submitters"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "request_types_code_key" ON "request_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "request_types_numberPrefix_key" ON "request_types"("numberPrefix");

-- CreateIndex
CREATE INDEX "line_categories_requestTypeId_isActive_sortOrder_idx" ON "line_categories"("requestTypeId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "line_categories_requestTypeId_code_key" ON "line_categories"("requestTypeId", "code");

-- CreateIndex
CREATE INDEX "line_category_approval_roles_roleId_idx" ON "line_category_approval_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_requestTypeId_key" ON "workflows"("requestTypeId");

-- CreateIndex
CREATE INDEX "workflow_versions_workflowId_status_idx" ON "workflow_versions"("workflowId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_workflowId_version_key" ON "workflow_versions"("workflowId", "version");

-- CreateIndex
CREATE INDEX "workflow_steps_workflowVersionId_sortOrder_idx" ON "workflow_steps"("workflowVersionId", "sortOrder");

-- CreateIndex
CREATE INDEX "workflow_steps_roleId_idx" ON "workflow_steps"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflowVersionId_key_key" ON "workflow_steps"("workflowVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "templates_requestTypeId_code_key" ON "templates"("requestTypeId", "code");

-- CreateIndex
CREATE INDEX "template_versions_templateId_status_idx" ON "template_versions"("templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "template_versions_templateId_version_key" ON "template_versions"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "requests_number_key" ON "requests"("number");

-- CreateIndex
CREATE UNIQUE INDEX "requests_clientKey_key" ON "requests"("clientKey");

-- CreateIndex
CREATE INDEX "requests_status_submittedAt_idx" ON "requests"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "requests_requestTypeId_status_idx" ON "requests"("requestTypeId", "status");

-- CreateIndex
CREATE INDEX "requests_departmentId_status_idx" ON "requests"("departmentId", "status");

-- CreateIndex
CREATE INDEX "requests_submitterId_submittedAt_idx" ON "requests"("submitterId", "submittedAt");

-- CreateIndex
CREATE INDEX "requests_submittedAt_idx" ON "requests"("submittedAt");

-- CreateIndex
CREATE INDEX "requests_paidAt_idx" ON "requests"("paidAt");

-- CreateIndex
CREATE INDEX "requests_workflowVersionId_idx" ON "requests"("workflowVersionId");

-- CreateIndex
CREATE INDEX "request_lines_categoryId_idx" ON "request_lines"("categoryId");

-- CreateIndex
CREATE INDEX "request_lines_lineDate_idx" ON "request_lines"("lineDate");

-- CreateIndex
CREATE UNIQUE INDEX "request_lines_requestId_lineNo_key" ON "request_lines"("requestId", "lineNo");

-- CreateIndex
CREATE INDEX "line_edits_requestId_createdAt_idx" ON "line_edits"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "line_edits_lineId_idx" ON "line_edits"("lineId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_requestId_idx" ON "attachments"("requestId");

-- CreateIndex
CREATE INDEX "attachments_lineId_isCurrent_idx" ON "attachments"("lineId", "isCurrent");

-- CreateIndex
CREATE INDEX "attachments_botSessionId_idx" ON "attachments"("botSessionId");

-- CreateIndex
CREATE INDEX "attachments_sha256_idx" ON "attachments"("sha256");

-- CreateIndex
CREATE INDEX "attachments_createdAt_idx" ON "attachments"("createdAt");

-- CreateIndex
CREATE INDEX "attachment_duplicates_requestId_idx" ON "attachment_duplicates"("requestId");

-- CreateIndex
CREATE INDEX "attachment_duplicates_otherRequestId_idx" ON "attachment_duplicates"("otherRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_duplicates_attachmentId_duplicateOfId_key" ON "attachment_duplicates"("attachmentId", "duplicateOfId");

-- CreateIndex
CREATE INDEX "request_step_instances_status_roleId_idx" ON "request_step_instances"("status", "roleId");

-- CreateIndex
CREATE INDEX "request_step_instances_requestId_stageIndex_idx" ON "request_step_instances"("requestId", "stageIndex");

-- CreateIndex
CREATE INDEX "request_step_instances_status_dueAt_idx" ON "request_step_instances"("status", "dueAt");

-- CreateIndex
CREATE INDEX "request_step_instances_actedById_idx" ON "request_step_instances"("actedById");

-- CreateIndex
CREATE UNIQUE INDEX "request_step_instances_requestId_stepKey_key" ON "request_step_instances"("requestId", "stepKey");

-- CreateIndex
CREATE INDEX "correction_requests_requestId_status_idx" ON "correction_requests"("requestId", "status");

-- CreateIndex
CREATE INDEX "correction_requests_stepInstanceId_status_idx" ON "correction_requests"("stepInstanceId", "status");

-- CreateIndex
CREATE INDEX "request_events_requestId_createdAt_idx" ON "request_events"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "request_events_type_createdAt_idx" ON "request_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "request_locks_expiresAt_idx" ON "request_locks"("expiresAt");

-- CreateIndex
CREATE INDEX "request_locks_userId_idx" ON "request_locks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "request_documents_storageKey_key" ON "request_documents"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "request_documents_requestId_kind_key" ON "request_documents"("requestId", "kind");

-- CreateIndex
CREATE INDEX "notifications_recipientUserId_channel_readAt_createdAt_idx" ON "notifications"("recipientUserId", "channel", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientSubmitterId_createdAt_idx" ON "notifications"("recipientSubmitterId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_status_channel_idx" ON "notifications"("status", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupeKey_key" ON "jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "jobs_queue_status_runAt_idx" ON "jobs"("queue", "status", "runAt");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- CreateIndex
CREATE INDEX "jobs_status_lockedAt_idx" ON "jobs"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "report_exports_requestedById_createdAt_idx" ON "report_exports"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "report_exports_status_idx" ON "report_exports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bot_sessions_telegramUserId_key" ON "bot_sessions"("telegramUserId");

-- CreateIndex
CREATE INDEX "bot_sessions_submitterId_idx" ON "bot_sessions"("submitterId");

-- CreateIndex
CREATE INDEX "bot_sessions_draftExpiresAt_idx" ON "bot_sessions"("draftExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_code_key" ON "vehicle_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "gl_accounts_number_key" ON "gl_accounts"("number");

-- CreateIndex
CREATE INDEX "expense_type_configs_glAccountId_idx" ON "expense_type_configs"("glAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_number_key" ON "vehicles"("number");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "vehicles_costCenterId_idx" ON "vehicles"("costCenterId");

-- CreateIndex
CREATE INDEX "vehicles_vehicleTypeId_idx" ON "vehicles"("vehicleTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_vehicle_assignments_vehicleChangeRequestId_key" ON "driver_vehicle_assignments"("vehicleChangeRequestId");

-- CreateIndex
CREATE INDEX "driver_vehicle_assignments_submitterId_validTo_idx" ON "driver_vehicle_assignments"("submitterId", "validTo");

-- CreateIndex
CREATE INDEX "driver_vehicle_assignments_vehicleId_validTo_idx" ON "driver_vehicle_assignments"("vehicleId", "validTo");

-- CreateIndex
CREATE INDEX "vehicle_change_requests_status_createdAt_idx" ON "vehicle_change_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "vehicle_change_requests_submitterId_status_idx" ON "vehicle_change_requests"("submitterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "treasuries_code_key" ON "treasuries"("code");

-- CreateIndex
CREATE INDEX "expense_requests_vehicleId_idx" ON "expense_requests"("vehicleId");

-- CreateIndex
CREATE INDEX "expense_requests_costCenterId_idx" ON "expense_requests"("costCenterId");

-- CreateIndex
CREATE INDEX "expense_requests_vehicleTypeId_idx" ON "expense_requests"("vehicleTypeId");

-- CreateIndex
CREATE INDEX "expense_lines_requestId_idx" ON "expense_lines"("requestId");

-- CreateIndex
CREATE INDEX "expense_lines_glAccountId_idx" ON "expense_lines"("glAccountId");

-- CreateIndex
CREATE INDEX "expense_lines_costCenterId_idx" ON "expense_lines"("costCenterId");

-- CreateIndex
CREATE INDEX "expense_lines_vehicleId_idx" ON "expense_lines"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "sap_postings_requestId_key" ON "sap_postings"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "sap_postings_idempotencyKey_key" ON "sap_postings"("idempotencyKey");

-- CreateIndex
CREATE INDEX "sap_postings_status_updatedAt_idx" ON "sap_postings"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sap_posting_attempts_postingId_attemptNo_key" ON "sap_posting_attempts"("postingId", "attemptNo");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_scopeDepartmentId_fkey" FOREIGN KEY ("scopeDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "submitters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submitters" ADD CONSTRAINT "submitters_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_types" ADD CONSTRAINT "request_types_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_categories" ADD CONSTRAINT "line_categories_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_category_approval_roles" ADD CONSTRAINT "line_category_approval_roles_lineCategoryId_fkey" FOREIGN KEY ("lineCategoryId") REFERENCES "line_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_category_approval_roles" ADD CONSTRAINT "line_category_approval_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "submitters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_submitterSignatureId_fkey" FOREIGN KEY ("submitterSignatureId") REFERENCES "signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "line_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_originalCategoryId_fkey" FOREIGN KEY ("originalCategoryId") REFERENCES "line_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_edits" ADD CONSTRAINT "line_edits_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_edits" ADD CONSTRAINT "line_edits_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_edits" ADD CONSTRAINT "line_edits_stepInstanceId_fkey" FOREIGN KEY ("stepInstanceId") REFERENCES "request_step_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_edits" ADD CONSTRAINT "line_edits_correctionRequestId_fkey" FOREIGN KEY ("correctionRequestId") REFERENCES "correction_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_edits" ADD CONSTRAINT "line_edits_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "request_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_botSessionId_fkey" FOREIGN KEY ("botSessionId") REFERENCES "bot_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedBySubmitterId_fkey" FOREIGN KEY ("uploadedBySubmitterId") REFERENCES "submitters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_correctionRequestId_fkey" FOREIGN KEY ("correctionRequestId") REFERENCES "correction_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_duplicates" ADD CONSTRAINT "attachment_duplicates_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_duplicates" ADD CONSTRAINT "attachment_duplicates_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_duplicates" ADD CONSTRAINT "attachment_duplicates_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_duplicates" ADD CONSTRAINT "attachment_duplicates_otherRequestId_fkey" FOREIGN KEY ("otherRequestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_step_instances" ADD CONSTRAINT "request_step_instances_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_step_instances" ADD CONSTRAINT "request_step_instances_workflowStepId_fkey" FOREIGN KEY ("workflowStepId") REFERENCES "workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_step_instances" ADD CONSTRAINT "request_step_instances_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_step_instances" ADD CONSTRAINT "request_step_instances_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_step_instances" ADD CONSTRAINT "request_step_instances_onBehalfOfUserId_fkey" FOREIGN KEY ("onBehalfOfUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_step_instances" ADD CONSTRAINT "request_step_instances_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "delegations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_step_instances" ADD CONSTRAINT "request_step_instances_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_stepInstanceId_fkey" FOREIGN KEY ("stepInstanceId") REFERENCES "request_step_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "request_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_actorSubmitterId_fkey" FOREIGN KEY ("actorSubmitterId") REFERENCES "submitters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_stepInstanceId_fkey" FOREIGN KEY ("stepInstanceId") REFERENCES "request_step_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "request_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_locks" ADD CONSTRAINT "request_locks_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_locks" ADD CONSTRAINT "request_locks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientSubmitterId_fkey" FOREIGN KEY ("recipientSubmitterId") REFERENCES "submitters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "submitters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_type_configs" ADD CONSTRAINT "expense_type_configs_lineCategoryId_fkey" FOREIGN KEY ("lineCategoryId") REFERENCES "line_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_type_configs" ADD CONSTRAINT "expense_type_configs_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "submitters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_vehicleChangeRequestId_fkey" FOREIGN KEY ("vehicleChangeRequestId") REFERENCES "vehicle_change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "submitters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_fromVehicleId_fkey" FOREIGN KEY ("fromVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_toVehicleId_fkey" FOREIGN KEY ("toVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "treasuries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "gl_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sap_postings" ADD CONSTRAINT "sap_postings_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sap_posting_attempts" ADD CONSTRAINT "sap_posting_attempts_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "sap_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

