import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { audit } from '@dms/core/audit';
import type { Actor } from '@dms/core/errors';
import { DomainError } from '@dms/core/errors';
import {
  masterInputSchemas,
  normalizeEgyptPhone,
  type ImportResult,
  type MasterListQuery,
  type MasterResource,
  type Paged,
} from '@dms/shared';
import type { ZodTypeAny } from 'zod';
import { orderByOf, pageArgs, paged } from '../common/paging';
import { PrismaService } from '../prisma/prisma.service';

type Row = Record<string, unknown>;
type Tx = Prisma.TransactionClient;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface ImportCtx {
  vehicleTypes: Map<string, string>;
  costCenters: Map<string, string>;
  glAccounts: Map<string, string>;
  departments: Map<string, string>;
  roles: Map<string, string>;
}

interface Cfg {
  entity: string; // audit entityType
  delegate: string; // prisma delegate name
  key: string; // natural key field
  search: string[];
  sorts: string[];
  defaultSort: Record<string, 'asc' | 'desc'>;
  include?: object;
  where?: (q: MasterListQuery) => object;
  toRow: (r: Any) => Row;
  columns: { header: string; get: (r: Any) => unknown }[];
  fromImport: (c: Record<string, string>, ctx: ImportCtx) => Row;
  normalize?: (input: Row) => Row;
}

const dec = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const bool = (s: string | undefined): boolean | undefined => {
  if (s === undefined || s === '') return undefined;
  return ['true', '1', 'yes', 'y', 'نعم'].includes(s.trim().toLowerCase());
};
const opt = (s: string | undefined): string | null | undefined => (s === undefined || s === '' ? undefined : s);

function lookup(map: Map<string, string>, code: string | undefined, what: string): string | undefined {
  if (!code) return undefined;
  const id = map.get(code);
  if (!id) throw new Error(`Unknown ${what} "${code}"`);
  return id;
}

