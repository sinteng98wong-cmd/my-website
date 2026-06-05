import { PaymentMethod } from "@prisma/client";
import { prisma } from "./prisma";

// Sensible fallback settlement timing (days until money is actually received)
// used when no PaymentMethodConfig row exists for a clinic/method.
export const DEFAULT_SETTLEMENT_DAYS: Record<PaymentMethod, number> = {
  CASH_CURRENT: 0,   // collected at the counter today
  CASH_NEXT:    30,  // banked in next month
  CREDIT_CARD:  2,   // merchant settlement
  FPX:          1,
  EWALLET:      1,
  ATOME:        30,  // BNPL provider remits later
  PANEL:        30,  // insurance/panel pays on terms
  DEPOSIT:      0,
};

// Default credit-card subtype when none is captured at point of sale.
export const DEFAULT_CC_SUBTYPE = "VISA_MC";

/**
 * Resolve the configured settlement-day delay for a clinic + method.
 * Prefers an exact subType match, falls back to a method-level row, then to
 * the built-in DEFAULT_SETTLEMENT_DAYS.
 */
export async function getSettlementDays(
  clinicId: string,
  method: PaymentMethod,
  subType?: string | null,
): Promise<number> {
  const configs = await prisma.paymentMethodConfig.findMany({
    where: { clinicId, method, isActive: true },
  });

  const exact = subType ? configs.find((c) => c.subType === subType) : undefined;
  const methodLevel = configs.find((c) => !c.subType) ?? configs[0];
  const chosen = exact ?? methodLevel;

  return chosen ? chosen.settlementDays : DEFAULT_SETTLEMENT_DAYS[method];
}

/**
 * Settlement delay for a specific bank/acquirer. The bank is the primary
 * driver of settlement timing (e.g. Maybank T+2). Returns null if the bank
 * is missing or inactive, so callers can fall back to the method default.
 */
export async function getBankSettlementDays(bankId: string): Promise<number | null> {
  const bank = await prisma.settlementBank.findUnique({ where: { id: bankId } });
  return bank && bank.isActive ? bank.settlementDays : null;
}

/**
 * Resolve the settlement-day delay for a payment: the chosen bank takes
 * priority; otherwise fall back to the per-method config / default.
 */
export async function resolveSettlementDays(
  clinicId: string,
  method: PaymentMethod,
  subType: string | null,
  bankId?: string | null,
): Promise<number> {
  if (bankId) {
    const bankDays = await getBankSettlementDays(bankId);
    if (bankDays != null) return bankDays;
  }
  return getSettlementDays(clinicId, method, subType);
}

/** Add a whole number of calendar days to a date (returns a new Date). */
export function computeExpectedSettlementDate(baseDate: Date, days: number): Date {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Convenience: resolve the expected settlement date for a payment given its
 * clinic, method, subType and the base date (collection date or sale date).
 */
export async function resolveExpectedSettlementDate(
  clinicId: string,
  method: PaymentMethod,
  subType: string | null,
  baseDate: Date,
): Promise<Date> {
  const days = await getSettlementDays(clinicId, method, subType);
  return computeExpectedSettlementDate(baseDate, days);
}
