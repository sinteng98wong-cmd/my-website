import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";
import { BatchesClient } from "./BatchesClient";

export default async function StockBatchesPage({
  searchParams,
}: {
  searchParams: { clinicId?: string };
}) {
  await requirePermission("stock:manage");

  const clinics = await prisma.clinic.findMany({
    orderBy: { name: "asc" },
    select:  { id: true, name: true },
  });

  const selectedId = searchParams.clinicId ?? getSelectedClinicId() ?? clinics[0]?.id;

  const batches = selectedId
    ? await prisma.stockBatch.findMany({
        where:   { clinicId: selectedId, remainingQty: { gt: 0 } },
        include: {
          item:     { select: { id: true, name: true, sku: true, unit: true, category: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: [{ expiryDate: "asc" }, { item: { name: "asc" } }],
      })
    : [];

  const now = new Date();
  const d30  = new Date(now); d30.setDate(d30.getDate() + 30);
  const d90  = new Date(now); d90.setDate(d90.getDate() + 90);

  const expired       = batches.filter((b) => b.expiryDate && b.expiryDate < now);
  const expiring30    = batches.filter((b) => b.expiryDate && b.expiryDate >= now && b.expiryDate <= d30);
  const expiring90    = batches.filter((b) => b.expiryDate && b.expiryDate > d30 && b.expiryDate <= d90);
  const noExpiry      = batches.filter((b) => !b.expiryDate);
  const ok            = batches.filter((b) => b.expiryDate && b.expiryDate > d90);

  return (
    <BatchesClient
      clinics={clinics}
      selectedClinicId={selectedId ?? ""}
      batches={batches.map((b) => ({
        id:          b.id,
        batchNumber: b.batchNumber,
        expiryDate:  b.expiryDate?.toISOString() ?? null,
        quantity:    b.quantity,
        remainingQty: b.remainingQty,
        unitCost:    Number(b.unitCost),
        receivedAt:  b.receivedAt.toISOString(),
        item:        b.item,
        supplier:    b.supplier,
      }))}
      summary={{ expired: expired.length, expiring30: expiring30.length, expiring90: expiring90.length, ok: ok.length, noExpiry: noExpiry.length }}
    />
  );
}
