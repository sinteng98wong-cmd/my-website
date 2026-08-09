import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, clinicScopeFor } from "@/lib/clinic-access";
import { OpeningBalanceListClient } from "./OpeningBalanceListClient";

export default async function OpeningBalancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) redirect("/dashboard");

  const scope = await clinicScopeFor(role, userId);
  if (!scope.ok) redirect("/dashboard");

  const clinics = await prisma.clinic.findMany({
    where:   scope.clinicIds ? { id: { in: scope.clinicIds } } : {},
    orderBy: { name: "asc" },
    select:  { id: true, name: true },
  });

  return <OpeningBalanceListClient clinics={clinics} role={role} />;
}
