import { prisma } from "./prisma";
import type { ClaimType } from "@prisma/client";

export const DEFAULT_CLAIM_LIMITS: Record<string, { limit: number; period: "MONTHLY" | "YEARLY" | "PER_TRIP" }> = {
  MEDICAL:       { limit: 500,  period: "YEARLY" },
  TRANSPORT:     { limit: 300,  period: "MONTHLY" },
  MEAL:          { limit: 200,  period: "MONTHLY" },
  ACCOMMODATION: { limit: 500,  period: "PER_TRIP" },
  TRAINING:      { limit: 2000, period: "YEARLY" },
  UNIFORM:       { limit: 300,  period: "YEARLY" },
  TELEPHONE:     { limit: 100,  period: "MONTHLY" },
  OTHER:         { limit: 500,  period: "MONTHLY" },
};

export async function getEffectiveLimit(claimType: ClaimType): Promise<{ limitAmount: number; period: string }> {
  const row = await prisma.claimLimit.findUnique({ where: { claimType } });
  if (row && row.isActive) return { limitAmount: Number(row.limitAmount), period: row.period };
  const def = DEFAULT_CLAIM_LIMITS[claimType] ?? { limit: 500, period: "MONTHLY" };
  return { limitAmount: def.limit, period: def.period };
}

/** Total claims of a type for a staff in a period (excludes REJECTED). */
export async function getClaimUsage(
  staffProfileId: string,
  claimType: ClaimType,
  year: number,
  month?: number
): Promise<number> {
  const start = month ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1));
  const end   = month ? new Date(Date.UTC(year, month, 1))     : new Date(Date.UTC(year + 1, 0, 1));

  const agg = await prisma.staffClaim.aggregate({
    where: {
      staffProfileId, claimType,
      status: { in: ["SUBMITTED", "APPROVED", "PAID"] },
      receiptDate: { gte: start, lt: end },
    },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

export async function checkClaimLimit(
  staffProfileId: string,
  claimType: ClaimType,
  amount: number,
  receiptDate: Date
): Promise<{ withinLimit: boolean; limitAmount: number; usedAmount: number; remainingAmount: number; period: string }> {
  const { limitAmount, period } = await getEffectiveLimit(claimType);
  const year = receiptDate.getUTCFullYear();
  const month = receiptDate.getUTCMonth() + 1;

  // PER_TRIP limits apply per claim, not cumulatively
  const usedAmount = period === "PER_TRIP" ? 0 : await getClaimUsage(staffProfileId, claimType, year, period === "MONTHLY" ? month : undefined);

  const remainingAmount = Math.max(0, limitAmount - usedAmount);
  const withinLimit = amount <= remainingAmount || (period === "PER_TRIP" && amount <= limitAmount);

  return { withinLimit, limitAmount, usedAmount, remainingAmount, period };
}
