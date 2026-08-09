import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { DeliveryOrder, Prisma, StockMovementType } from "@prisma/client";
import { postMovement, type LedgerSource } from "./stock-ledger";

/**
 * Prisma client or an open interactive transaction. Callers that need the
 * stock movement and their own status update to succeed or fail together pass
 * their transaction in; callers that don't get one transaction per call.
 */
export type StockClient = Prisma.TransactionClient;

/**
 * Stock movements take row locks, so a busy item can queue several callers.
 * These budgets are generous enough that a queue waits rather than aborting.
 */
const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

/** Run `fn` inside `tx` when given one, otherwise open a transaction for it. */
async function inTransaction<T>(tx: StockClient | undefined, fn: (client: StockClient) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction((client) => fn(client), TX_OPTIONS);
}

/**
 * Lock a clinic's stock row for the rest of the transaction, creating it if it
 * does not exist yet. Serialises concurrent movements on the same item so the
 * read-modify-write of quantity and average cost cannot interleave.
 *
 * This is deliberately one statement. A separate insert-then-select would let
 * a losing INSERT abort the surrounding transaction under contention; the
 * no-op DO UPDATE both resolves the conflict and takes the row lock.
 */
async function lockStockRow(
  client: StockClient,
  clinicId: string,
  itemId: string
): Promise<{ quantity: number; avgUnitCost: number | null }> {
  const rows = await client.$queryRaw<{ quantity: number; avgUnitCost: string | null }[]>`
    INSERT INTO "ClinicStock" ("id", "clinicId", "itemId", "quantity", "parLevel", "updatedAt")
    VALUES (${randomUUID()}, ${clinicId}, ${itemId}, 0, 0, NOW())
    ON CONFLICT ("clinicId", "itemId")
    DO UPDATE SET "quantity" = "ClinicStock"."quantity"
    RETURNING "quantity", "avgUnitCost"
  `;
  const row = rows[0];
  return { quantity: row?.quantity ?? 0, avgUnitCost: row?.avgUnitCost != null ? Number(row.avgUnitCost) : null };
}

/** Per-line ledger metadata every mutation must supply. */
export interface LineLedger {
  postingKey: string;
  /** Overrides the batch's default type (e.g. RECEIPT_FOC on a PO line). */
  type?: StockMovementType;
  sourceLineId?: string | null;
  note?: string | null;
}

export type DeductLine = { itemId: string; quantity: number } & LineLedger;

export async function deductStock(
  clinicId: string,
  lines: DeductLine[],
  ledger: LedgerSource & { type: StockMovementType },
  tx?: StockClient
): Promise<void> {
  await inTransaction(tx, async (client) => {
    for (const line of lines) {
      if (line.quantity <= 0) continue;

      // Lock first, then check and decrement. Holding the row lock makes the
      // check-then-write safe, and gives the ledger the exact post-balance.
      const current = await lockStockRow(client, clinicId, line.itemId);

      if (current.quantity < line.quantity) {
        const item = await client.stockItem.findUnique({ where: { id: line.itemId }, select: { name: true } });
        throw new Error(
          `Insufficient stock for ${item?.name ?? line.itemId}: available ${current.quantity}, requested ${line.quantity}`
        );
      }

      const balanceAfter = current.quantity - line.quantity;
      // Issues are valued at the weighted average in force at the time.
      const avgCost = current.avgUnitCost ?? 0;

      await client.clinicStock.update({
        where: { clinicId_itemId: { clinicId, itemId: line.itemId } },
        data:  { quantity: { decrement: line.quantity } },
      });

      await postMovement(client, {
        ...ledger,
        type:         line.type ?? ledger.type,
        clinicId,
        itemId:       line.itemId,
        quantity:     line.quantity,
        unitCost:     avgCost,
        balanceAfter,
        avgCostAfter: avgCost,
        postingKey:   line.postingKey,
        sourceLineId: line.sourceLineId ?? null,
        note:         line.note ?? ledger.note ?? null,
      });
    }
  });
}

export type ReceiveLine = {
  itemId:      string;
  receivedQty: number;
  unitCost?:   number;
  batchNumber?: string | null;
  expiryDate?:  Date | null;
  supplierId?:  string | null;
  doLineId?:    string | null;
} & LineLedger;