const CFG: Record<MasterResource, Cfg> = {
  departments: {
    entity: 'Department',
    delegate: 'department',
    key: 'code',
    search: ['code', 'nameAr', 'nameEn'],
    sorts: ['code', 'nameAr', 'nameEn', 'createdAt'],
    defaultSort: { code: 'asc' },
    toRow: (r) => ({ id: r.id, code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, isActive: r.isActive }),
    columns: [
      { header: 'code', get: (r) => r.code },
      { header: 'nameAr', get: (r) => r.nameAr },
      { header: 'nameEn', get: (r) => r.nameEn },
      { header: 'isActive', get: (r) => r.isActive },
    ],
    fromImport: (c) => ({ code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, isActive: bool(c.isActive) }),
  },
  submitters: {
    entity: 'Submitter',
    delegate: 'submitter',
    key: 'code',
    search: ['code', 'fullName', 'phone', 'nationalId'],
    sorts: ['code', 'fullName', 'phone', 'createdAt'],
    defaultSort: { code: 'asc' },
    include: {
      department: true,
      vehicleAssignments: { where: { validTo: null }, include: { vehicle: true }, take: 1 },
    },
    where: (q) => ({ ...(q.departmentId ? { departmentId: q.departmentId } : {}) }),
    toRow: (r) => {
      const cur = r.vehicleAssignments?.[0];
      return {
        id: r.id,
        kind: r.kind,
        code: r.code,
        fullName: r.fullName,
        nationalId: r.nationalId,
        phone: r.phone,
        departmentId: r.departmentId,
        departmentName: r.department?.nameAr ?? null,
        telegramLinked: r.telegramUserId !== null && r.telegramUserId !== undefined,
        telegramUsername: r.telegramUsername,
        telegramLinkedAt: r.telegramLinkedAt?.toISOString?.() ?? null,
        notes: r.notes,
        isActive: r.isActive,
        currentVehicle: cur ? { id: cur.vehicleId, number: cur.vehicle.number, since: cur.validFrom.toISOString() } : null,
      };
    },
    columns: [
      { header: 'code', get: (r) => r.code },
      { header: 'fullName', get: (r) => r.fullName },
      { header: 'phone', get: (r) => r.phone },
      { header: 'nationalId', get: (r) => r.nationalId },
      { header: 'departmentCode', get: (r) => r.department?.code },
      { header: 'currentVehicle', get: (r) => r.vehicleAssignments?.[0]?.vehicle.number },
      { header: 'telegramLinked', get: (r) => r.telegramUserId != null },
      { header: 'notes', get: (r) => r.notes },
      { header: 'isActive', get: (r) => r.isActive },
    ],
    fromImport: (c, ctx) => ({
      kind: 'DRIVER',
      code: c.code,
      fullName: c.fullName,
      phone: c.phone,
      nationalId: opt(c.nationalId),
      departmentId: c.departmentCode ? lookup(ctx.departments, c.departmentCode, 'department') : undefined,
      notes: opt(c.notes),
      isActive: bool(c.isActive),
    }),
    normalize: (i) => {
      if (typeof i.phone === 'string') {
        const raw = /^1\d{9}$/.test(i.phone) ? `0${i.phone}` : i.phone;
        const p = normalizeEgyptPhone(raw);
        if (!p) throw new DomainError('VALIDATION', `Invalid phone number "${i.phone}"`);
        i.phone = p;
      }
      return i;
    },
  },
  'vehicle-types': {
    entity: 'VehicleType',
    delegate: 'vehicleType',
    key: 'code',
    search: ['code', 'nameAr', 'nameEn'],
    sorts: ['code', 'nameAr', 'nameEn'],
    defaultSort: { code: 'asc' },
    toRow: (r) => ({ id: r.id, code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, isActive: r.isActive }),
    columns: [
      { header: 'code', get: (r) => r.code },
      { header: 'nameAr', get: (r) => r.nameAr },
      { header: 'nameEn', get: (r) => r.nameEn },
      { header: 'isActive', get: (r) => r.isActive },
    ],
    fromImport: (c) => ({ code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, isActive: bool(c.isActive) }),
  },
  'cost-centers': {
    entity: 'CostCenter',
    delegate: 'costCenter',
    key: 'code',
    search: ['code', 'name'],
    sorts: ['code', 'name'],
    defaultSort: { code: 'asc' },
    toRow: (r) => ({ id: r.id, code: r.code, name: r.name, isActive: r.isActive }),
    columns: [
      { header: 'code', get: (r) => r.code },
      { header: 'name', get: (r) => r.name },
      { header: 'isActive', get: (r) => r.isActive },
    ],
    fromImport: (c) => ({ code: c.code, name: c.name, isActive: bool(c.isActive) }),
  },
  'gl-accounts': {
    entity: 'GlAccount',
    delegate: 'glAccount',
    key: 'number',
    search: ['number', 'nameAr', 'nameEn'],
    sorts: ['number', 'nameAr', 'nameEn'],
    defaultSort: { number: 'asc' },
    toRow: (r) => ({ id: r.id, number: r.number, nameAr: r.nameAr, nameEn: r.nameEn, isActive: r.isActive }),
    columns: [
      { header: 'number', get: (r) => r.number },
      { header: 'nameAr', get: (r) => r.nameAr },
      { header: 'nameEn', get: (r) => r.nameEn },
      { header: 'isActive', get: (r) => r.isActive },
    ],
    fromImport: (c) => ({ number: c.number, nameAr: c.nameAr, nameEn: c.nameEn, isActive: bool(c.isActive) }),
  },
  vehicles: {
    entity: 'Vehicle',
    delegate: 'vehicle',
    key: 'number',
    search: ['number', 'plateNumber'],
    sorts: ['number', 'plateNumber', 'status', 'createdAt'],
    defaultSort: { number: 'asc' },
    include: {
      vehicleType: true,
      costCenter: true,
      assignments: { where: { validTo: null }, include: { submitter: true }, take: 1 },
    },
    where: (q) => ({
      ...(q.status ? { status: q.status } : {}),
      ...(q.vehicleTypeId ? { vehicleTypeId: q.vehicleTypeId } : {}),
      ...(q.costCenterId ? { costCenterId: q.costCenterId } : {}),
    }),
    toRow: (r) => ({
      id: r.id,
      number: r.number,
      plateNumber: r.plateNumber,
      vehicleTypeId: r.vehicleTypeId,
      vehicleTypeName: r.vehicleType?.nameAr ?? null,
      costCenterId: r.costCenterId,
      costCenterCode: r.costCenter?.code ?? null,
      status: r.status,
      notes: r.notes,
      lastOdometer: r.lastOdometer,
      lastOdometerAt: r.lastOdometerAt?.toISOString?.() ?? null,
      isActive: r.isActive,
      currentDriver: r.assignments?.[0]
        ? { id: r.assignments[0].submitterId, name: r.assignments[0].submitter.fullName }
        : null,
    }),
    columns: [
      { header: 'number', get: (r) => r.number },
      { header: 'plateNumber', get: (r) => r.plateNumber },
      { header: 'vehicleTypeCode', get: (r) => r.vehicleType?.code },
      { header: 'costCenterCode', get: (r) => r.costCenter?.code },
      { header: 'status', get: (r) => r.status },
      { header: 'notes', get: (r) => r.notes },
      { header: 'lastOdometer', get: (r) => r.lastOdometer },
      { header: 'currentDriver', get: (r) => r.assignments?.[0]?.submitter.fullName },
      { header: 'isActive', get: (r) => r.isActive },
    ],
    fromImport: (c, ctx) => ({
      number: c.number,
      plateNumber: opt(c.plateNumber),
      vehicleTypeId: lookup(ctx.vehicleTypes, c.vehicleTypeCode, 'vehicle type'),
      costCenterId: lookup(ctx.costCenters, c.costCenterCode, 'cost center'),
      status: c.status ? c.status.toUpperCase() : undefined,
      notes: opt(c.notes),
      isActive: bool(c.isActive),
    }),
  },
  treasuries: {
    entity: 'Treasury',
    delegate: 'treasury',
    key: 'code',
    search: ['code', 'name', 'cashGlNumber'],
    sorts: ['code', 'name'],
    defaultSort: { code: 'asc' },
    toRow: (r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      cashGlNumber: r.cashGlNumber,
      companyCode: r.companyCode,
      isDefault: r.isDefault,
      isActive: r.isActive,
    }),
    columns: [
      { header: 'code', get: (r) => r.code },
      { header: 'name', get: (r) => r.name },
      { header: 'cashGlNumber', get: (r) => r.cashGlNumber },
      { header: 'companyCode', get: (r) => r.companyCode },
      { header: 'isDefault', get: (r) => r.isDefault },
      { header: 'isActive', get: (r) => r.isActive },
    ],
    fromImport: (c) => ({
      code: c.code,
      name: c.name,
      cashGlNumber: c.cashGlNumber,
      companyCode: c.companyCode,
      isDefault: bool(c.isDefault),
      isActive: bool(c.isActive),
    }),
  },
  'expense-types': {
    entity: 'ExpenseType',
    delegate: 'lineCategory',
    key: 'code',
    search: ['code', 'nameAr', 'nameEn'],
    sorts: ['code', 'nameAr', 'sortOrder'],
    defaultSort: { sortOrder: 'asc' },
    include: { expenseConfig: { include: { glAccount: true } }, approvalRoles: { include: { role: true } } },
    toRow: (r) => ({
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      icon: r.icon,
      sortOrder: r.sortOrder,
      glAccountId: r.expenseConfig?.glAccountId ?? null,
      glNumber: r.expenseConfig?.glAccount?.number ?? null,
      glName: r.expenseConfig?.glAccount?.nameAr ?? null,
      extraFields: r.extraFields,
      quantityFieldKey: r.quantityFieldKey,
      unitPriceMin: dec(r.unitPriceMin),
      unitPriceMax: dec(r.unitPriceMax),
      minAttachments: r.minAttachments,
      maxAttachments: r.maxAttachments,
      maxAmountWarning: dec(r.maxAmountWarning),
      approvalRoleIds: (r.approvalRoles ?? []).map((a: Any) => a.roleId),
      approvalRoles: (r.approvalRoles ?? []).map((a: Any) => ({ id: a.roleId, code: a.role.code, nameAr: a.role.nameAr })),
      isActive: r.isActive,
    }),
    columns: [
      { header: 'code', get: (r) => r.code },
      { header: 'nameAr', get: (r) => r.nameAr },
      { header: 'nameEn', get: (r) => r.nameEn },
      { header: 'icon', get: (r) => r.icon },
      { header: 'sortOrder', get: (r) => r.sortOrder },
      { header: 'glNumber', get: (r) => r.expenseConfig?.glAccount?.number },
      { header: 'quantityFieldKey', get: (r) => r.quantityFieldKey },
      { header: 'unitPriceMin', get: (r) => dec(r.unitPriceMin) },
      { header: 'unitPriceMax', get: (r) => dec(r.unitPriceMax) },
      { header: 'minAttachments', get: (r) => r.minAttachments },
      { header: 'maxAttachments', get: (r) => r.maxAttachments },
      { header: 'maxAmountWarning', get: (r) => dec(r.maxAmountWarning) },
      { header: 'approvalRoleCodes', get: (r) => (r.approvalRoles ?? []).map((a: Any) => a.role.code).join(',') },
      { header: 'extraFields', get: (r) => JSON.stringify(r.extraFields ?? []) },
      { header: 'isActive', get: (r) => r.isActive },
    ],
    fromImport: (c, ctx) => {
      let extra: unknown;
      if (c.extraFields) {
        try {
          extra = JSON.parse(c.extraFields);
        } catch {
          throw new Error('extraFields is not valid JSON');
        }
      }
      return {
        code: c.code,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        icon: opt(c.icon),
        sortOrder: c.sortOrder ? Number(c.sortOrder) : undefined,
        glAccountId: lookup(ctx.glAccounts, c.glNumber, 'GL account'),
        quantityFieldKey: opt(c.quantityFieldKey),
        unitPriceMin: opt(c.unitPriceMin),
        unitPriceMax: opt(c.unitPriceMax),
        minAttachments: c.minAttachments ? Number(c.minAttachments) : undefined,
        maxAttachments: c.maxAttachments ? Number(c.maxAttachments) : undefined,
        maxAmountWarning: opt(c.maxAmountWarning),
        approvalRoleIds: c.approvalRoleCodes
          ? c.approvalRoleCodes
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => lookup(ctx.roles, s, 'role'))
          : undefined,
        extraFields: extra,
        isActive: bool(c.isActive),
      };
    },
  },
};

