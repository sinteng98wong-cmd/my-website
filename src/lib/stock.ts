import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { DeliveryOrder, Prisma } from "@prisma/client";

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

export async function deductStock(
  clinicId: string,
  lines: { itemId: string; quantity: number }[],
  tx?: StockClient
): Promise<void> {
  await inTransaction(tx, async (client) => {
    for (const line of lines) {
      if (line.quantity <= 0) continue;

      // Conditional decrement: the row is only touched when it still holds
      // enough stock, so two concurrent dispatches cannot both succeed and
      // drive the balance negative.
      const { count } = await client.clinicStock.updateMany({
        where: { clinicId, itemId: line.itemId, quantity: { gte: line.quantity } },
        data:  { quantity: { decrement: line.quantity } },
      });

      if (count === 0) {
        const [stock, item] = await Promise.all([
          client.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId, itemId: line.itemId } } }),
          client.stockItem.findUnique({ where: { id: line.itemId }, select: { name: true } }),
        ]);
        throw new Error(
          `Insufficient stock for ${item?.name ?? line.itemId}: available ${stock?.quantity ?? 0}, requested ${line.quantity}`
        );
      }
    }
  });
}

export async function receiveStock(
  clinicId: string,
  lines: {
    itemId:      string;
    receivedQty: number;
    unitCost?:   number;
    batchNumber?: string | null;
    expiryDate?:  Date | null;
    supplierId?:  string | null;
    doLineId?:    string | null;
  }[],
  tx?: StockClient
): Promise<void> {
  await inTransaction(tx, async (client) => {
    for (const line of lines) {
      if (line.receivedQty <= 0) continue;

      // Lock the row before reading it, so a concurrent receipt cannot compute
      // its new average against a quantity this one is about to change.
      const current = await lockStockRow(client, clinicId, line.itemId);

      // Weighted-average cost update (formula unchanged)
      let newAvgCost: number | undefined;
      if (line.unitCost !== undefined && line.unitCost > 0) {
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
      if (line.batchNumber || line.expiryDate) {
        await client.stockBatch.create({
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
      }
    }
  });
}

export async function receivePoolStock(
  clinicId: string,
  lines: { itemId: string; totalQty: number }[],
  tx?: StockClient
): Promise<void> {
  await inTransaction(tx, async (client) => {
    for (const line of lines) {
      if (line.totalQty <= 0) continue;
      await lockStockRow(client, clinicId, line.itemId);
      await client.clinicStock.update({
        where: { clinicId_itemId: { clinicId, itemId: line.itemId } },
        data:  { quantity: { increment: line.totalQty } },
      });
    }
  });
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
