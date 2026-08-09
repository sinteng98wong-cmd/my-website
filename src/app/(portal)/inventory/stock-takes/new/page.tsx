import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, clinicScopeFor } from "@/lib/clinic-access";
import { NewStockTakeClient } from "./NewStockTakeClient";

export default async function NewStockTakePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) redirect("/dashboard");

  const scope = await clinicScopeFor(role, userId);
  if (!scope.ok) redirect("/dashboard");

  const [clinics, categories] = await Promise.all([
    prisma.clinic.findMany({
      where:   scope.clinicIds ? { id: { in: scope.clinicIds } } : {},
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    prisma.stockCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return <NewStockTakeClient clinics={clinics} categories={categories} />;
}
