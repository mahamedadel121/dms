// Contract file owned by WP4: documents / PDF, SAP monitor, template preview.
import { z } from 'zod';
import { templateConfigSchema } from '../schemas';

/** GET /requests/:id/pdf/verify */
export const pdfVerifyResponseSchema = z.object({
  ok: z.boolean(),
  /** sha256 stored when the final PDF was generated; null when no final document exists yet */
  sha256: z.string().nullable(),
  /** sha256 recomputed from the stored file now */
  actualSha256: z.string().nullable().optional(),
  locked: z.boolean().optional(),
});
export type PdfVerifyResponse = z.infer<typeof pdfVerifyResponseSchema>;

/** POST /template-versions/:id/preview?format=html|pdf */
export const templatePreviewBodySchema = z.object({
  config: templateConfigSchema.optional(),
  requestId: z.string().optional(),
});
export type TemplatePreviewBody = z.infer<typeof templatePreviewBodySchema>;
export const templatePreviewFormatSchema = z.enum(['html', 'pdf']).default('html');
/** format=html -> text/html body; format=pdf -> application/pdf body. No JSON wrapper. */

export const SAP_POSTING_STATUSES = ['PENDING', 'POSTING', 'POSTED', 'FAILED'] as const;
export type SapPostingStatusValue = (typeof SAP_POSTING_STATUSES)[number];

/** GET /sap/postings?status&from&to&number&page&pageSize */
export const sapPostingsQuerySchema = z.object({
  status: z.enum(SAP_POSTING_STATUSES).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  number: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type SapPostingsQuery = z.infer<typeof sapPostingsQuerySchema>;

export interface SapPostingListItem {
  id: string;
  requestId: string;
  requestNumber: string;
  status: SapPostingStatusValue;
  adapter: string;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  sapDocNumber: string | null;
  sapFiscalYear: string | null;
  postedAt: string | null;
  totalFinal: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface SapPostingList {
  items: SapPostingListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SapPostingAttemptDto {
  id: string;
  attemptNo: number;
  trigger: 'AUTO' | 'MANUAL';
  triggeredById: string | null;
  startedAt: string;
  finishedAt: string | null;
  success: boolean | null;
  error: string | null;
  response: unknown;
}

/** GET /sap/postings/:id */
export interface SapPostingDetail extends SapPostingListItem {
  idempotencyKey: string;
  sapCompanyCode: string | null;
  exportFileKey: string | null;
  /** JournalEntryDoc built at payment time */
  payload: unknown;
  attemptLogs: SapPostingAttemptDto[];
}

/** POST /sap/postings/:id/retry -> the refreshed posting (status PENDING until the worker runs it) */
export type SapRetryResponse = SapPostingListItem;

export const sapRetryBodySchema = z.object({ force: z.boolean().optional() }).default({});
export type SapRetryBody = z.infer<typeof sapRetryBodySchema>;
