export const JOB_TYPES = {
  SAP_POST: 'sap.post',
  PDF_FINALIZE: 'pdf.finalize',
  REPORT_EXPORT: 'report.export',
  SLA_SCAN: 'sla.scan',
  BOT_DRAFT_SWEEP: 'bot.draft_sweep',
  EXPORTS_SWEEP: 'exports.sweep',
  TELEGRAM_SEND: 'telegram.send',
  EMAIL_SEND: 'email.send',
} as const;
export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
export const JOB_QUEUES = ['default', 'telegram'] as const;
export type JobQueue = (typeof JOB_QUEUES)[number];
