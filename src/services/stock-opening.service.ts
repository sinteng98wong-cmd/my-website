/**
 * Opening Balance — posting.
 *
 * One transaction per document. Posting goes through `receiveStock`, the same
 * path a purchase order receipt uses, so ClinicStock quantity, the running
 * average, batch creation, the immutable ledger and the period lock all behave
 * identically. Nothing here writes a movement or a balance directly.
 *
 * With no prior stock the weighted-average formula inside receiveStock reduces
 * to `avgUnitCost = unitCost`, which is exactly the opening semantics: the
 * entered cost becomes the position's cost basis, and `balanceAfter` is the
 * entered quantity because the position started at zero.
 */
import { prisma } from "@/lib/prisma";
import { receiveStock } from "@/lib/stock";
import { postingKeys } from "@/lib/stock-ledger";
import { isPostable, totalsOf, type OpeningLine } from "@/lib/stock-opening";

export type PostResult =
  | { ok: true; postedLines: number; totalQuantity: number; totalValue: number }
  | { ok: false; status: number; error: string };

/**
 * Items that already carry ledger history at this clinic.
 *
 * An opening balance is meant to establish the first position, so any item
 * with an existing movement is refused rather than stacked on top. The unique
 * posting key would already stop a second *opening*, but not a receipt or an
 * adjustment that landed first — this closes that gap.
 */
export async function itemsWithExistingMovements(
  clinicId: string,
  itemIds: string[]
): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const rows = await prisma.stockMovement.findMany({
    where:  { clinicId, itemId: { in: itemIds } },
    select: { itemId: true },
    distinct: ["itemId"],
  });
  return rows.map((r) => r.itemId);
}

/**
 * Approve and post an opening balance.
 *
 * The approval is claimed inside the same transaction as the postings, so two
 * approvals arriving together cannot both post — the loser sees zero rows
 * updated and rolls back having written nothing.
 */
export async function approveOpeningBalance(
  openingBalanceId: string,
  approverId: string
): Promise<PostResult> {
  const doc = await prisma.openingBalance.findUnique({
    where: { id: openingBalanceId },
    include: { lines: { include: { item: { select: { name: true } } } } },
  });
  if (!doc) return { ok: false, status: 404, error: "Opening balance not found" };
  if (doc.status !== "SUBMITTED")
    return { ok: false, status: 409, error: `Cannot approve a ${doc.status} opening balance` };

  const lines: (OpeningLine & { id: string; itemName: string })[] = doc.lines.map((l) => ({
    id: l.id,
    itemId: l.itemId,
    itemName: l.item.name,
    quantity: l.quantity,
    unitCost: l.unitCost === null ? null : Number(l.unitCost),
    batchNumber: l.batchNumber,
    expiryDate: l.expiryDate,
  }));

  const postable = lines.filter(isPostable);
  if (postable.length === 0)
    return { ok: false, status: 422, error: "Nothing to post — every line is zero" };

  // Refuse if any item already has ledger history at this clinic.
  const clashes = await itemsWithExistingMovements(doc.clinicId, postable.map((l) => l.itemId));
  if (clashes.length) {
    const names = postable.filter((l) => clashes.includes(l.itemId)).map((l) => l.itemName);
    return {
      ok: false,
      status: 409,
      error:
        `${names.length} item(s) already have stock movements at this clinic and cannot take an ` +
        `opening balance: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}. ` +
        `Use a stock adjustment or a stock take instead.`,
    };
  }

  const totals = totalsOf(lines);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.openingBalance.updateMany({
      where: { id: doc.id, status: "SUBMITTED" },
      data: {
        status: "APPROVED",
        reviewedById: approverId,
        reviewedAt: new Date(),
        postedAt: new Date(),
        totalQuantity: totals.quantity,
        totalValue: totals.value,
      },
    });
    if (claimed.count === 0) throw new Error("OPENING_BALANCE_NOT_SUBMITTED");

    // The single posting path. Batch rows are created only where the branch
    // supplied a batch number or expiry — receiveStock never invents one.
    await receiveStock(
      doc.clinicId,
      postable.map((l) => ({
        itemId:      l.itemId,
        receivedQty: l.quantity!,
        unitCost:    l.unitCost!,
        postingKey:  postingKeys.opening(doc.clinicId, l.itemId),
        sourceLineId: l.id,
        batchNumber: l.batchNumber ?? undefined,
        expiryDate:  l.expiryDate ? new Date(l.expiryDate) : undefined,
        type:        "OPENING_BALANCE" as const,
      })),
      {
        type: "OPENING_BALANCE",
        sourceType: "OPENING_BALANCE",
        sourceId: doc.id,
        reference: doc.reference,
        userId: approverId,
        note: "Opening balance",
      },
      tx
    );

    // Freeze what was posted onto each line and link the movement.
    for (const l of postable) {
      const movement = await tx.stockMovement.findUnique({
        where:  { postingKey: postingKeys.opening(doc.clinicId, l.itemId) },
        select: { id: true },
      });
      await tx.openingBalanceLine.update({
        where: { id: l.id },
        data: {
          postedQty: l.quantity!,
          postedUnitCost: l.unitCost!,
          movementId: movement?.id ?? null,
        },
      });
    }
  }, { maxWait: 15_000, timeout: 30_000 });

  return {
    ok: true,
    postedLines: postable.length,
    totalQuantity: totals.quantity,
    totalValue: totals.value,
  };
}

/** Next document reference for a clinic-month. */
export async function nextOpeningRef(period: string): Promise<string> {
  const prefix = `OB-${period.replace("-", "")}-`;
  const last = await prisma.openingBalance.findFirst({
    where:  { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  const n = last ? parseInt(last.reference.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}
