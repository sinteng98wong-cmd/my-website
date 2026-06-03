import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EInvoiceManagementClient } from "./EInvoiceManagementClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function EInvoicePage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) redirect("/dashboard");

  const [batches, clinics, entities, panelProviders, recentInvoices] = await Promise.all([
    db.eInvoiceBatch.findMany({
      include: {
        clinic:        { select: { name: true } },
        panelProvider: { select: { name: true } },
        submittedBy:   { select: { name: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.clinic.findMany({
      select: { id: true, name: true, entityId: true },
      orderBy: { name: "asc" },
    }),
    prisma.entity.findMany({
      // select all — we access new fields via any
    }),
    prisma.panelProvider.findMany({
      where: { active: true },
      select: { id: true, name: true, clinicId: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        invoiceRef: true,
        total: true,
        createdAt: true,
        visit: {
          select: {
            clinic: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredInvoices = recentInvoices.filter((inv: any) => inv.eInvoiceStatus != null);

  return (
    <EInvoiceManagementClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batches={batches.map((b: any) => ({
        id: b.id,
        batchRef: b.batchRef,
        clinicName: b.clinic.name,
        panelProviderName: b.panelProvider?.name ?? null,
        submittedByName: b.submittedBy?.name ?? null,
        batchType: b.batchType,
        month: b.month,
        totalAmount: Number(b.totalAmount),
        totalSst: Number(b.totalSst),
        invoiceCount: b._count.invoices,
        status: b.status,
        myInvoisUUID: b.myInvoisUUID,
        submittedAt: b.submittedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      }))}
      clinics={clinics}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entities={entities.map((e: any) => ({
        id: e.id,
        legalName: e.legalName,
        eInvoiceEnabled: e.eInvoiceEnabled,
        hasTin: !!e.tin,
        hasCredentials: !!e.myInvoisClientId,
        environment: e.myInvoisEnvironment ?? "SANDBOX",
        hasSst: !!e.sstRegistrationNo,
        effectiveDate: e.eInvoiceEffectiveDate?.toISOString() ?? null,
      }))}
      panelProviders={panelProviders}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentInvoices={filteredInvoices.map((inv: any) => ({
        id: inv.id,
        invoiceRef: inv.invoiceRef,
        clinicName: inv.visit.clinic.name,
        eInvoiceStatus: inv.eInvoiceStatus,
        eInvoiceUUID: inv.eInvoiceUUID,
        eInvoiceQrUrl: inv.eInvoiceQrUrl,
        eInvoiceSubmittedAt: inv.eInvoiceSubmittedAt?.toISOString() ?? null,
        eInvoiceType: inv.eInvoiceType,
        total: Number(inv.total),
        createdAt: inv.createdAt.toISOString(),
      }))}
    />
  );
}
