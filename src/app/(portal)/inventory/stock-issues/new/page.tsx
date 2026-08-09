import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, clinicScopeFor } from "@/lib/clinic-access";
import { NewStockIssueClient } from "./NewStockIssueClient";

export default async function NewStockIssuePage({ searchParams }: { searchParams: { batchId?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) redirect("/dashboard");

  const scope = await clinicScopeFor(role, userId);
  if (!scope.ok) redirect("/dashboard");

  const [clinics, items] = await Promise.all([
    prisma.clinic.findMany({
      where:   scope.clinicIds ? { id: { in: scope.clinicIds } } : {},
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    prisma.stockItem.findMany({ orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unit: true } }),
  ]);

  // Pre-fill from the expiring-stock view.
  let preset: any = null;
  if (searchParams.batchId) {
    const b = await prisma.stockBatch.findUnique({
      where: { id: searchParams.batchId },
      select: { id: true, clinicId: true, itemId: true, batchNumber: true, remainingQty: true, expiryDate: true },
    });
    if (b && (!scope.clinicIds || scope.clinicIds.includes(b.clinicId))) preset = b;
  }

  return <NewStockIssueClient clinics={clinics} items={items} preset={preset} />;
}
