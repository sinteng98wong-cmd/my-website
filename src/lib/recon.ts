import { prisma } from "./prisma";

/** Returns true if the given clinic/month has a LOCKED MonthlyRecon record. */
export async function isMonthLocked(clinicId: string, month: string): Promise<boolean> {
  const recon = await prisma.monthlyRecon.findUnique({
    where:  { clinicId_month: { clinicId, month } },
    select: { status: true },
  });
  return recon?.status === "LOCKED";
}

/** Format a Date as "YYYY-MM" */
export function toMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}
