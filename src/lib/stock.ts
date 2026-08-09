import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { DeliveryOrder, Prisma, StockMovementType } from "@prisma/client";
import { postMovement, type LedgerSource } from "./stock-ledger";
import {
  allocateBatches,
  allocationsReconcile,
  pinnedBatchError,
  unbatchedAvailable,
  type Allocation,
} from "./stock-batch";

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

export type DeductLine = {
  itemId: string;
  quantity: number;
  /**
   * Pin the deduction to one physical batch. Nothing else may satisfy it —
   * not another batch, not unbatched stock.
   */
  batchId?: string | null;
} & LineLedger;

export type DeductOptions = LedgerSource & {
  type: StockMovementType;
  /**
   * May expired batches be depleted? True by default, because a deduction that
   * has already passed the ClinicStock check must not then be blocked by the
   * physical layer — expired stock is still transferred, counted short and
   * written off. Stock issues that must not consume expired goods pass false.
   */
  allowExpiredBatches?: boolean;
};

/** What one deducted line actually took, physically and in the ledger. */
export interface DeductOutcome {
  itemId:       string;
  postingKey:   string;
  sourceLineId: string | null;
  movementId:   string;
  allocations:  Allocation[];
}

/** A deduction that ClinicStock allows but the physical batches cannot back. */
export class BatchAllocationError extends Error {
  constructor(message: string, readonly itemId: string) {
    super(message);
    this.name = "BatchAllocationError";
  }
}

/**
 * Take stock out.
 *
 * Three things happen under one row lock, so they cannot disagree: ClinicStock
 * is decremented, the ledger movement is appended, and the physical batches
 * behind the quantity are depleted. Every stock-out in the system goes through
 * here — issues, transfers, transfer variances and stock-take shortfalls — so
 * batch quantities can never drift above the balance they belong to.
 */
export async function deductStock(
  clinicId: string,
  lines: DeductLine[],
  ledger: DeductOptions,
  tx?: StockClient
): Promise<DeductOutcome[]> {
  return inTransaction(tx, async (client) => {
    const outcomes: DeductOutcome[] = [];

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

      const allocations = await depleteBatches(client, clinicId, line, current.quantity, ledger);

      const movement = await postMovement(client, {
        ...ledger,
        type:         line.type ?? ledger.type,
        clinicId,
        itemId:       line.itemId,
        // A single-batch deduction is traceable to its batch; a split one is
        // recorded by its allocations instead of picking an arbitrary batch.
        batchId:      allocations.length === 1 ? allocations[0].batchId : null,
        quantity:     line.quantity,
        unitCost:     avgCost,
        balanceAfter,
        avgCostAfter: avgCost,
        postingKey:   line.postingKey,
        sourceLineId: line.sourceLineId ?? null,
        note:         line.note ?? ledger.note ?? null,
      });

      outcomes.push({
        itemId:       line.itemId,
        postingKey:   line.postingKey,
        sourceLineId: line.sourceLineId ?? null,
        movementId:   movement.id,
        allocations,
      });
    }

    return outcomes;
  });
}

/**
 * Deplete the physical batches behind one deduction.
 *
 * Called with the ClinicStock row lock already held, so the batch view cannot
 * be raced. `stockQty` is the pre-deduction balance, which is what makes the
 * unbatched headroom correct.
 */
async function depleteBatches(
  client: StockClient,
  clinicId: string,
  line: DeductLine,
  stockQty: number,
  ledger: DeductOptions
): Promise<Allocation[]> {
  const batches = await client.stockBatch.findMany({
    where:   { clinicId, itemId: line.itemId, remainingQty: { gt: 0 } },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
    select:  { id: true, batchNumber: true, expiryDate: true, remainingQty: true },
  });

  const { allocations, shortfall, pinned } = allocateBatches(batches, line.quantity, {
    unbatchedAvailable: unbatchedAvailable(stockQty, batches),
    allowExpired:       ledger.allowExpiredBatches ?? true,
    pinnedBatchId:      line.batchId ?? null,
  });

  if (shortfall > 0 || !allocationsReconcile(allocations, line.quantity)) {
    const item = await client.stockItem.findUnique({ where: { id: line.itemId }, select: { name: true } });
    throw new BatchAllocationError(
      pinned
        ? pinnedBatchError(pinned, line.quantity, item?.name)
        : `Not enough batch stock to cover ${item?.name ?? line.itemId}: ` +
          `${line.quantity - shortfall} allocatable, ${line.quantity} requested. ` +
          `Check batch quantities and expiry dates.`,
      line.itemId
    );
  }

  for (const a of allocations) {
    if (!a.batchId) continue;
    // Conditional decrement: a batch can never be driven below zero, even if
    // something slipped past the row lock.
    const { count } = await client.stockBatch.updateMany({
      where: { id: a.batchId, remainingQty: { gte: a.quantity } },
      data:  { remainingQty: { decrement: a.quantity } },
    });
    if (count === 0)
      throw new BatchAllocationError(
        `Batch ${a.batchNumber ?? a.batchId} no longer has ${a.quantity} available.`,
        line.itemId
      );
  }

  return allocations;
}

/** One physical batch arriving as part of a receipt line. */
export interface IncomingBatch {
  batchNumber: string | null;
  expiryDate:  Date | null;
  quantity:    number;
}

export type ReceiveLine = {
  itemId:      string;
  receivedQty: number;
  unitCost?:   number;
  batchNumber?: string | null;
  expiryDate?:  Date | null;
  supplierId?:  string | null;
  doLineId?:    string | null;
  /**
   * Batch identities arriving with this line, used by transfers to recreate at
   * the destination exactly what was depleted at source. Entries with no batch
   * number and no expiry represent unbatched source stock and create no batch
   * record — identity is carried, never invented.
   */
  batches?:    IncomingBatch[];
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

      // Create batch records for traceability + expiry tracking. A carried
      // allocation (transfer) can bring several batches in on one line; a
      // plain receipt brings at most one.
      const incoming: IncomingBatch[] = line.batches?.length
        ? line.batches
        : line.batchNumber || line.expiryDate
          ? [{ batchNumber: line.batchNumber ?? null, expiryDate: line.expiryDate ?? null, quantity: line.receivedQty }]
          : [];

      const createdIds: string[] = [];
      for (const b of incoming) {
        if (b.quantity <= 0) continue;
        // No identity to carry — this quantity was unbatched at source and
        // stays unbatched here rather than gaining a fabricated batch.
        if (!b.batchNumber && !b.expiryDate) continue;
        const batch = await client.stockBatch.create({
          data: {
            itemId:       line.itemId,
            clinicId,
            supplierId:   line.supplierId  ?? null,
            batchNumber:  b.batchNumber ?? "N/A",
            expiryDate:   b.expiryDate  ?? null,
            quantity:     b.quantity,
            remainingQty: b.quantity,
            unitCost:     line.unitCost ?? 0,
            doLineId:     line.doLineId ?? null,
          },
        });
        createdIds.push(batch.id);
      }
      const batchId = createdIds.length === 1 ? createdIds[0] : null;

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
