-- Phase 2 performance indexes (load test: 50k requests / 200k attachments).
-- Queue: WHERE "roleId" IN (...) AND status = 'ACTIVE' ORDER BY "activatedAt".
CREATE INDEX "request_step_instances_roleId_status_activatedAt_idx" ON "request_step_instances"("roleId", "status", "activatedAt");
-- Detail and exports: current attachments of a request.
CREATE INDEX "attachments_requestId_isCurrent_idx" ON "attachments"("requestId", "isCurrent");
-- Visibility rule "requests I submitted from the web".
CREATE INDEX "requests_submittedByUserId_idx" ON "requests"("submittedByUserId") WHERE "submittedByUserId" IS NOT NULL;
-- Substring search on the request number (ILIKE '%...%'). Skipped silently when pg_trgm is not installed.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS "requests_number_trgm_idx" ON "requests" USING gin ("number" gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available, skipping requests_number_trgm_idx: %', SQLERRM;
END $$;
