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
import { deductStock } from "@/lib/stock";
import { postingKeys } from "@/lib/stock-ledger";
import {
  allocateFefo,
  allocationsReconcile,
  allowsExpiredBatches,
  checkAvailability,
  movementTypeForReason,
  unbatchedAvailable,
  type Allocation,
} from "@/lib/stock-issue";
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

      // Deduct + ledger first: this takes the row lock for each (clinic,item)
      // and refuses outright if stock is short, so nothing below can oversell.
      await deductStock(
        issue.clinicId,
        issue.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
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
        },
        tx
      );

      for (const line of issue.lines) {
        // Batches are read under the ClinicStock row lock held by deductStock,
        // so this view of remainingQty cannot be raced by another issue.
        const batches = await tx.stockBatch.findMany({
          where: {
            clinicId: issue.clinicId,
            itemId: line.itemId,
            remainingQty: { gt: 0 },
            ...(line.batchId ? { id: line.batchId } : {}),
          },
          orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
        });

        const stock = await tx.clinicStock.findUnique({
          where: { clinicId_itemId: { clinicId: issue.clinicId, itemId: line.itemId } },
          select: { quantity: true, avgUnitCost: true },
        });
        // Post-deduction balance plus what this line took back = pre-issue level.
        const preIssueQty = (stock?.quantity ?? 0) + line.quantity;
        const unitCost = stock?.avgUnitCost ? Number(stock.avgUnitCost) : 0;

        const allocatable = batches.map((b) => ({
          id: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, remainingQty: b.remainingQty,
        }));

        const { allocations, shortfall } = allocateFefo(allocatable, line.quantity, {
          unbatchedAvailable: unbatchedAvailable(preIssueQty, allocatable),
          allowExpired,
        });

        if (shortfall > 0 || !allocationsReconcile(allocations, line.quantity))
          throw new Error(
            `ALLOCATION_SHORTFALL:${line.item.name}:${shortfall}`
          );

        await depleteAndRecord(tx, line.id, allocations);

        const movement = await tx.stockMovement.findUnique({
          where: { postingKey: postingKeys.stockIssue(line.id) },
          select: { id: true },
        });
        await tx.stockIssueLine.update({
          where: { id: line.id },
          data: { unitCost: unitCost.toFixed(4), movementId: movement?.id ?? null },
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
    if (msg.startsWith("ALLOCATION_SHORTFALL:")) {
      const [, itemName] = msg.split(":");
      return {
        ok: false,
        status: 409,
        error: `Not enough batch stock to cover ${itemName}. Check batch quantities and expiry before issuing.`,
      };
    }
    if (msg.startsWith("Insufficient stock"))
      return { ok: false, status: 409, error: msg };
    throw e;
  }

  return { ok: true, movements: issue.lines.length, totalQty, totalValue: Math.round(totalValue * 100) / 100 };
}

/** Decrement each allocated batch conditionally and record what was taken. */
async function depleteAndRecord(tx: any, lineId: string, allocations: Allocation[]) {
  for (const a of allocations) {
    if (a.batchId) {
      const { count } = await tx.stockBatch.updateMany({
        where: { id: a.batchId, remainingQty: { gte: a.quantity } },
        data:  { remainingQty: { decrement: a.quantity } },
      });
      if (count === 0) throw new Error(`ALLOCATION_SHORTFALL:batch ${a.batchNumber}:${a.quantity}`);
    }
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
