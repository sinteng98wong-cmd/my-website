import { prisma } from "./prisma";

// ── Balance ───────────────────────────────────────────────────────────────────

/** Current wallet balance for a patient (TOPUP − UTILIZATION − REFUND). */
export async function getDepositBalance(patientId: string): Promise<number> {
  const rows = await (prisma as any).patientDeposit.findMany({
    where: { patientId },
    select: { type: true, amount: true },
  });
  return rows.reduce((sum: number, r: { type: string; amount: any }) => {
    const n = Number(r.amount);
    return r.type === "TOPUP" ? sum + n : sum - n;
  }, 0);
}

// ── Reference generators ──────────────────────────────────────────────────────

export async function genDepositRef(): Promise<string> {
  const now   = new Date();
  const ym    = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const count = await (prisma as any).patientDeposit.count({
    where: { createdAt: { gte: start, lt: end } },
  });
  return `DEP-${ym}-${String(count + 1).padStart(3, "0")}`;
}

export async function genSalesReturnRef(): Promise<string> {
  const now   = new Date();
  const ym    = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const count = await (prisma as any).salesReturn.count({
    where: { createdAt: { gte: start, lt: end } },
  });
  return `RTN-${ym}-${String(count + 1).padStart(3, "0")}`;
}

// ── Ledger posting ────────────────────────────────────────────────────────────

const LEDGER_COL: Record<string, string | null> = {
  CASH_CURRENT: "cashCurrent",
  CASH_NEXT:    "cashNext",
  CREDIT_CARD:  "creditCard",
  FPX:          "fpx",
  EWALLET:      "ewallet",
  ATOME:        "atome",
  PANEL:        null,
  DEPOSIT:      null,
};

/**
 * Upsert the DailyLedger for a deposit transaction.
 *
 * TOPUP            → increments payment-method column + depositTopup
 * REFUND (regular) → increments depositRefund
 * REFUND (treatment failure) → increments depositRefund + salesReturn
 *   (salesReturn represents revenue reversal for the original period's invoice)
 */
export async function postDepositToLedger(opts: {
  clinicId:          string;
  date:              Date;
  type:              "TOPUP" | "REFUND";
  amount:            number;
  paymentMethod?:    string;
  isTreatmentFailure?: boolean;
  updatedById?:      string;
}): Promise<void> {
  const { clinicId, date, type, amount, paymentMethod, isTreatmentFailure, updatedById } = opts;

  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  const increment: Record<string, any> = {};

  if (type === "TOPUP") {
    const col = paymentMethod ? (LEDGER_COL[paymentMethod] ?? null) : null;
    if (col) increment[col] = { increment: amount };
    increment["depositTopup"] = { increment: amount };
  } else {
    // All refunds go to depositRefund (cash out)
    increment["depositRefund"] = { increment: amount };
    // Treatment failures additionally post as sales return (revenue reversal)
    if (isTreatmentFailure) {
      increment["salesReturn"] = { increment: amount };
    }
  }

  if (Object.keys(increment).length === 0) return;

  const isTopup = type === "TOPUP";
  await (prisma.dailyLedger as any).upsert({
    where:  { clinicId_date: { clinicId, date: day } },
    create: {
      clinicId,
      date:            day,
      patientCount:    0,
      professionalFee: 0,
      productSales:    0,
      sst:             0,
      totalSales:      0,
      cashCurrent:     isTopup && paymentMethod === "CASH_CURRENT" ? amount : 0,
      cashNext:        isTopup && paymentMethod === "CASH_NEXT"    ? amount : 0,
      creditCard:      isTopup && paymentMethod === "CREDIT_CARD"  ? amount : 0,
      fpx:             isTopup && paymentMethod === "FPX"          ? amount : 0,
      ewallet:         isTopup && paymentMethod === "EWALLET"      ? amount : 0,
      atome:           isTopup && paymentMethod === "ATOME"        ? amount : 0,
      depositTopup:    isTopup ? amount : 0,
      depositRefund:   !isTopup ? amount : 0,
      salesReturn:     (!isTopup && isTreatmentFailure) ? amount : 0,
      panelCollections: {},
      updatedBy:       updatedById ?? null,
    },
    update: {
      ...increment,
      updatedBy: updatedById ?? undefined,
    },
  });
}
