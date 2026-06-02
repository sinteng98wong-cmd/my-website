import { prisma } from "./prisma";
import { DeliveryOrder } from "@prisma/client";

export async function deductStock(
  clinicId: string,
  lines: { itemId: string; quantity: number }[]
): Promise<void> {
  // Verify stock first
  for (const line of lines) {
    const stock = await prisma.clinicStock.findUnique({
      where: { clinicId_itemId: { clinicId, itemId: line.itemId } },
    });
    const current = stock?.quantity ?? 0;
    if (current < line.quantity) {
      const item = await prisma.stockItem.findUnique({ where: { id: line.itemId }, select: { name: true } });
      throw new Error(`Insufficient stock for ${item?.name ?? line.itemId}: available ${current}, requested ${line.quantity}`);
    }
  }

  for (const line of lines) {
    await prisma.clinicStock.update({
      where: { clinicId_itemId: { clinicId, itemId: line.itemId } },
      data: { quantity: { decrement: line.quantity } },
    });
  }
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
  }[]
): Promise<void> {
  for (const line of lines) {
    if (line.receivedQty <= 0) continue;

    // Weighted-average cost update
    const current = await prisma.clinicStock.findUnique({
      where: { clinicId_itemId: { clinicId, itemId: line.itemId } },
    });

    let newAvgCost: number | undefined;
    if (line.unitCost !== undefined && line.unitCost > 0) {
      const curQty  = current?.quantity ?? 0;
      const curCost = current?.avgUnitCost ? Number(current.avgUnitCost) : line.unitCost;
      newAvgCost = curQty > 0
        ? (curQty * curCost + line.receivedQty * line.unitCost) / (curQty + line.receivedQty)
        : line.unitCost;
    }

    await prisma.clinicStock.upsert({
      where:  { clinicId_itemId: { clinicId, itemId: line.itemId } },
      update: {
        quantity: { increment: line.receivedQty },
        ...(newAvgCost !== undefined && { avgUnitCost: newAvgCost }),
      },
      create: {
        clinicId,
        itemId:      line.itemId,
        quantity:    line.receivedQty,
        parLevel:    0,
        avgUnitCost: newAvgCost ?? line.unitCost ?? null,
      },
    });

    // Create batch record for traceability + expiry tracking
    if (line.batchNumber || line.expiryDate) {
      await prisma.stockBatch.create({
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
}

export async function receivePoolStock(
  clinicId: string,
  lines: { itemId: string; totalQty: number }[]
): Promise<void> {
  for (const line of lines) {
    await prisma.clinicStock.upsert({
      where: { clinicId_itemId: { clinicId, itemId: line.itemId } },
      update: { quantity: { increment: line.totalQty } },
      create: { clinicId, itemId: line.itemId, quantity: line.totalQty, parLevel: 0 },
    });
  }
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
