import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CompaniesClient } from "./CompaniesClient";

export default async function CompaniesPage() {
  const session = await getServerSession(authOptions);
  if ((session?.user as { role?: string })?.role !== "SUPER_ADMIN") redirect("/dashboard");

  // Use raw SQL so we pick up the new extended fields regardless of Prisma client version
  const entities = await prisma.$queryRaw<Record<string, any>[]>`
    SELECT e.*,
      (SELECT COUNT(*) FROM "Clinic" c WHERE c."entityId" = e.id)::int AS "clinicCount"
    FROM "Entity" e
    ORDER BY e."legalName" ASC
  `;

  return (
    <CompaniesClient
      initial={entities.map((e) => ({
        id:                      e.id,
        legalName:               e.legalName,
        name:                    e.name ?? null,
        tradingName:             e.tradingName ?? null,
        registrationNo:          e.registrationNo ?? null,
        financialYearStartMonth: e.financialYearStartMonth ?? 1,
        sstRegistered:           e.sstRegistered ?? false,
        eInvoiceEnabled:         e.eInvoiceEnabled ?? false,
        isActive:                e.isActive ?? true,
        clinicCount:             Number(e.clinicCount ?? 0),
      }))}
    />
  );
}
