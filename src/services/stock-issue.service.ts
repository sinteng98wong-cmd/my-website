/**
 * Stock Issue posting.
 *
 * One transaction per issue. `deductStock` takes the ClinicStock row lock,
 * validates sufficiency and appends the ledger movement; batch depletion then
 * happens under that same lock, so concurrent issues of the same item cannot
 * over-allocate a batch or drive stock negative.
 *
 * FEFO picks the batch. Weighted average — untouched by an issue — supplies
 * the value.
 */
import { prisma } from "@/lib/prisma";
import { BatchAllocationError, deductStock, type DeductOutcome } from "@/lib/stock";
import { postingKeys } from "@/lib/stock-ledger";
import { allowsExpiredBatches, checkAvailability, movementTypeForReason } from "@/lib/stock-issue";
import type { Allocation } from "@/lib/stock-batch";
import type { StockIssueReason } from "@prisma/client";

export type PostOutcome =
  | { ok: true; movements: number; totalQty: number; totalValue: number }
  | { ok: false; status: number; error: string };

/**
 * Post a stock issue: deduct, deplete batches FEFO, record the allocations.
 *
 * Idempotent — the per-line posting key collides rather than double-issuing,
 * and the status claim inside the transaction stops a concurrent second post.
 */
export async function postStockIssue(stockIssueId: string, userId: string): Promise<PostOutcome> {
  const issue = await prisma.stockIssue.findUnique({
    where: { id: stockIssueId },
    include: { lines: { include: { item: { select: { name: true } } } } },
  });
  if (!issue) return { ok: false, status: 404, error: "Not found" };

  const movementType = movementTypeForReason(issue.reason as StockIssueReason);
  const allowExpired = allowsExpiredBatches(issue.reason as StockIssueReason);
  const fromStatus = issue.status;

  let totalQty = 0;
  let totalValue = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the post first so two concurrent requests cannot both proceed.
      const claimed = await tx.stockIssue.updateMany({
        where: { id: issue.id, status: fromStatus },
        data: { status: "POSTED", postedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("STOCK_ISSUE_ALREADY_POSTED");

      // One controlled mutation: the row lock, the sufficiency check, the
      // ledger movement and the physical batch depletion all happen here.
      // A pinned line is satisfied by that batch alone — deductStock refuses
      // rather than quietly topping up from elsewhere.
      const outcomes = await deductStock(
        issue.clinicId,
        issue.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          batchId: l.batchId ?? null,
          postingKey: postingKeys.stockIssue(l.id),
          sourceLineId: l.id,
          note: l.note ?? issue.reason,
        })),
        {
          type: movementType,
          sourceType: issue.reason === "CLINICAL_CONSUMPTION" || issue.reason === "GENERAL_USAGE" || issue.reason === "OTHER"
            ? "STOCK_ISSUE"
            : "WRITE_OFF",
          sourceId: issue.id,
          reference: issue.reference,
          userId,
          allowExpiredBatches: allowExpired,
        },
        tx
      );

      const byLine = new Map<string, DeductOutcome>(outcomes.map((o) => [o.sourceLineId!, o]));

      for (const line of issue.lines) {
        const outcome = byLine.get(line.id);
        if (!outcome) continue;

        // The weighted average in force at the time of the issue, which is
        // exactly what the ledger movement was valued at.
        const stock = await tx.clinicStock.findUnique({
          where: { clinicId_itemId: { clinicId: issue.clinicId, itemId: line.itemId } },
          select: { avgUnitCost: true },
        });
        const unitCost = stock?.avgUnitCost ? Number(stock.avgUnitCost) : 0;

        await recordAllocations(tx, line.id, outcome.allocations);

        await tx.stockIssueLine.update({
          where: { id: line.id },
          data: { unitCost: unitCost.toFixed(4), movementId: outcome.movementId },
        });

        totalQty += line.quantity;
        totalValue += Math.round(line.quantity * unitCost * 100) / 100;
      }

      await tx.stockIssue.update({
        where: { id: issue.id },
        data: {
          totalQty,
          totalValue: (Math.round(totalValue * 100) / 100).toFixed(2),
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "STOCK_ISSUE_ALREADY_POSTED")
      return { ok: false, status: 409, error: "This stock issue has already been posted" };
    if (e instanceof BatchAllocationError) return { ok: false, status: 409, error: e.message };
    if (msg.startsWith("Insufficient stock"))
      return { ok: false, status: 409, error: msg };
    throw e;
  }

  return { ok: true, movements: issue.lines.length, totalQty, totalValue: Math.round(totalValue * 100) / 100 };
}

/**
 * Record what each line physically took. The batches themselves were already
 * depleted by deductStock under the row lock; this is the audit trail.
 */
async function recordAllocations(tx: any, lineId: string, allocations: Allocation[]) {
  for (const a of allocations) {
    await tx.stockIssueAllocation.create({
      data: {
        lineId,
        batchId: a.batchId,
        batchNumber: a.batchNumber,
        expiryDate: a.expiryDate,
        quantity: a.quantity,
      },
    });
  }
}

/** Availability check before a line is accepted, so the UI fails early. */
export async function checkLineAvailability(clinicId: string, itemId: string, quantity: number) {
  const [stock, item] = await Promise.all([
    prisma.clinicStock.findUnique({
      where: { clinicId_itemId: { clinicId, itemId } },
      select: { quantity: true },
    }),
    prisma.stockItem.findUnique({ where: { id: itemId }, select: { name: true } }),
  ]);
  return checkAvailability(stock?.quantity ?? 0, quantity, item?.name);
}
