import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SupplierLedgerClient } from "./SupplierLedgerClient";

export default async function SupplierLedgerPage({
  params,
}: {
  params: { id: string };
}) {
  await requirePermission("stock:manage");

  const [supplier, invoices, payments] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: params.id } }),
    prisma.stockInvoice.findMany({
      where:   { supplierId: params.id },
      include: {
        deliveryOrders: { select: { id: true, doRef: true, toClinic: { select: { name: true } } } },
        fromEntity:     { select: { legalName: true } },
        purchaseOrder:  { select: { poRef: true } },
      },
      orderBy: { issuedAt: "asc" },
    }),
    prisma.supplierPayment.findMany({
      where:   { supplierId: params.id },
      orderBy: { paidAt: "asc" },
    }),
  ]);

  if (!supplier) redirect("/inventory/suppliers");

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount) + Number(i.sst), 0);
  const totalPaid     = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <SupplierLedgerClient
      supplier={supplier}
      invoices={invoices.map((i) => ({
        id:          i.id,
        invoiceRef:  i.invoiceRef,
        month:       i.month,
        poRef:       i.purchaseOrder?.poRef ?? null,
        entity:      i.fromEntity.legalName,
        branches:    [...new Set(i.deliveryOrders.map((d) => d.toClinic.name))].join(", "),
        doCount:     i.deliveryOrders.length,
        amount:      Number(i.totalAmount),
        sst:         Number(i.sst),
        total:       Number(i.totalAmount) + Number(i.sst),
        invoiceDate: i.issuedAt?.toISOString() ?? null,
      }))}
      payments={payments.map((p) => ({
        id:        p.id,
        amount:    Number(p.amount),
        paidAt:    p.paidAt.toISOString(),
        reference: p.reference ?? null,
        notes:     p.notes     ?? null,
      }))}
      totalInvoiced={totalInvoiced}
      totalPaid={totalPaid}
    />
  );
}