function mapDbError(e: unknown): never {
  const code = (e as { code?: string })?.code;
  if (code === 'P2002') throw new DomainError('CONFLICT', 'A record with the same unique value already exists');
  if (code === 'P2003') throw new DomainError('VALIDATION', 'Invalid reference to another record');
  throw e;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join('').trim();
    if (o.text !== undefined) return String(o.text).trim();
    if (o.result !== undefined) return String(o.result).trim();
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

@Injectable()
export class MasterService {
  constructor(private readonly prisma: PrismaService) {}

  cfg(r: MasterResource): Cfg {
    return CFG[r];
  }

  private async expenseRequestTypeId(db: Tx | PrismaService): Promise<string> {
    const rt = await db.requestType.findFirst({ where: { moduleKey: 'expense' }, orderBy: { createdAt: 'asc' } });
    if (!rt) throw new DomainError('INVALID_STATE', 'No expense request type configured');
    return rt.id;
  }

  private baseWhere(r: MasterResource, q: MasterListQuery, extra?: object): Row {
    const c = CFG[r];
    const and: object[] = [];
    if (r === 'expense-types') and.push({ expenseConfig: { isNot: null } });
    if (q.q) and.push({ OR: c.search.map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } })) });
    if (q.active) and.push({ isActive: q.active === '1' });
    if (c.where) and.push(c.where(q));
    if (extra) and.push(extra);
    return { AND: and };
  }

  async list(r: MasterResource, q: MasterListQuery): Promise<Paged<Row>> {
    const c = CFG[r];
    const { skip, take, page, pageSize } = pageArgs(q);
    const d = (this.prisma as Any)[c.delegate];
    const where = this.baseWhere(r, q);
    const [rows, total] = await Promise.all([
      d.findMany({ where, include: c.include, skip, take, orderBy: orderByOf(q.sort, c.sorts, c.defaultSort) }),
      d.count({ where }),
    ]);
    return paged(rows.map(c.toRow), total, page, pageSize);
  }

  async getRaw(db: Tx | PrismaService, r: MasterResource, id: string): Promise<Any> {
    const c = CFG[r];
    const row = await (db as Any)[c.delegate].findUnique({ where: { id }, include: c.include });
    if (!row || (r === 'expense-types' && !row.expenseConfig)) throw new DomainError('NOT_FOUND', 'Record not found');
    return row;
  }

  async get(r: MasterResource, id: string): Promise<Row> {
    return CFG[r].toRow(await this.getRaw(this.prisma, r, id));
  }

  private parse(r: MasterResource, body: unknown, partial: boolean): Row {
    const schema: ZodTypeAny = partial ? (masterInputSchemas[r] as Any).partial() : masterInputSchemas[r];
    const res = schema.safeParse(body);
    if (!res.success) throw new DomainError('VALIDATION', 'Validation failed', undefined, res.error.issues);
    const out = res.data as Row;
    return CFG[r].normalize ? CFG[r].normalize!(out) : out;
  }

  validate(r: MasterResource, body: unknown, partial = false): Row {
    return this.parse(r, body, partial);
  }

  async createTx(tx: Tx, r: MasterResource, input: Row, actor: Actor): Promise<Any> {
    const c = CFG[r];
    let id: string;
    try {
      if (r === 'expense-types') {
        const { glAccountId, approvalRoleIds, isActive, ...rest } = input as Any;
        const created = await tx.lineCategory.create({
          data: {
            ...rest,
            extraFields: rest.extraFields ?? [],
            isActive: isActive ?? true,
            requestTypeId: await this.expenseRequestTypeId(tx),
            expenseConfig: { create: { glAccountId } },
            approvalRoles: { create: [...new Set<string>(approvalRoleIds ?? [])].map((roleId) => ({ roleId })) },
          },
        });
        id = created.id;
      } else {
        if (r === 'treasuries' && (input as Any).isDefault) await tx.treasury.updateMany({ data: { isDefault: false } });
        id = (await (tx as Any)[c.delegate].create({ data: input })).id;
      }
    } catch (e) {
      mapDbError(e);
    }
    const after = c.toRow(await this.getRaw(tx, r, id));
    await audit(tx, { actor, action: `${r}.create`, entityType: c.entity, entityId: id, after });
    return after;
  }

  async updateTx(tx: Tx, r: MasterResource, id: string, input: Row, actor: Actor, action?: string): Promise<Any> {
    const c = CFG[r];
    const beforeRaw = await this.getRaw(tx, r, id);
    const before = c.toRow(beforeRaw);
    try {
      if (r === 'expense-types') {
        const { glAccountId, approvalRoleIds, ...rest } = input as Any;
        await tx.lineCategory.update({ where: { id }, data: rest });
        if (glAccountId) {
          await tx.expenseTypeConfig.upsert({
            where: { lineCategoryId: id },
            create: { lineCategoryId: id, glAccountId },
            update: { glAccountId },
          });
        }
        if (approvalRoleIds) {
          await tx.lineCategoryApprovalRole.deleteMany({ where: { lineCategoryId: id } });
          const ids = [...new Set<string>(approvalRoleIds)];
          if (ids.length) await tx.lineCategoryApprovalRole.createMany({ data: ids.map((roleId) => ({ lineCategoryId: id, roleId })) });
        }
      } else {
        if (r === 'treasuries' && (input as Any).isDefault) {
          await tx.treasury.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
        }
        await (tx as Any)[c.delegate].update({ where: { id }, data: input });
      }
    } catch (e) {
      mapDbError(e);
    }
    const after = c.toRow(await this.getRaw(tx, r, id));
    await audit(tx, { actor, action: action ?? `${r}.update`, entityType: c.entity, entityId: id, before, after });
    return after;
  }

  async create(r: MasterResource, body: unknown, actor: Actor): Promise<Row> {
    const input = this.parse(r, body, false);
    return this.prisma.$transaction((tx) => this.createTx(tx, r, input, actor));
  }

  async update(r: MasterResource, id: string, body: unknown, actor: Actor): Promise<Row> {
    const input = this.parse(r, body, true);
    return this.prisma.$transaction((tx) => this.updateTx(tx, r, id, input, actor));
  }

  async setActive(r: MasterResource, id: string, active: boolean, actor: Actor): Promise<Row> {
    return this.prisma.$transaction((tx) =>
      this.updateTx(tx, r, id, { isActive: active }, actor, `${r}.${active ? 'activate' : 'deactivate'}`),
    );
  }

  // ---------------- xlsx export / import ----------------

  async exportXlsx(r: MasterResource, q: MasterListQuery): Promise<Buffer> {
    const c = CFG[r];
    const rows: Any[] = await (this.prisma as Any)[c.delegate].findMany({
      where: this.baseWhere(r, q),
      include: c.include,
      orderBy: orderByOf(q.sort, c.sorts, c.defaultSort),
      take: 100000,
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(r);
    ws.columns = c.columns.map((col) => ({ header: col.header, key: col.header, width: Math.max(14, col.header.length + 4) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) {
      const vals: Row = {};
      for (const col of c.columns) {
        const v = col.get(row);
        vals[col.header] = v === undefined ? null : v;
      }
      const added = ws.addRow(vals);
      // keep phone-like values as text so leading zeros survive
      for (const col of c.columns) {
        if (['phone', 'number', 'cashGlNumber', 'glNumber', 'nationalId'].includes(col.header)) {
          added.getCell(col.header).numFmt = '@';
        }
      }
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async importCtx(): Promise<ImportCtx> {
    const p = this.prisma;
    const [vt, cc, gl, dp, ro] = await Promise.all([
      p.vehicleType.findMany(),
      p.costCenter.findMany(),
      p.glAccount.findMany(),
      p.department.findMany(),
      p.role.findMany(),
    ]);
    return {
      vehicleTypes: new Map(vt.map((x) => [x.code, x.id])),
      costCenters: new Map(cc.map((x) => [x.code, x.id])),
      glAccounts: new Map(gl.map((x) => [x.number, x.id])),
      departments: new Map(dp.map((x) => [x.code, x.id])),
      roles: new Map(ro.map((x) => [x.code, x.id])),
    };
  }

  async importXlsx(r: MasterResource, file: Buffer, dryRun: boolean, actor: Actor): Promise<ImportResult> {
    const c = CFG[r];
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
    } catch {
      throw new DomainError('VALIDATION', 'The file is not a valid .xlsx workbook');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new DomainError('VALIDATION', 'The workbook has no sheet');
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col] = cellText(cell.value);
    });
    if (!headers.includes(c.key)) {
      throw new DomainError('VALIDATION', `Missing required column "${c.key}" in the header row`);
    }
    const ctx = await this.importCtx();
    const errors: { row: number; message: string }[] = [];
    const plan: { row: number; input: Row; existingId: string | null }[] = [];
    const seen = new Set<string>();
    const delegate = (this.prisma as Any)[c.delegate];
    const existingAll: Any[] = await delegate.findMany({ select: { id: true, [c.key]: true } });
    const existing = new Map<string, string>(existingAll.map((e) => [String(e[c.key]), e.id]));

    for (let n = 2; n <= ws.rowCount; n++) {
      const wr = ws.getRow(n);
      const cells: Record<string, string> = {};
      let any = false;
      wr.eachCell({ includeEmpty: false }, (cell, col) => {
        const h = headers[col];
        if (!h) return;
        const t = cellText(cell.value);
        if (t !== '') any = true;
        cells[h] = t;
      });
      if (!any) continue;
      try {
        const keyVal = cells[c.key];
        if (!keyVal) throw new Error(`"${c.key}" is empty`);
        if (seen.has(keyVal)) throw new Error(`Duplicate ${c.key} "${keyVal}" in the file`);
        seen.add(keyVal);
        const raw = c.fromImport(cells, ctx);
        for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];
        const existingId = existing.get(keyVal) ?? null;
        const input = this.parse(r, raw, existingId !== null);
        if (existingId === null && r === 'expense-types' && !input.glAccountId) throw new Error('glNumber is required');
        plan.push({ row: n, input, existingId });
      } catch (e) {
        const msg =
          e instanceof DomainError && Array.isArray(e.details)
            ? (e.details as { path: (string | number)[]; message: string }[]).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
            : e instanceof Error
              ? e.message
              : String(e);
        errors.push({ row: n, message: msg });
      }
    }
    const created = plan.filter((p) => !p.existingId).length;
    const updated = plan.length - created;
    if (!dryRun && errors.length === 0 && plan.length > 0) {
      await this.prisma.$transaction(
        async (tx) => {
          for (const p of plan) {
            try {
              if (p.existingId) await this.updateTx(tx, r, p.existingId, p.input, actor, `${r}.import_update`);
              else await this.createTx(tx, r, p.input, actor);
            } catch (e) {
              throw new DomainError('VALIDATION', `Row ${p.row}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          await audit(tx, { actor, action: `${r}.import`, entityType: c.entity, meta: { created, updated } });
        },
        { timeout: 60000 },
      );
    }
    const applied = !dryRun && errors.length > 0;
    return { created: applied ? 0 : created, updated: applied ? 0 : updated, errors, dryRun };
  }
}
