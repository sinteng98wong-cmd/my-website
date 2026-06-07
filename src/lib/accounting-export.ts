import { prisma } from "./prisma";
import { PaymentMethod } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SalesBookRow {
  date: string;          // DD/MM/YYYY
  invoiceNo: string;
  debtor: string;        // clinic name
  profFees: number;
  sst: number;
  products: number;
  total: number;
}

export interface CashReceivedRow {
  ref: string;
  debtor: string;
  grossAmount: number;
  sstAmount: number;
  serviceCharge: number;
  netReceived: number;
  tag: string;           // "CURRENT" | "DEFERRED"
  method: string;
  invoiceMonth: string;
  settlementMonth: string;
  isLocked: boolean;
  lockedByName?: string;
  id: string;
}

export interface AccountingExportSummary {
  totalProfFees: number;
  totalSST: number;
  totalProducts: number;
  totalSales: number;
  invoiceCount: number;
  totalCashCurrent: number;
  totalCashDeferred: number;
  totalCashReceived: number;
  totalServiceCharges: number;
  outstandingBalance: number;
  byMethod: { method: string; grossAmount: number; serviceCharge: number; netReceived: number }[];
}

// ── Month helpers ─────────────────────────────────────────────────────────────

export function monthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

function prevMonth(year: number, month: number): string {
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

function yyyyMM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ── Sales Book ────────────────────────────────────────────────────────────────

export async function getSalesBook(clinicId: string, year: number, month: number): Promise<SalesBookRow[]> {
  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 1);

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
  const debtor = clinic?.name ?? "Clinic";

  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: from, lt: to },
      visit: { clinicId },
    },
    include: {
      visit: {
        include: {
          treatments: { select: { billedAmount: true, sst: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return invoices.map((inv) => {
    const profFees = inv.visit.treatments.reduce((s, t) => s + Number(t.billedAmount), 0);
    const sst = Number(inv.sst);
    const products = Math.max(0, Number(inv.total) - profFees - sst);
    const total = profFees + sst + products;

    return {
      date: new Date(inv.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }),
      invoiceNo: inv.invoiceRef,
      debtor,
      profFees,
      sst,
      products,
      total,
    };
  });
}

// ── Cash Received ─────────────────────────────────────────────────────────────

export async function getCashReceived(clinicId: string, year: number, month: number): Promise<CashReceivedRow[]> {
  const settlementMonth = yyyyMM(year, month);

  const entries = await (prisma as any).accountingLedgerEntry.findMany({
    where: { clinicId, settlementMonth },
    include: {
      lockedBy: { select: { name: true } },
      panelProvider: { select: { name: true } },
    },
    orderBy: [{ method: "asc" }, { tag: "asc" }],
  });

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
  const debtor = clinic?.name ?? "Clinic";

  return entries.map((e: any) => ({
    id: e.id,
    ref: e.ref,
    debtor,
    grossAmount: Number(e.grossAmount),
    sstAmount: Number(e.sstAmount),
    serviceCharge: Number(e.serviceCharge),
    netReceived: Number(e.netReceived),
    tag: e.tag,
    method: methodLabel(e.method, e.subType, e.panelProvider?.name),
    invoiceMonth: monthLabel(e.invoiceMonth),
    settlementMonth: monthLabel(e.settlementMonth),
    isLocked: e.isLocked,
    lockedByName: e.lockedBy?.name,
  }));
}

export function methodLabel(method: PaymentMethod, subType?: string | null, panelName?: string | null): string {
  if (method === "PANEL" && panelName) return `Panel — ${panelName}`;
  if (method === "CREDIT_CARD" && subType === "AMEX") return "CC (Amex)";
  if (method === "CREDIT_CARD") return "CC (Visa/MC)";
  const labels: Record<string, string> = {
    CASH_CURRENT: "Cash", CASH_NEXT: "Cash (Next Day)", FPX: "FPX",
    EWALLET: "eWallet", ATOME: "Atome", DEPOSIT: "Deposit",
  };
  return labels[method] ?? method;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export async function getAccountingSummary(clinicId: string, year: number, month: number): Promise<AccountingExportSummary> {
  const [salesBook, cashRows] = await Promise.all([
    getSalesBook(clinicId, year, month),
    getCashReceived(clinicId, year, month),
  ]);

  const totalProfFees = salesBook.reduce((s, r) => s + r.profFees, 0);
  const totalSST      = salesBook.reduce((s, r) => s + r.sst, 0);
  const totalProducts = salesBook.reduce((s, r) => s + r.products, 0);
  const totalSales    = totalProfFees + totalSST + totalProducts;

  const current  = cashRows.filter((r) => r.tag === "CURRENT");
  const deferred = cashRows.filter((r) => r.tag === "DEFERRED");

  const totalCashCurrent  = current.reduce((s, r) => s + r.netReceived, 0);
  const totalCashDeferred = deferred.reduce((s, r) => s + r.netReceived, 0);
  const totalCashReceived = totalCashCurrent + totalCashDeferred;
  const totalServiceCharges = cashRows.reduce((s, r) => s + r.serviceCharge, 0);

  const byMethodMap: Record<string, { grossAmount: number; serviceCharge: number; netReceived: number }> = {};
  for (const r of cashRows) {
    if (!byMethodMap[r.method]) byMethodMap[r.method] = { grossAmount: 0, serviceCharge: 0, netReceived: 0 };
    byMethodMap[r.method].grossAmount   += r.grossAmount;
    byMethodMap[r.method].serviceCharge += r.serviceCharge;
    byMethodMap[r.method].netReceived   += r.netReceived;
  }

  return {
    totalProfFees,
    totalSST,
    totalProducts,
    totalSales,
    invoiceCount: salesBook.length,
    totalCashCurrent,
    totalCashDeferred,
    totalCashReceived,
    totalServiceCharges,
    outstandingBalance: totalSales - totalCashReceived,
    byMethod: Object.entries(byMethodMap).map(([method, v]) => ({ method, ...v })),
  };
}

// ── Generate Ledger Entries ───────────────────────────────────────────────────

export async function generateLedgerEntries(
  clinicId: string,
  year: number,
  month: number,
  generatedById: string,
) {
  const settlementMonthStr = yyyyMM(year, month);
  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 1);

  const lock = await (prisma as any).accountingMonthLock.findFirst({ where: { clinicId, month: settlementMonthStr } });
  if (lock) throw new Error(`Month ${settlementMonthStr} is locked. Cannot regenerate.`);

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) throw new Error("Clinic not found");

  const configs = await (prisma as any).paymentMethodConfig.findMany({ where: { clinicId, isActive: true } });
  const getConfig = (method: PaymentMethod, subType?: string | null) =>
    configs.find((c: any) => c.method === method && (subType ? c.subType === subType : !c.subType || c.subType === null)) ??
    configs.find((c: any) => c.method === method);

  const payments = await prisma.invoicePayment.findMany({
    where: {
      collectedAt: { gte: from, lt: to },
      invoice: { deletedAt: null, visit: { clinicId } },
    },
    include: {
      invoice: {
        select: {
          sst: true,
          total: true,
          createdAt: true,
        },
      },
      panelProvider: { select: { id: true, name: true } },
    },
  });

  type Bucket = {
    method: PaymentMethod;
    subType: string | null;
    panelProviderId: string | null;
    panelProvider: { id: string; name: string; serviceChargeRate: any; isSstApplicable: boolean } | null;
    invoiceMonth: string;
    gross: number;
    sst: number;
  };

  const buckets = new Map<string, Bucket>();

  for (const p of payments) {
    const invoiceMonth = new Date(p.invoice.createdAt).toISOString().slice(0, 7);
    let subType: string | null = null;
    if (p.method === "CREDIT_CARD") subType = "VISA_MC";

    const panelId = p.panelProviderId ?? null;
    const key = `${p.method}|${subType}|${panelId}|${invoiceMonth}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        method: p.method,
        subType,
        panelProviderId: panelId,
        panelProvider: p.panelProvider as any,
        invoiceMonth,
        gross: 0,
        sst: 0,
      });
    }
    const b = buckets.get(key)!;
    b.gross += Number(p.amount);
    const invTotal = Number(p.invoice.total) || 1;
    const invSst   = Number(p.invoice.sst);
    if (p.method === "PANEL" && p.panelProvider && !(p.panelProvider as any).isSstApplicable) {
      // no sst for this panel
    } else {
      b.sst += (Number(p.amount) / invTotal) * invSst;
    }
  }

  const created: any[] = [];

  for (const [, b] of buckets) {
    const tag = b.invoiceMonth === settlementMonthStr ? "CURRENT" : "DEFERRED";
    const isDeferred = tag === "DEFERRED";

    const monthShort = new Date(year, month - 1, 1)
      .toLocaleDateString("en-MY", { month: "short", year: "numeric" })
      .replace(" ", "");

    let ref: string;
    if (b.method === "CASH_CURRENT" || b.method === "CASH_NEXT") {
      ref = `Cash-${monthShort}`;
    } else if (b.method === "CREDIT_CARD" && b.subType === "AMEX") {
      const im = new Date(Number(b.invoiceMonth.split("-")[0]), Number(b.invoiceMonth.split("-")[1]) - 1, 1)
        .toLocaleDateString("en-MY", { month: "short", year: "numeric" }).replace(" ", "");
      ref = isDeferred ? `CC-Amex-${im}-2` : `CC-Amex-${monthShort}`;
    } else if (b.method === "CREDIT_CARD") {
      const im = new Date(Number(b.invoiceMonth.split("-")[0]), Number(b.invoiceMonth.split("-")[1]) - 1, 1)
        .toLocaleDateString("en-MY", { month: "short", year: "numeric" }).replace(" ", "");
      ref = isDeferred ? `CC-${im}-2` : `CC-${monthShort}`;
    } else if (b.method === "FPX") {
      ref = isDeferred ? `FPX-${monthShort}-2` : `FPX-${monthShort}`;
    } else if (b.method === "EWALLET") {
      ref = isDeferred ? `eWallet-${monthShort}-2` : `eWallet-${monthShort}`;
    } else if (b.method === "ATOME") {
      ref = isDeferred ? `Atome-${monthShort}-2` : `Atome-${monthShort}`;
    } else if (b.method === "PANEL" && b.panelProvider) {
      const pName = b.panelProvider.name.replace(/\s+/g, "");
      ref = isDeferred ? `Panel-${pName}-${monthShort}-2` : `Panel-${pName}-${monthShort}`;
    } else {
      ref = `${b.method}-${monthShort}`;
    }

    const existingLocked = await (prisma as any).accountingLedgerEntry.findFirst({
      where: { ref, isLocked: true },
    });

    let chargeRate = 0;
    if (b.method === "PANEL" && b.panelProvider) {
      chargeRate = Number(b.panelProvider.serviceChargeRate);
    } else {
      const cfg = getConfig(b.method, b.subType);
      chargeRate = cfg ? Number(cfg.chargeRate) : 0;
    }

    const serviceCharge = Math.round(b.gross * chargeRate / 100 * 100) / 100;
    const sstRounded    = Math.round(b.sst * 100) / 100;
    const netReceived   = Math.round((b.gross + sstRounded - serviceCharge) * 100) / 100;

    if (existingLocked) {
      created.push({ ref, skipped: true, reason: "locked" });
      continue;
    }

    const entry = await (prisma as any).accountingLedgerEntry.upsert({
      where: { ref },
      create: {
        clinicId,
        ref,
        method: b.method,
        subType: b.subType,
        panelProviderId: b.panelProviderId,
        invoiceMonth: b.invoiceMonth,
        settlementMonth: settlementMonthStr,
        tag,
        grossAmount: b.gross,
        sstAmount: sstRounded,
        serviceCharge,
        netReceived,
        createdById: generatedById,
        updatedById: generatedById,
      },
      update: {
        grossAmount: b.gross,
        sstAmount: sstRounded,
        serviceCharge,
        netReceived,
        tag,
        updatedById: generatedById,
      },
    });
    created.push(entry);
  }

  return created;
}