export async function receiveStock(
  clinicId: string,
  lines: ReceiveLine[],
  ledger: LedgerSource & { type: StockMovementType },
  tx?: StockClient
): Promise<void> {
  await inTransaction(tx, async (client) => {
    for (const line of lines) {
      if (line.receivedQty <= 0) continue;

      // Lock the row before reading it, so a concurrent receipt cannot compute
      // its new average against a quantity this one is about to change.
      const current = await lockStockRow(client, clinicId, line.itemId);

      // Weighted-average cost update (formula unchanged).
      //
      // A cost of zero is meaningful — free goods dilute the average — so the
      // test is "was a cost supplied", not "is the cost positive". Omitting
      // unitCost entirely still leaves the average alone.
      let newAvgCost: number | undefined;
      if (line.unitCost !== undefined && line.unitCost >= 0) {
        const curQty  = current.quantity;
        const curCost = current.avgUnitCost ?? line.unitCost;
        newAvgCost = curQty > 0
          ? (curQty * curCost + line.receivedQty * line.unitCost) / (curQty + line.receivedQty)
          : line.unitCost;
      }

      await client.clinicStock.update({
        where: { clinicId_itemId: { clinicId, itemId: line.itemId } },
        data: {
          quantity: { increment: line.receivedQty },
          ...(newAvgCost !== undefined && { avgUnitCost: newAvgCost }),
        },
      });

      // Create batch record for traceability + expiry tracking
      let batchId: string | null = null;
      if (line.batchNumber || line.expiryDate) {
        const batch = await client.stockBatch.create({
          data: {
            itemId:       line.itemId,
            clinicId,
            supplierId:   line.supplierId  ?? null,
            batchNumber:  line.batchNumber ?? "N/A",
            expiryDate:   line.expiryDate  ?? null,
            quantity:     line.receivedQty,
            remainingQty: line.receivedQty,
            unitCost:     line.unitCost ?? 0,
            doLineId:     line.doLineId ?? null,
          },
        });
        batchId = batch.id;
      }

      await postMovement(client, {
        ...ledger,
        type:         line.type ?? ledger.type,
        clinicId,
        itemId:       line.itemId,
        batchId,
        quantity:     line.receivedQty,
        unitCost:     line.unitCost ?? 0,
        balanceAfter: current.quantity + line.receivedQty,
        avgCostAfter: newAvgCost ?? current.avgUnitCost ?? line.unitCost ?? 0,
        postingKey:   line.postingKey,
        sourceLineId: line.sourceLineId ?? null,
        note:         line.note ?? ledger.note ?? null,
      });
    }
  });
}

export type PoolReceiveLine = { itemId: string; totalQty: number; unitCost?: number } & LineLedger;

export async function receivePoolStock(
  clinicId: string,
  lines: PoolReceiveLine[],
  ledger: LedgerSource & { type: StockMovementType },
  tx?: StockClient
): Promise<void> {
  // Pool receipts now carry cost like any other receipt, so pooled goods stop
  // entering stock at zero value.
  await receiveStock(
    clinicId,
    lines.map((l) => ({
      itemId:      l.itemId,
      receivedQty: l.totalQty,
      unitCost:    l.unitCost,
      postingKey:  l.postingKey,
      type:        l.type,
      sourceLineId: l.sourceLineId,
      note:        l.note,
    })),
    ledger,
    tx
  );
}

export async function generateDOsFromPoolOrder(
  poolOrderId: string,
  generatedById: string
): Promise<DeliveryOrder[]> {
  const pool = await prisma.poolOrder.findUniqueOrThrow({
    where: { id: poolOrderId },
    include: {
      participants: {
        include: {
          clinic: { select: { id: true, name: true } },
          items: true,
        },
      },
    },
  });

  const branchParticipants = pool.participants.filter(
    (p) => p.clinicId !== pool.initiatingClinicId
  );

  const created: DeliveryOrder[] = [];

  for (const participant of branchParticipants) {
    // Use pool ref + clinic code so DOs are traceable back to the pool
    const clinicCode = participant.clinic.name.split(" ")[0].toUpperCase();
    const doRefFinal = `DO-${pool.poRef}-${clinicCode}`;

    // Pool-generated DOs skip DRAFT/PENDING/APPROVED — the pool order itself
    // was the approval. HQ only needs to dispatch (→ IN_TRANSIT) and each
    // branch confirms receipt (→ RECEIVED).
    const do_ = await prisma.deliveryOrder.create({
      data: {
        doRef:         doRefFinal,
        fromClinicId:  pool.initiatingClinicId,
        toClinicId:    participant.clinicId,
        status:        "APPROVED",
        poolOrderId:   pool.id,
        raisedById:    generatedById,
        approvedById:  generatedById,
        approvedAt:    new Date(),
        notes:         `Auto-generated from pool order ${pool.poRef}`,
        lines: {
          create: participant.items.map((pLine) => ({
            itemId:   pLine.itemId,
            quantity: pLine.approvedQty ?? pLine.requestedQty,
            unitCost: pLine.unitCost,
          })),
        },
      },
    });
    created.push(do_);
  }

  await prisma.poolOrder.update({
    where: { id: poolOrderId },
    data: { status: "DISTRIBUTED" },
  });

  return created;
}
