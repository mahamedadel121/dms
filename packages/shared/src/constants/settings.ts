export interface CompanyProfile {
  nameAr: string;
  nameEn: string;
  logoKey: string | null;
}
export interface SapCashJournalConfig {
  /** cash journal number (CAJO_NUMBER) used when a treasury has no mapping */
  defaultNumber: string;
  /** Treasury.code -> cash journal number */
  numberByTreasuryCode: Record<string, string>;
  /** FBCJ business transaction for expense payments (TRANSACT_NUMBER) */
  businessTransaction: string;
}
export interface NotificationChannelConfig {
  enabled: boolean;
  /** notification `type` values to deliver on this channel; '*' = all */
  types: string[];
}
export const DEFAULT_OUTBOUND_NOTIFICATION_TYPES = ['REQ_AT_STEP', 'SLA_REMINDER', 'CORRECTION_RETURNED', 'STEP_SENT_BACK', 'SAP_FAILED', 'VEHICLE_CHANGE_REQUESTED'];

export interface SapConfig {
  companyCode: string;
  documentType: string;
  currency: string;
  debitPostingKey: string;
  creditPostingKey: string;
  aggregateSameGlCostCenter: boolean;
  documentDateMode: 'PAYMENT_DATE' | 'SUBMISSION_DATE';
  cashJournal: SapCashJournalConfig;
}

export interface SettingTypes {
  'workflow.lockTimeoutMinutes': number;
  'workflow.requireSignatureToApprove': boolean;
  'workflow.slaReminderIntervalHours': number;
  'bot.draftExpiryHours': number;
  'bot.draftReminderHours': number;
  'expense.blockStoppedVehicle': boolean;
  'expense.odometerMaxJumpKm': number;
  'expense.vehicleChangeRoleCode': string;
  'media.maxFileSizeMb': number;
  'media.nearDuplicateDistance': number;
  'files.signedUrlTtlSec': number;
  'reports.zipFolderPattern': string;
  'reports.exportTtlHours': number;
  'company.profile': CompanyProfile;
  'sap.config': SapConfig;
  'notifications.email': NotificationChannelConfig;
  'notifications.telegramUsers': NotificationChannelConfig;
}
export type SettingKey = keyof SettingTypes;

export const SETTING_DEFAULTS: SettingTypes = {
  'workflow.lockTimeoutMinutes': 15,
  'workflow.requireSignatureToApprove': true,
  'workflow.slaReminderIntervalHours': 4,
  'bot.draftExpiryHours': 24,
  'bot.draftReminderHours': 6,
  'expense.blockStoppedVehicle': true,
  'expense.odometerMaxJumpKm': 3000,
  'expense.vehicleChangeRoleCode': 'SHIPPING_OFFICER',
  'media.maxFileSizeMb': 15,
  'media.nearDuplicateDistance': 6,
  'files.signedUrlTtlSec': 300,
  'reports.zipFolderPattern': '{expenseType}/{requestNumber}',
  'reports.exportTtlHours': 72,
  'company.profile': { nameAr: 'الشركة', nameEn: 'Company', logoKey: null },
  'sap.config': {
    companyCode: '1000',
    documentType: 'SA',
    currency: 'EGP',
    debitPostingKey: '40',
    creditPostingKey: '50',
    aggregateSameGlCostCenter: false,
    documentDateMode: 'PAYMENT_DATE',
    cashJournal: { defaultNumber: '0001', numberByTreasuryCode: {}, businessTransaction: '' },
  },
  'notifications.email': { enabled: false, types: [...DEFAULT_OUTBOUND_NOTIFICATION_TYPES] },
  'notifications.telegramUsers': { enabled: false, types: [...DEFAULT_OUTBOUND_NOTIFICATION_TYPES] },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];
