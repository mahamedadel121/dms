export type State =
  | 'UNLINKED'
  | 'IDLE'
  | 'CONFIRM_VEHICLE'
  | 'VCR_INPUT'
  | 'VCR_PENDING'
  | 'ODOMETER'
  | 'ODOMETER_CONFIRM'
  | 'CHOOSE_TYPE'
  | 'AMOUNT'
  | 'EXTRA_FIELD'
  | 'PHOTOS'
  | 'LINE_DONE'
  | 'SUMMARY'
  | 'EDIT_PICK'
  | 'EDIT_LINE'
  | 'EDIT_AMOUNT'
  | 'CORR_PICK'
  | 'CORR_AMOUNT'
  | 'CORR_PHOTOS';

/** States that belong to a request draft (the draft survives leaving them via the menu). */
export const DRAFT_STATES: State[] = [
  'CONFIRM_VEHICLE',
  'ODOMETER',
  'ODOMETER_CONFIRM',
  'CHOOSE_TYPE',
  'AMOUNT',
  'EXTRA_FIELD',
  'PHOTOS',
  'LINE_DONE',
  'SUMMARY',
  'EDIT_PICK',
  'EDIT_LINE',
  'EDIT_AMOUNT',
];

export interface DraftLine {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  amount: string;
  extraValues: Record<string, string>;
  attachmentIds: string[];
}

export interface BotDraft {
  requestTypeCode: string;
  startedAt: string;
  vehicleId: string;
  vehicleNumber: string;
  costCenterCode: string;
  odometer?: number;
  odometerWarning?: string;
  lines: DraftLine[];
  current?: Partial<DraftLine> & { extraIndex?: number };
  editingIndex?: number;
  /** State to return to when the driver comes back from the menu (WP3 addition, JSON only). */
  resumeState?: State;
}

export interface CorrectionCtx {
  requestId: string;
  correctionRequestId: string;
  newAttachmentIds: string[];
  newAmount?: string;
  /** WP3 addition (JSON only): decides which prompts are needed. */
  fixType?: string;
}

export type InlineBtn = { text: string; data: string };
export type ReplyBtn = { text: string } | { text: string; contact: true };

export interface SayOptions {
  /** inline keyboard rows (callback buttons) */
  inline?: InlineBtn[][];
  /** reply keyboard rows; 'remove' removes it */
  reply?: ReplyBtn[][] | 'remove';
  html?: boolean;
}

export interface Out {
  say(text: string, o?: SayOptions): Promise<void>;
  /** acknowledge a callback query (no-op for non-callback updates) */
  ack(text?: string): Promise<void>;
}

export type Input =
  | { kind: 'text'; text: string }
  | { kind: 'cb'; data: string }
  | { kind: 'contact'; phone: string; userId?: number }
  | { kind: 'other' }
  | { kind: 'file'; fileId: string; uniqueId?: string; name?: string; mime?: string; isPhoto: boolean };
