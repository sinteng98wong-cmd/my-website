/**
 * Stock Take approval — posts the counted variances into the ledger.
 *
 * Everything goes through the existing atomic mutation helpers, so adjustments
 * take the same row lock, the same weighted-average rules and the same
 * immutable StockMovement path as receipts and transfers. Nothing here touches
 * ClinicStock directly.
 */
import { prisma } from "@/lib/prisma";
import { deductStock, receiveStock } from "@/lib/stock";
import { postingKeys } from "@/lib/stock-ledger";
import { detectDrift, movementTypeFor, varianceOf, varianceValue, type DriftedLine } from "@/lib/stock-take";

export type ApprovalOutcome =
  | { ok: true; posted: number; movements: number; varianceQty: number; varianceValue: number }
  | { ok: false; status: number; error: string; drifted?: DriftedLine[] };

/** Current quantity and average cost for a set of items at one clinic. */
async function currentStock(clinicId: string, itemIds: string[]) {
  const rows = await prisma.clinicStock.findMany({
    where: { clinicId, itemId: { in: itemIds } },
    select: { itemId: true, quantity: true, avgUnitCost: true },
  });
  const qty = new Map<string, number>();
  const cost = new Map<string, number>();
  for (const r of rows) {
    qty.set(r.itemId, r.quantity);
    cost.set(r.itemId, r.avgUnitCost ? Number(r.avgUnitCost) : 0);
  }
  for (const id of itemIds) {
    if (!qty.has(id)) { qty.set(id, 0); cost.set(id, 0); }
  }
  return { qty, cost };
}

/**
 * Approve a submitted stock take and post its adjustments.
 *
 * Refuses when stock has moved since the count: applying the counted variance
 * against a changed balance would silently discard whatever happened in
 * between, so the take is sent back for a recount against current figures.
 */
export async function approveStockTake(
  stockTakeId: string,
  approverId: string
): Promise<ApprovalOutcome> {
  const take = await prisma.stockTake.findUnique({
    where: { id: stockTakeId },
    include: { lines: true },
  });
  if (!take) return { ok: false, status: 404, error: "Not found" };

  const itemIds = take.lines.map((l) => l.itemId);
  const { qty, cost } = await currentStock(take.clinicId, itemIds);

  // Concurrency gate — the counted system quantity must still hold.
  const drifted = detectDrift(take.lines, qty);
  if (drifted.length) {
    await prisma.$transaction(async (tx) => {
      for (const d of drifted) {
        await tx.stockTakeLine.update({
          where: { id: d.lineId },
          data:  { systemQty: d.currentSystemQty, physicalQty: null, countedAt: null, countedById: null },
        });
      }
      await tx.stockTake.update({
        where: { id: take.id },
        data:  { status: "RECOUNT_REQUIRED" },
      });
    });
    return {
      ok: false,
      status: 409,
      error:
        `Stock moved for ${drifted.length} item(s) since this count was taken. ` +
        `The affected lines have been refreshed to the current system quantity and must be re-counted before approval.`,
      drifted,
    };
  }

  // Only lines that actually move stock post a movement.
  const postable = take.lines
    .map((l) => ({ line: l, variance: varianceOf(l) ?? 0 }))
    .filter((x) => x.variance !== 0);

  const increases = postable.filter((x) => x.variance > 0);
  const decreases = postable.filter((x) => x.variance < 0);

  const source = {
    sourceType: "STOCK_TAKE" as const,
    sourceId: take.id,
    reference: take.reference,
    userId: approverId,
  };

  let varianceQtyTotal = 0;
  let varianceValueTotal = 0;

  await prisma.$transaction(async (tx) => {
    // Claim the approval inside the same transaction as the postings, so a
    // concurrent second approval cannot post the same adjustments twice.
    const claimed = await tx.stockTake.updateMany({
      where: { id: take.id, status: "SUBMITTED" },
      data: {
        status: "APPROVED",
        reviewedById: approverId,
        reviewedAt: new Date(),
        postedAt: new Date(),
      },
    });
    if (claimed.count === 0) throw new Error("STOCK_TAKE_NOT_SUBMITTED");

    if (increases.length) {
      await receiveStock(
        take.clinicId,
        increases.map(({ line, variance }) => ({
          itemId: line.itemId,
          receivedQty: variance,
          // Found stock enters at the average in force, leaving costing unmoved.
          unitCost: cost.get(line.itemId) ?? 0,
          postingKey: postingKeys.stockTake(line.id),
          sourceLineId: line.id,
          note: line.reason ?? undefined,
        })),
        { ...source, type: "ADJUSTMENT_IN" },
        tx
      );
    }

    if (decreases.length) {
      await deductStock(
        take.clinicId,
        decreases.map(({ line, variance }) => ({
          itemId: line.itemId,
          quantity: Math.abs(variance),
          postingKey: postingKeys.stockTake(line.id),
          sourceLineId: line.id,
          note: line.reason ?? undefined,
        })),
        { ...source, type: "ADJUSTMENT_OUT" },
        tx
      );
    }

    // Freeze what was posted onto each line, and link the movement.
    for (const { line, variance } of postable) {
      const unitCost = cost.get(line.itemId) ?? 0;
      varianceQtyTotal += variance;
      varianceValueTotal += varianceValue(variance, unitCost);

      const movement = await tx.stockMovement.findUnique({
        where: { postingKey: postingKeys.stockTake(line.id) },
        select: { id: true },
      });
      await tx.stockTakeLine.update({
        where: { id: line.id },
        data: {
          postedVarianceQty: variance,
          postedUnitCost: unitCost.toFixed(4),
          movementId: movement?.id ?? null,
        },
      });
    }

    await tx.stockTake.update({
      where: { id: take.id },
      data: {
        totalVarianceQty: varianceQtyTotal,
        totalVarianceValue: (Math.round(varianceValueTotal * 100) / 100).toFixed(2),
      },
    });
  });

  return {
    ok: true,
    posted: postable.length,
    movements: increases.length + decreases.length,
    varianceQty: varianceQtyTotal,
    varianceValue: Math.round(varianceValueTotal * 100) / 100,
  };
}

/** Snapshot the current system quantity and cost for a set of items. */
export async function buildStockTakeLines(clinicId: string, itemIds: string[]) {
  const { qty, cost } = await currentStock(clinicId, itemIds);
  return itemIds.map((itemId) => ({
    itemId,
    systemQty: qty.get(itemId) ?? 0,
    avgUnitCost: (cost.get(itemId) ?? 0).toFixed(4),
  }));
}

/** Refresh the snapshot after drift, so a recount is against current figures. */
export async function refreshStockTakeSnapshot(stockTakeId: string) {
  const take = await prisma.stockTake.findUniqueOrThrow({
    where: { id: stockTakeId },
    include: { lines: true },
  });
  const { qty, cost } = await currentStock(take.clinicId, take.lines.map((l) => l.itemId));

  await prisma.$transaction(
    take.lines.map((l) =>
      prisma.stockTakeLine.update({
        where: { id: l.id },
        data: {
          systemQty: qty.get(l.itemId) ?? 0,
          avgUnitCost: (cost.get(l.itemId) ?? 0).toFixed(4),
        },
      })
    )
  );
}

export { movementTypeFor };
