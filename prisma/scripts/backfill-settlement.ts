/**
 * One-off, idempotent backfill: set expectedSettlementDate on existing
 * InvoicePayment rows that don't have one yet.
 *
 * Run: npx tsx prisma/scripts/backfill-settlement.ts
 *
 * NULL-only ⇒ safe to run repeatedly. Legacy CASH_NEXT is forced to next month
 * to preserve its original "banked in next month" meaning.
 */
import { PrismaClient, PaymentMethod } from "@prisma/client";
import { getSettlementDays, computeExpectedSettlementDate, DEFAULT_CC_SUBTYPE } from "../../src/lib/settlement";

const prisma = new PrismaClient();

async function main() {
  const payments = await prisma.invoicePayment.findMany({
    where: { expectedSettlementDate: null },
    select: {
      id: true,
      method: true,
      amount: true,
      collectedAt: true,
      settledDate: true,
      invoice: { select: { createdAt: true, visit: { select: { clinicId: true } } } },
    },
  });

  console.log(`Found ${payments.length} payment(s) needing backfill.`);
  let updated = 0;

  for (const p of payments) {
    const clinicId = p.invoice.visit.clinicId;
    const baseDate = p.collectedAt ?? p.invoice.createdAt;
    const subType  = p.method === "CREDIT_CARD" ? DEFAULT_CC_SUBTYPE : null;

    let expected: Date;
    if (p.method === "CASH_NEXT") {
      // Preserve legacy semantics: expected next calendar month.
      expected = new Date(baseDate);
      expected.setMonth(expected.getMonth() + 1);
    } else {
      const days = await getSettlementDays(clinicId, p.method as PaymentMethod, subType);
      expected = computeExpectedSettlementDate(baseDate, days);
    }

    // If it was collected same-day (days 0) and not yet marked, treat as settled.
    const days = p.method === "CASH_NEXT" ? 30 : await getSettlementDays(clinicId, p.method as PaymentMethod, subType);
    const settledNow = days === 0 && p.collectedAt != null && p.settledDate == null;

    await prisma.invoicePayment.update({
      where: { id: p.id },
      data: {
        expectedSettlementDate: expected,
        ...(settledNow ? { settledDate: p.collectedAt, settledAmount: p.amount } : {}),
      },
    });
    updated++;
  }

  console.log(`Backfilled ${updated} payment(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
