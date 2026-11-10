// Conversation state machine (PLAN section 6). Pure of grammY: talks through `Out`.
import type { Attachment, PrismaClient, Submitter } from '@dms/db';
import { audit } from '@dms/core/audit';
import { getSetting } from '@dms/core/config';
import { verifyLinkToken } from '@dms/core/telegram';
import { DomainError } from '@dms/core/errors';
import { submitCorrection, submitRequest, listOpenCorrections, listSubmitterRequests } from '@dms/core/engine';
import type { OpenCorrection } from '@dms/core/engine';
import { checkOdometer, createVehicleChangeRequest, getCurrentAssignment } from '@dms/core/fleet';
import { ingestAttachment } from '@dms/core/media';
import type { StorageAdapter } from '@dms/core/storage';
import {
  fieldDefinitionsSchema,
  normalizeDigits,
  normalizeEgyptPhone,
  parseAmount,
  parseInteger,
  sumDecimals,
  type FieldDefinition,
} from '@dms/shared';
import { BTN, M, REASON_AR, STATUS_AR, summaryText } from './messages';
import {
  DRAFT_STATES,
  type BotDraft,
  type CorrectionCtx,
  type DraftLine,
  type Input,
  type InlineBtn,
  type Out,
  type State,
} from './types';

export const REQUEST_TYPE_CODE = 'DRIVER_EXPENSE';

export interface FlowDeps {
  prisma: PrismaClient;
  storage: StorageAdapter;
  downloadFile(fileId: string): Promise<{ bytes: Buffer; fileName?: string }>;
  now(): Date;
}

export interface Session {
  id: string;
  submitterId: string | null;
  state: State;
  draft: BotDraft | null;
  correction: CorrectionCtx | null;
  draftExpiresAt: Date | null;
}

export interface Sender {
  id: number;
  username?: string;
}

type Cat = Awaited<ReturnType<PrismaClient['lineCategory']['findFirstOrThrow']>>;
const btn = (text: string, data: string): InlineBtn => ({ text, data });

function fieldsOf(cat: Cat): FieldDefinition[] {
  const parsed = fieldDefinitionsSchema.safeParse(cat.extraFields);
  return parsed.success ? [...parsed.data].sort((a, b) => a.order - b.order) : [];
}

