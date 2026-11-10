export interface CompanyProfile {
  nameAr: string;
  nameEn: string;
  logoKey: string | null;
}
export interface SapConfig {
  companyCode: string;
  documentType: string;
  currency: string;
  debitPostingKey: string;
  creditPostingKey: string;
  aggregateSameGlCostCenter: boolean;
  documentDateMode: 'PAYMENT_DATE' | 'SUBMISSION_DATE';
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
  },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];
