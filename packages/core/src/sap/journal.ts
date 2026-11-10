import { cairoDateString, dec, sumDecimals, toFixed2 } from '@dms/shared';
import type { Db } from '../common';
import { getSetting } from '../config';
import { DomainError } from '../errors';
import type { JournalEntryDoc } from './types';

type Item = JournalEntryDoc['items'][number];

/**
 * One debit per line with amount > 0 (ExpenseLine snapshot: GL + cost center), optionally aggregated by
 * GL + cost center, and one credit to the treasury cash GL for the total. Must balance.
 */
export async function buildJournalEntry(db: Db, requestId: string): Promise<JournalEntryDoc> {
  const req = await db.request.findUnique({
    where: { id: requestId },
    include: {
      submitter: true,
      expense: { include: { treasury: true } },
      lines: { include: { expense: true }, orderBy: { lineNo: 'asc' } },
    },
  });
  if (!req) throw new DomainError('NOT_FOUND', 'Request not found');
  if (!req.expense) throw new DomainError('INVALID_STATE', 'Request has no expense data');
  const cfg = await getSetting(db, 'sap.config');
  const treasury =
    req.expense.treasury ?? (await db.treasury.findFirst({ where: { isDefault: true, isActive: true } })) ?? null;
  if (!treasury) throw new DomainError('INVALID_STATE', 'No treasury configured for the SAP credit line');

  let debits: Item[] = [];
  for (const l of req.lines) {
    if (!dec(l.amount.toString()).greaterThan(0)) continue; // D27: zero-amount lines are left out
    if (!l.expense) throw new DomainError('INVALID_STATE', `Line ${l.lineNo} has no accounting snapshot`);
    debits.push({
      side: 'D',
      postingKey: cfg.debitPostingKey,
      glAccount: l.expense.glNumber,
      costCenter: l.expense.costCenterCode,
      amount: toFixed2(l.amount.toString()),
      assignment: req.number,
      itemText: `${l.categoryNameAr} ${req.expense.vehicleNumber}`.slice(0, 50),
    });
  }
  if (cfg.aggregateSameGlCostCenter) {
    const m = new Map<string, Item>();
    for (const d of debits) {
      const k = `${d.glAccount}|${d.costCenter}`;
      const prev = m.get(k);
      if (prev) prev.amount = sumDecimals([prev.amount, d.amount]);
      else m.set(k, { ...d });
    }
    debits = [...m.values()];
  }
  if (debits.length === 0) throw new DomainError('INVALID_STATE', 'Nothing to post: all line amounts are zero');
  const total = sumDecimals(debits.map((d) => d.amount));
  const credit: Item = {
    side: 'C',
    postingKey: cfg.creditPostingKey,
    glAccount: treasury.cashGlNumber,
    amount: total,
    assignment: req.number,
    itemText: `Payment ${req.number}`.slice(0, 50),
  };
  const sumD = sumDecimals(debits.map((d) => d.amount));
  if (!dec(sumD).eq(dec(credit.amount))) {
    throw new DomainError('INVALID_STATE', `Journal entry does not balance (${sumD} vs ${credit.amount})`);
  }
  const paid = req.paidAt ?? new Date();
  const docDate = cfg.documentDateMode === 'SUBMISSION_DATE' ? req.submittedAt : paid;
  const driver = req.submitter?.fullName ?? '';
  return {
    idempotencyKey: req.id,
    reference: req.number,
    companyCode: treasury.companyCode || cfg.companyCode,
    documentType: cfg.documentType,
    currency: 'EGP',
    postingDate: cairoDateString(paid),
    documentDate: cairoDateString(docDate),
    headerText: `${driver} ${req.expense.vehicleNumber}`.trim().slice(0, 25),
    items: [...debits, credit],
  };
}
