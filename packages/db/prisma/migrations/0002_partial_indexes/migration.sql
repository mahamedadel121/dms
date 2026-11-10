CREATE UNIQUE INDEX workflow_versions_one_active ON workflow_versions ("workflowId") WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX template_versions_one_active ON template_versions ("templateId") WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX signatures_one_active_user ON signatures ("userId") WHERE "isActive" AND "userId" IS NOT NULL;
CREATE UNIQUE INDEX signatures_one_active_submitter ON signatures ("submitterId") WHERE "isActive" AND "submitterId" IS NOT NULL;
CREATE UNIQUE INDEX assignments_one_open_per_driver ON driver_vehicle_assignments ("submitterId") WHERE "validTo" IS NULL;
CREATE UNIQUE INDEX treasuries_one_default ON treasuries ("isDefault") WHERE "isDefault";
CREATE INDEX jobs_due ON jobs (queue, priority DESC, "runAt") WHERE status = 'PENDING';
CREATE INDEX attachments_phash ON attachments (phash) WHERE phash IS NOT NULL AND "requestId" IS NOT NULL;