/** Returns the normalized value or null when invalid. */
export function validateField(f: FieldDefinition, raw: string): string | null {
  const text = normalizeDigits(raw).trim();
  if (!text) return null;
  switch (f.type) {
    case 'number': {
      const v = parseAmount(text);
      if (v === null) return null;
      const n = Number(v);
      if (f.min !== undefined && n < f.min) return null;
      if (f.max !== undefined && n > f.max) return null;
      return v.replace(/\.00$/, '');
    }
    case 'date': {
      let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
      let y: number, mo: number, d: number;
      if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      else {
        m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
        if (!m) return null;
        [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
      }
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    case 'select': {
      const o = f.options?.find((x) => x.value === raw.trim() || x.labelAr === raw.trim());
      return o ? o.value : null;
    }
    default: {
      if (text.length > 200) return null;
      if (f.regex) {
        try {
          if (!new RegExp(f.regex).test(raw.trim())) return null;
        } catch {
          /* bad regex in config: accept */
        }
      }
      return raw.trim();
    }
  }
}

export async function handleInput(deps: FlowDeps, s: Session, from: Sender, input: Input, out: Out): Promise<void> {
  const { prisma } = deps;
  if (input.kind === 'cb') await out.ack();

  // ---- admin-issued link token (deep link / pasted command) ----
  if (input.kind === 'text') {
    const m = /^\/start\s+([ud]_[A-Za-z0-9_]{10,62})$/.exec(input.text.trim());
    if (m) return handleLinkToken(deps, s, from, m[1]!, out);
  }

  // ---- link status ----
  let submitter: Submitter | null = null;
  if (s.submitterId) {
    submitter = await prisma.submitter.findUnique({ where: { id: s.submitterId } });
    if (!submitter || !submitter.isActive || submitter.telegramUserId?.toString() !== String(from.id)) {
      const wasLinked = true;
      s.submitterId = null;
      s.state = 'UNLINKED';
      s.draft = null;
      s.correction = null;
      submitter = null;
      if (wasLinked && !(input.kind === 'text' && input.text.startsWith('/start')) && input.kind !== 'contact') {
        await out.say(M.unlinkedNow, { reply: 'remove' });
        return;
      }
    }
  } else {
    const existing = await prisma.submitter.findFirst({ where: { telegramUserId: BigInt(from.id), isActive: true } });
    if (existing) {
      submitter = existing;
      s.submitterId = existing.id;
      if (s.state === 'UNLINKED') s.state = 'IDLE';
    }
  }
  if (!submitter) return handleUnlinked(deps, s, from, input, out);

  // ---- self-heal (sweep may have removed the draft; corrections may be closed) ----
  if (!s.draft && DRAFT_STATES.includes(s.state)) s.state = 'IDLE';
  if (!s.correction && s.state.startsWith('CORR_') && s.state !== 'CORR_PICK') s.state = 'IDLE';
  if (s.draft && s.draftExpiresAt && s.draftExpiresAt.getTime() < deps.now().getTime()) {
    s.draft = null;
    if (DRAFT_STATES.includes(s.state)) s.state = 'IDLE';
    await out.say(M.draftExpired);
  }

  const ctx: Ctx = { deps, s, submitter, out };

  // ---- global inputs ----
  if (input.kind === 'text') {
    const t = input.text.trim();
    if (t.startsWith('/start') || t === BTN.menu || t === '/menu') return leaveToMenu(ctx);
    if (t === BTN.newRequest) return newRequest(ctx);
    if (t === BTN.myRequests) return myRequests(ctx);
    if (t.startsWith(BTN.corrections)) return corrections(ctx);
  }
  if (input.kind === 'cb') {
    const [verb, arg] = splitCb(input.data);
    if (verb === 'corr' && arg) return startCorrection(ctx, arg);
    if (verb === 'resume') return resume(ctx);
    if (verb === 'discard') {
      s.draft = null;
      if (DRAFT_STATES.includes(s.state)) s.state = 'IDLE';
      return newRequest(ctx);
    }
    if (verb === 'cancel' && s.draft) {
      return out.say(M.cancelAsk, {
        inline: [[btn(BTN.cancelYes, 'cancel_yes'), btn(BTN.cancelNo, 'cancel_no')]],
      });
    }
    if (verb === 'cancel_yes' && s.draft) {
      s.draft = null;
      s.state = 'IDLE';
      await out.say(M.cancelled);
      return showMenu(ctx);
    }
    if (verb === 'cancel_no' && s.draft) return prompt(ctx);
    if (verb === 'vcr' && (s.state === 'IDLE' || s.state === 'CONFIRM_VEHICLE')) {
      s.draft = null;
      s.state = 'VCR_INPUT';
      return out.say(M.askVcr, { inline: [[btn(BTN.back, 'back')]] });
    }
  }

  const handled = await dispatch(ctx, input);
  if (handled) return;
  if (input.kind === 'cb') {
    await out.say(M.stale);
  } else if (input.kind === 'file') {
    await out.say(M.photoNotNow);
  } else {
    await out.say(M.unexpected);
  }
  await prompt(ctx);
}

interface Ctx {
  deps: FlowDeps;
  s: Session;
  submitter: Submitter;
  out: Out;
}

function splitCb(data: string): [string, string | undefined] {
  const i = data.indexOf(':');
  return i < 0 ? [data, undefined] : [data.slice(0, i), data.slice(i + 1)];
}

// ---------------- onboarding ----------------
async function handleLinkToken(deps: FlowDeps, s: Session, from: Sender, token: string, out: Out): Promise<void> {
  const { prisma } = deps;
  const v = verifyLinkToken(token, deps.now());
  if (!v) return out.say(M.linkInvalid);
  const tgId = BigInt(from.id);

  if (v.kind === 'u') {
    const user = await prisma.user.findUnique({ where: { id: v.id } });
    if (!user || !user.isActive) return out.say(M.linkInvalid);
    if (user.telegramUserId !== null && user.telegramUserId !== tgId) return out.say(M.linkTaken);
    const other = await prisma.user.findFirst({ where: { telegramUserId: tgId, id: { not: user.id } }, select: { id: true } });
    if (other) return out.say(M.linkTaken);
    try {
      await prisma.user.update({ where: { id: user.id }, data: { telegramUserId: tgId, telegramChatId: tgId } });
    } catch {
      return out.say(M.linkTaken);
    }
    await audit(prisma, {
      actor: { type: 'SYSTEM', label: `telegram:${from.id}` },
      action: 'user.telegram_link',
      entityType: 'User',
      entityId: user.id,
      after: { telegramUserId: String(from.id) },
    });
    return out.say(M.userLinked(user.fullName), { reply: 'remove' });
  }

  const sub = await prisma.submitter.findUnique({ where: { id: v.id } });
  if (!sub || !sub.isActive) return out.say(M.linkInvalid);
  if (sub.telegramUserId !== null && sub.telegramUserId !== tgId) return out.say(M.alreadyLinked);
  try {
    await prisma.submitter.update({
      where: { id: sub.id },
      data: {
        telegramUserId: tgId,
        telegramChatId: tgId,
        telegramUsername: from.username ?? null,
        telegramLinkedAt: deps.now(),
      },
    });
  } catch {
    return out.say(M.alreadyLinked);
  }
  await audit(prisma, {
    actor: { type: 'SUBMITTER', submitterId: sub.id, label: sub.fullName },
    action: 'bot.linked',
    entityType: 'Submitter',
    entityId: sub.id,
    after: { telegramUserId: from.id },
    meta: { via: 'admin_link' },
  });
  s.submitterId = sub.id;
  s.state = 'IDLE';
  const ctx: Ctx = { deps, s, submitter: sub, out };
  await out.say(M.linked(sub.fullName), { reply: await menuKeyboard(ctx) });
}

async function handleUnlinked(deps: FlowDeps, s: Session, from: Sender, input: Input, out: Out): Promise<void> {
  const { prisma } = deps;
  s.state = 'UNLINKED';
  const contactKb = { reply: [[{ text: BTN.shareContact, contact: true as const }]] };
  if (input.kind !== 'contact') {
    const approver = await prisma.user.findFirst({ where: { telegramUserId: BigInt(from.id) }, select: { id: true } });
    if (approver) return out.say(M.approverOnly, { reply: 'remove' });
  }
  if (input.kind === 'text' && input.text.trim().startsWith('/start')) {
    return out.say(M.welcome, contactKb);
  }
  if (input.kind !== 'contact') return out.say(M.useButton, contactKb);

  if (input.userId === undefined || input.userId !== from.id) {
    await audit(prisma, {
      actor: { type: 'SYSTEM', label: `telegram:${from.id}` },
      action: 'bot.contact_mismatch',
      entityType: 'BotSession',
      entityId: s.id,
      meta: { fromId: from.id, contactUserId: input.userId ?? null, phone: input.phone },
    });
    return out.say(M.foreignContact, contactKb);
  }
  const phone = normalizeEgyptPhone(input.phone);
  const sub = phone ? await prisma.submitter.findUnique({ where: { phone } }) : null;
  if (!sub || !sub.isActive) return out.say(M.unknownPhone, contactKb);
  if (sub.telegramUserId !== null && sub.telegramUserId !== BigInt(from.id)) {
    return out.say(M.alreadyLinked, contactKb);
  }
  try {
    await prisma.submitter.update({
      where: { id: sub.id },
      data: {
        telegramUserId: BigInt(from.id),
        telegramChatId: BigInt(from.id),
        telegramUsername: from.username ?? null,
        telegramLinkedAt: deps.now(),
      },
    });
  } catch {
    return out.say(M.alreadyLinked, contactKb);
  }
  await audit(prisma, {
    actor: { type: 'SUBMITTER', submitterId: sub.id, label: sub.fullName },
    action: 'bot.linked',
    entityType: 'Submitter',
    entityId: sub.id,
    after: { telegramUserId: from.id },
  });
  s.submitterId = sub.id;
  s.state = 'IDLE';
  const ctx: Ctx = { deps, s, submitter: sub, out };
  await out.say(M.linked(sub.fullName), { reply: await menuKeyboard(ctx) });
}

// ---------------- menu ----------------
async function menuKeyboard(ctx: Ctx) {
  let n = 0;
  try {
    n = (await listOpenCorrections(ctx.deps.prisma, ctx.submitter.id)).length;
  } catch {
    /* engine not available: no corrections row */
  }
  const rows: { text: string }[][] = [[{ text: BTN.newRequest }], [{ text: BTN.myRequests }]];
  if (n > 0) rows[1]!.push({ text: `${BTN.corrections} (${n})` });
  return rows;
}

async function showMenu(ctx: Ctx, text: string = M.menu): Promise<void> {
  await ctx.out.say(text, { reply: await menuKeyboard(ctx) });
}

/** "/start" or "القائمة": show the menu without losing the draft. */
async function leaveToMenu(ctx: Ctx): Promise<void> {
  const { s } = ctx;
  if (s.draft && DRAFT_STATES.includes(s.state)) s.draft.resumeState = s.state;
  if (s.state !== 'VCR_PENDING') s.state = 'IDLE';
  s.correction = null;
  await showMenu(ctx);
}

async function myRequests(ctx: Ctx): Promise<void> {
  const rows = await listSubmitterRequests(ctx.deps.prisma, ctx.submitter.id, 10);
  if (!rows.length) return ctx.out.say(M.noRequests);
  const lines = rows.map(
    (r) =>
      `${r.number} — ${r.totalFinal} ج — ${STATUS_AR[r.status] ?? r.status}${r.currentSteps?.length ? ` (${r.currentSteps.join('، ')})` : ''}`,
  );
  await ctx.out.say([M.myRequestsHeader, '', ...lines].join('\n'));
}

// ---------------- new request ----------------
async function newRequest(ctx: Ctx): Promise<void> {
  const { s, out, deps } = ctx;
  if (s.draft) {
    return out.say(M.resumeOrDiscard, { inline: [[btn(BTN.resume, 'resume'), btn(BTN.discard, 'discard')]] });
  }
  const pending = await deps.prisma.vehicleChangeRequest.findFirst({
    where: { submitterId: ctx.submitter.id, status: 'PENDING' },
  });
  if (pending) {
    s.state = 'VCR_PENDING';
    return out.say(M.vcrPending);
  }
  const a = await getCurrentAssignment(deps.prisma, ctx.submitter.id);
  if (!a) {
    s.state = 'IDLE';
    return out.say(M.noAssignment, { inline: [[btn(BTN.vcr, 'vcr')]] });
  }
  const block = await getSetting(deps.prisma, 'expense.blockStoppedVehicle');
  if (a.vehicle.status === 'STOPPED' && block) {
    s.state = 'IDLE';
    return out.say(M.vehicleStopped(a.vehicle.number));
  }
  s.draft = {
    requestTypeCode: REQUEST_TYPE_CODE,
    startedAt: deps.now().toISOString(),
    vehicleId: a.vehicle.id,
    vehicleNumber: a.vehicle.number,
    costCenterCode: a.vehicle.costCenter.code,
    lines: [],
  };
  s.state = 'CONFIRM_VEHICLE';
  await prompt(ctx);
}

async function resume(ctx: Ctx): Promise<void> {
  const { s } = ctx;
  if (!s.draft) return newRequest(ctx);
  if (!DRAFT_STATES.includes(s.state)) s.state = s.draft.resumeState ?? 'SUMMARY';
  if (s.draft.lines.length === 0 && s.state === 'SUMMARY') s.state = 'CHOOSE_TYPE';
  await prompt(ctx);
}

// ---------------- prompts ----------------
async function categories(ctx: Ctx): Promise<Cat[]> {
  return ctx.deps.prisma.lineCategory.findMany({
    where: { requestType: { code: ctx.s.draft?.requestTypeCode ?? REQUEST_TYPE_CODE }, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
}

async function categoryById(ctx: Ctx, id: string | undefined): Promise<Cat | null> {
  if (!id) return null;
  return ctx.deps.prisma.lineCategory.findUnique({ where: { id } });
}

function total(d: BotDraft): string {
  return sumDecimals(d.lines.map((l) => l.amount));
}

async function prompt(ctx: Ctx): Promise<void> {
  const { s, out } = ctx;
  const d = s.draft;
  switch (s.state) {
    case 'IDLE':
      return showMenu(ctx, d ? M.resumeOrDiscard : M.menu);
    case 'CONFIRM_VEHICLE':
      return out.say(M.confirmVehicle(d!.vehicleNumber, d!.costCenterCode), {
        inline: [[btn(BTN.yes, 'yes'), btn(BTN.no, 'no')], [btn(BTN.cancel, 'cancel')]],
      });
    case 'VCR_INPUT':
      return out.say(M.askVcr, { inline: [[btn(BTN.back, 'back')]] });
    case 'VCR_PENDING':
      return out.say(M.vcrPending);
    case 'ODOMETER':
      return out.say(M.askOdometer);
    case 'ODOMETER_CONFIRM':
      return out.say(odoWarnText(d!.odometerWarning, d!.odometer ?? 0, null), {
        inline: [[btn(BTN.odoOk, 'odo_ok'), btn(BTN.odoRedo, 'odo_redo')]],
      });
    case 'CHOOSE_TYPE': {
      const cats = await categories(ctx);
      const rows: InlineBtn[][] = [];
      for (let i = 0; i < cats.length; i += 2) {
        rows.push(cats.slice(i, i + 2).map((c) => btn(`${c.icon ?? ''} ${c.nameAr}`.trim(), `cat:${c.id}`)));
      }
      rows.push([d!.lines.length ? btn(BTN.toSummary, 'summary') : btn(BTN.cancel, 'cancel')]);
      return out.say(M.chooseType, { inline: rows });
    }
    case 'AMOUNT':
      return out.say(M.askAmount(d!.current?.categoryName ?? ''), { inline: [[btn(BTN.lineCancel, 'line_cancel')]] });
    case 'EXTRA_FIELD': {
      const cat = await categoryById(ctx, d!.current?.categoryId);
      const f = cat ? fieldsOf(cat)[d!.current?.extraIndex ?? 0] : undefined;
      if (!f) {
        s.state = 'PHOTOS';
        return prompt(ctx);
      }
      return askField(ctx, f);
    }
    case 'PHOTOS': {
      const cat = await categoryById(ctx, d!.current?.categoryId);
      const n = d!.current?.attachmentIds?.length ?? 0;
      return out.say(M.askPhotos(cat?.minAttachments ?? 1) + (n ? `\n(استلمت ${n} ملف لحد دلوقتي)` : ''), {
        inline: [[btn(BTN.photosDone, 'photos_done')], [btn(BTN.lineCancel, 'line_cancel')]],
      });
    }
    case 'LINE_DONE':
      return out.say(M.lineAdded, { inline: [[btn(BTN.addAnother, 'add_more'), btn(BTN.finished, 'finish')]] });
    case 'SUMMARY':
      return out.say(summaryText(d!, total(d!)), {
        inline: [[btn(BTN.confirm, 'confirm')], [btn(BTN.edit, 'edit'), btn(BTN.cancel, 'cancel')]],
      });
    case 'EDIT_PICK': {
      const rows = d!.lines.map((l, i) => [btn(`${i + 1}) ${l.categoryName} — ${l.amount}`, `line:${i}`)]);
      rows.push([btn(BTN.toSummary, 'summary')]);
      return out.say(M.editPick, { inline: rows });
    }
    case 'EDIT_LINE': {
      const l = d!.lines[d!.editingIndex ?? 0];
      if (!l) {
        s.state = 'SUMMARY';
        return prompt(ctx);
      }
      return out.say(M.editLine(d!.editingIndex ?? 0, l.categoryName, l.amount), {
        inline: [[btn(BTN.changeAmount, 'line_amt'), btn(BTN.delLine, 'line_del')], [btn(BTN.back, 'edit')]],
      });
    }
    case 'EDIT_AMOUNT':
      return out.say(M.askNewAmount, { inline: [[btn(BTN.back, 'edit')]] });
    case 'CORR_PICK':
      return corrections(ctx);
    case 'CORR_AMOUNT':
      return out.say(M.corrAskAmount);
    case 'CORR_PHOTOS':
      return out.say(M.corrAskPhotos, { inline: [[btn(BTN.corrDone, 'corr_done')]] });
    default:
      return showMenu(ctx);
  }
}

function odoWarnText(code: string | undefined, n: number, last: number | null): string {
  if (code === 'LOWER_THAN_LAST') return M.odoLower(last ?? 0, n);
  return M.odoJump(last, n);
}

async function askField(ctx: Ctx, f: FieldDefinition): Promise<void> {
  const text = f.promptAr ?? M.askField(f.labelAr);
  const rows: InlineBtn[][] = [];
  if (f.type === 'select' && f.options) {
    f.options.forEach((o, i) => rows.push([btn(o.labelAr, `opt:${i}`)]));
  }
  if (!f.required) rows.push([btn(BTN.skip, 'skip')]);
  rows.push([btn(BTN.lineCancel, 'line_cancel')]);
  await ctx.out.say(text, { inline: rows });
}

// ---------------- dispatch ----------------
async function dispatch(ctx: Ctx, input: Input): Promise<boolean> {
  const { s, out, deps } = ctx;
  const d = s.draft;
  const text = input.kind === 'text' ? input.text.trim() : null;
  const cb = input.kind === 'cb' ? splitCb(input.data) : null;
  const verb = cb?.[0];
  const arg = cb?.[1];

  switch (s.state) {
    case 'IDLE':
      return false;

    case 'VCR_PENDING': {
      const pending = await deps.prisma.vehicleChangeRequest.findFirst({
        where: { submitterId: ctx.submitter.id, status: 'PENDING' },
      });
      if (!pending) {
        s.state = 'IDLE';
        await showMenu(ctx);
        return true;
      }
      await out.say(M.vcrPending);
      return true;
    }

    case 'CONFIRM_VEHICLE':
      if (verb === 'yes' && d) {
        s.state = 'ODOMETER';
        await prompt(ctx);
        return true;
      }
      if (verb === 'no') {
        s.draft = null;
        s.state = 'VCR_INPUT';
        await prompt(ctx);
        return true;
      }
      return false;

    case 'VCR_INPUT': {
      if (verb === 'back') {
        s.state = 'IDLE';
        await showMenu(ctx);
        return true;
      }
      if (text === null) return false;
      const typed = normalizeDigits(text).replace(/\s+/g, '');
      if (!typed || typed.length > 30) {
        await out.say(M.askVcr, { inline: [[btn(BTN.back, 'back')]] });
        return true;
      }
      const a = await getCurrentAssignment(deps.prisma, ctx.submitter.id);
      if (a && a.vehicle.number === typed) {
        await out.say(M.vcrSame);
        s.state = 'IDLE';
        await showMenu(ctx);
        return true;
      }
      const veh = await deps.prisma.vehicle.findUnique({ where: { number: typed } });
      await createVehicleChangeRequest(deps.prisma, {
        submitterId: ctx.submitter.id,
        toVehicleId: veh?.id,
        requestedVehicleText: typed,
      });
      s.state = 'VCR_PENDING';
      await out.say(veh ? M.vcrCreated(typed) : M.vcrCreatedUnknown(typed));
      return true;
    }

    case 'ODOMETER':
    case 'ODOMETER_CONFIRM': {
      if (!d) return false;
      if (s.state === 'ODOMETER_CONFIRM' && verb === 'odo_ok') {
        s.state = 'CHOOSE_TYPE';
        await prompt(ctx);
        return true;
      }
      if (s.state === 'ODOMETER_CONFIRM' && verb === 'odo_redo') {
        delete d.odometer;
        delete d.odometerWarning;
        s.state = 'ODOMETER';
        await prompt(ctx);
        return true;
      }
      if (text === null) return false;
      const n = parseInteger(text);
      if (n === null) {
        await out.say(M.badOdometer);
        return true;
      }
      const chk = await checkOdometer(deps.prisma, d.vehicleId, n);
      d.odometer = n;
      if (chk.warning) {
        d.odometerWarning = chk.warning;
        s.state = 'ODOMETER_CONFIRM';
        await out.say(odoWarnText(chk.warning, n, chk.last), {
          inline: [[btn(BTN.odoOk, 'odo_ok'), btn(BTN.odoRedo, 'odo_redo')]],
        });
        return true;
      }
      delete d.odometerWarning;
      s.state = 'CHOOSE_TYPE';
      await prompt(ctx);
      return true;
    }

    case 'CHOOSE_TYPE': {
      if (!d) return false;
      if (verb === 'summary' && d.lines.length) {
        s.state = 'SUMMARY';
        await prompt(ctx);
        return true;
      }
      if (verb === 'cat' && arg) {
        const cat = await categoryById(ctx, arg);
        if (!cat || !cat.isActive) return false;
        d.current = {
          categoryId: cat.id,
          categoryCode: cat.code,
          categoryName: cat.nameAr,
          extraValues: {},
          attachmentIds: [],
        };
        s.state = 'AMOUNT';
        await prompt(ctx);
        return true;
      }
      return false;
    }

    case 'AMOUNT':
    case 'EXTRA_FIELD':
    case 'PHOTOS': {
      if (!d?.current) return false;
      if (verb === 'line_cancel') {
        d.current = undefined;
        s.state = d.lines.length ? 'LINE_DONE' : 'CHOOSE_TYPE';
        await prompt(ctx);
        return true;
      }
      if (s.state === 'AMOUNT') return amountStep(ctx, d, text);
      if (s.state === 'EXTRA_FIELD') return extraStep(ctx, d, text, verb, arg);
      return photosStep(ctx, d, input, verb);
    }

    case 'LINE_DONE':
      if (verb === 'add_more') {
        s.state = 'CHOOSE_TYPE';
        await prompt(ctx);
        return true;
      }
      if (verb === 'finish') {
        s.state = 'SUMMARY';
        await prompt(ctx);
        return true;
      }
      return false;

    case 'SUMMARY':
      if (!d) return false;
      if (verb === 'confirm') return confirmSubmit(ctx, d);
      if (verb === 'edit') {
        s.state = 'EDIT_PICK';
        await prompt(ctx);
        return true;
      }
      if (verb === 'summary') {
        await prompt(ctx);
        return true;
      }
      return false;

    case 'EDIT_PICK':
    case 'EDIT_LINE':
    case 'EDIT_AMOUNT':
      if (!d) return false;
      return editStep(ctx, d, text, verb, arg);

    case 'CORR_PICK':
      return false;
    case 'CORR_AMOUNT':
    case 'CORR_PHOTOS':
      return corrStep(ctx, input, verb);
    default:
      return false;
  }
}

async function amountStep(ctx: Ctx, d: BotDraft, text: string | null): Promise<boolean> {
  if (text === null) return false;
  const amount = parseAmount(text);
  if (!amount) {
    await ctx.out.say(M.badAmount, { inline: [[btn(BTN.lineCancel, 'line_cancel')]] });
    return true;
  }
  d.current!.amount = amount;
  const cat = await categoryById(ctx, d.current!.categoryId);
  if (cat && fieldsOf(cat).length) {
    d.current!.extraIndex = 0;
    ctx.s.state = 'EXTRA_FIELD';
  } else {
    ctx.s.state = 'PHOTOS';
  }
  await prompt(ctx);
  return true;
}

async function extraStep(
  ctx: Ctx,
  d: BotDraft,
  text: string | null,
  verb: string | undefined,
  arg: string | undefined,
): Promise<boolean> {
  const cat = await categoryById(ctx, d.current!.categoryId);
  const fields = cat ? fieldsOf(cat) : [];
  const idx = d.current!.extraIndex ?? 0;
  const f = fields[idx];
  if (!f) {
    ctx.s.state = 'PHOTOS';
    await prompt(ctx);
    return true;
  }
  let value: string | null = null;
  if (verb === 'skip' && !f.required) value = '';
  else if (verb === 'opt' && arg !== undefined && f.options?.[Number(arg)]) value = f.options[Number(arg)]!.value;
  else if (text !== null) {
    value = validateField(f, text);
    if (value === null) {
      await ctx.out.say(M.badField(f.labelAr));
      await askField(ctx, f);
      return true;
    }
  } else return false;
  if (value !== '') d.current!.extraValues = { ...(d.current!.extraValues ?? {}), [f.key]: value };
  if (idx + 1 < fields.length) {
    d.current!.extraIndex = idx + 1;
  } else {
    ctx.s.state = 'PHOTOS';
  }
  await prompt(ctx);
  return true;
}

// ---------------- photos ----------------
async function ingest(
  ctx: Ctx,
  input: Extract<Input, { kind: 'file' }>,
  extra: { correctionRequestId?: string },
): Promise<Attachment | null> {
  const { deps, s } = ctx;
  try {
    const f = await deps.downloadFile(input.fileId);
    return await ingestAttachment(deps.prisma, deps.storage, {
      bytes: f.bytes,
      originalName: input.name ?? f.fileName,
      botSessionId: s.id,
      uploadedBySubmitterId: ctx.submitter.id,
      telegramFileUniqueId: input.uniqueId,
      ...extra,
    });
  } catch (e) {
    if (e instanceof DomainError && (e.code === 'VALIDATION' || e.code === 'CONFLICT')) {
      await ctx.out.say(M.photoBad);
      return null;
    }
    throw e;
  }
}

async function photosStep(ctx: Ctx, d: BotDraft, input: Input, verb: string | undefined): Promise<boolean> {
  const cur = d.current!;
  const cat = await categoryById(ctx, cur.categoryId);
  const ids = (cur.attachmentIds ??= []);
  if (input.kind === 'file') {
    if (cat && input.mime && !cat.allowedMimeTypes.includes(input.mime)) {
      await ctx.out.say(M.photoBad);
      return true;
    }
    if (cat && ids.length >= cat.maxAttachments) {
      await ctx.out.say(M.photoTooMany(cat.maxAttachments), { inline: [[btn(BTN.photosDone, 'photos_done')]] });
      return true;
    }
    const att = await ingest(ctx, input, {});
    if (!att) return true;
    ids.push(att.id);
    await ctx.out.say(M.photoGot(ids.length), { inline: [[btn(BTN.photosDone, 'photos_done')]] });
    return true;
  }
  if (verb === 'photos_done') {
    const min = cat?.minAttachments ?? 1;
    if (ids.length < min) {
      await ctx.out.say(M.needPhotos(min), {
        inline: [[btn(BTN.photosDone, 'photos_done')], [btn(BTN.lineCancel, 'line_cancel')]],
      });
      return true;
    }
    const line: DraftLine = {
      categoryId: cur.categoryId!,
      categoryCode: cur.categoryCode!,
      categoryName: cur.categoryName!,
      amount: cur.amount!,
      extraValues: cur.extraValues ?? {},
      attachmentIds: ids,
    };
    d.lines.push(line);
    d.current = undefined;
    ctx.s.state = 'LINE_DONE';
    await prompt(ctx);
    return true;
  }
  if (input.kind === 'text') {
    await ctx.out.say(M.textInsteadOfPhoto, {
      inline: [[btn(BTN.photosDone, 'photos_done')], [btn(BTN.lineCancel, 'line_cancel')]],
    });
    return true;
  }
  return false;
}

// ---------------- summary / edit / submit ----------------
async function confirmSubmit(ctx: Ctx, d: BotDraft): Promise<boolean> {
  const { s, deps, out } = ctx;
  if (!d.lines.length) {
    s.state = 'CHOOSE_TYPE';
    await prompt(ctx);
    return true;
  }
  let res: { id: string; number: string };
  try {
    res = await submitRequest(
      deps.prisma,
      {
        requestTypeCode: d.requestTypeCode,
        channel: 'TELEGRAM',
        submitterId: ctx.submitter.id,
        clientKey: `${s.id}:${d.startedAt}`,
        headerValues: {
          vehicleId: d.vehicleId,
          vehicleNumber: d.vehicleNumber,
          odometer: d.odometer,
          odometerWarning: d.odometerWarning ?? null,
        },
        lines: d.lines.map((l) => ({
          categoryId: l.categoryId,
          amount: l.amount,
          extraValues: l.extraValues,
          attachmentIds: l.attachmentIds,
        })),
      },
      { type: 'SUBMITTER', submitterId: ctx.submitter.id, label: ctx.submitter.fullName },
    );
  } catch (e) {
    console.error('[bot] submitRequest failed', e);
    await out.say(M.submitFailed, { inline: [[btn(BTN.confirm, 'confirm')]] });
    return true;
  }
  s.draft = null;
  s.state = 'IDLE';
  await out.say(M.submitted(res.number), { html: true, reply: await menuKeyboard(ctx) });
  return true;
}

async function editStep(
  ctx: Ctx,
  d: BotDraft,
  text: string | null,
  verb: string | undefined,
  arg: string | undefined,
): Promise<boolean> {
  const { s } = ctx;
  if (verb === 'summary') {
    s.state = 'SUMMARY';
    await prompt(ctx);
    return true;
  }
  if (verb === 'edit') {
    s.state = 'EDIT_PICK';
    delete d.editingIndex;
    await prompt(ctx);
    return true;
  }
  if (s.state === 'EDIT_PICK' && verb === 'line' && arg !== undefined && d.lines[Number(arg)]) {
    d.editingIndex = Number(arg);
    s.state = 'EDIT_LINE';
    await prompt(ctx);
    return true;
  }
  if (s.state === 'EDIT_LINE' && verb === 'line_del' && d.editingIndex !== undefined) {
    d.lines.splice(d.editingIndex, 1);
    delete d.editingIndex;
    await ctx.out.say(M.lineDeleted);
    s.state = d.lines.length ? 'SUMMARY' : 'CHOOSE_TYPE';
    await prompt(ctx);
    return true;
  }
  if (s.state === 'EDIT_LINE' && verb === 'line_amt') {
    s.state = 'EDIT_AMOUNT';
    await prompt(ctx);
    return true;
  }
  if (s.state === 'EDIT_AMOUNT' && text !== null && d.editingIndex !== undefined) {
    const amount = parseAmount(text);
    if (!amount) {
      await ctx.out.say(M.badAmount);
      return true;
    }
    d.lines[d.editingIndex]!.amount = amount;
    delete d.editingIndex;
    await ctx.out.say(M.amountChanged);
    s.state = 'SUMMARY';
    await prompt(ctx);
    return true;
  }
  return false;
}

// ---------------- corrections ----------------
async function corrections(ctx: Ctx): Promise<void> {
  const list = await listOpenCorrections(ctx.deps.prisma, ctx.submitter.id);
  if (!list.length) return ctx.out.say(M.noCorrections);
  if (list.length === 1) return startCorrection(ctx, list[0]!.id, list);
  ctx.s.state = 'CORR_PICK';
  const rows = list.map((c) => [btn(`${c.requestNumber} — ${REASON_AR[c.reasonCode] ?? c.reasonCode}`, `corr:${c.id}`)]);
  await ctx.out.say(M.corrPick, { inline: rows });
}

async function startCorrection(ctx: Ctx, id: string, known?: OpenCorrection[]): Promise<void> {
  const { s, deps, out } = ctx;
  const list = known ?? (await listOpenCorrections(deps.prisma, ctx.submitter.id));
  const c = list.find((x) => x.id === id);
  if (!c) {
    await out.say(M.corrGone);
    return showMenu(ctx);
  }
  if (s.draft && DRAFT_STATES.includes(s.state)) s.draft.resumeState = s.state;
  s.correction = { requestId: c.requestId, correctionRequestId: c.id, newAttachmentIds: [], fixType: c.fixType };
  let lineLabel: string | null = null;
  if (c.lineId) {
    const l = await deps.prisma.requestLine.findUnique({ where: { id: c.lineId } });
    if (l) lineLabel = `${l.categoryNameAr} — ${l.amount.toString()} ج`;
  }
  await out.say(M.corrIntro(c.requestNumber, lineLabel, REASON_AR[c.reasonCode] ?? c.reasonCode, c.comment));
  s.state = c.fixType === 'REUPLOAD' ? 'CORR_PHOTOS' : 'CORR_AMOUNT';
  await prompt(ctx);
}

async function corrStep(ctx: Ctx, input: Input, verb: string | undefined): Promise<boolean> {
  const { s, deps, out } = ctx;
  const c = s.correction;
  if (!c) return false;
  const finish = async () => {
    try {
      await submitCorrection(deps.prisma, {
        correctionRequestId: c.correctionRequestId,
        submitterId: ctx.submitter.id,
        newAttachmentIds: c.newAttachmentIds.length ? c.newAttachmentIds : undefined,
        newAmount: c.newAmount,
      });
    } catch (e) {
      if (e instanceof DomainError && ['INVALID_STATE', 'NOT_FOUND', 'CONFLICT', 'VALIDATION'].includes(e.code)) {
        console.error('[bot] submitCorrection rejected', e.message);
        s.correction = null;
        s.state = 'IDLE';
        await out.say(M.corrGone);
        await showMenu(ctx);
        return;
      }
      throw e;
    }
    s.correction = null;
    s.state = 'IDLE';
    await out.say(M.corrSent);
    await showMenu(ctx);
  };

  if (s.state === 'CORR_AMOUNT') {
    if (input.kind !== 'text') return false;
    const amount = parseAmount(input.text);
    if (!amount) {
      await out.say(M.badAmount);
      return true;
    }
    c.newAmount = amount;
    if (c.fixType === 'BOTH') {
      s.state = 'CORR_PHOTOS';
      await prompt(ctx);
    } else await finish();
    return true;
  }
  // CORR_PHOTOS
  if (input.kind === 'file') {
    const att = await ingest(ctx, input, { correctionRequestId: c.correctionRequestId });
    if (!att) return true;
    c.newAttachmentIds.push(att.id);
    await out.say(M.photoGot(c.newAttachmentIds.length), { inline: [[btn(BTN.corrDone, 'corr_done')]] });
    return true;
  }
  if (verb === 'corr_done') {
    if (!c.newAttachmentIds.length) {
      await out.say(M.corrNeedPhotos, { inline: [[btn(BTN.corrDone, 'corr_done')]] });
      return true;
    }
    await finish();
    return true;
  }
  if (input.kind === 'text') {
    await out.say(M.textInsteadOfPhoto.replace('خلصت صور', 'خلصت وابعت'), {
      inline: [[btn(BTN.corrDone, 'corr_done')]],
    });
    return true;
  }
  return false;
}
