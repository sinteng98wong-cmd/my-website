import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CompanyDetailClient } from "./CompanyDetailClient";
import { maskCredential } from "@/lib/encrypt";

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as { role?: string })?.role !== "SUPER_ADMIN") redirect("/dashboard");

  // Raw SQL so we get all extended columns regardless of Prisma client version
  const rows = await prisma.$queryRaw<Record<string, any>[]>`
    SELECT * FROM "Entity" WHERE id = ${params.id} LIMIT 1
  `;
  if (!rows.length) redirect("/admin/companies");
  const e = rows[0];

  const clinics = await (prisma as any).clinic.findMany({
    where: { entityId: params.id },
    select: {
      id: true, name: true, isHQ: true, slug: true,
      address: true, city: true, state: true, postcode: true,
      phone: true, email: true,
      directorId: true, picId: true,
      director: { select: { id: true, name: true } },
      pic:      { select: { id: true, name: true } },
    },
    orderBy: [{ isHQ: "desc" }, { name: "asc" }],
  }).catch(() => []);

  return (
    <CompanyDetailClient
      entity={{
        id:                      e.id,
        legalName:               e.legalName,
        name:                    e.name ?? null,
        tradingName:             e.tradingName ?? null,
        registrationNo:          e.registrationNo ?? null,
        oldRegistrationNo:       e.oldRegistrationNo ?? null,
        incorporationDate:       e.incorporationDate ? new Date(e.incorporationDate).toISOString() : null,
        address:                 e.address ?? null,
        city:                    e.city ?? null,
        state:                   e.state ?? null,
        postcode:                e.postcode ?? null,
        country:                 e.country ?? "Malaysia",
        phone:                   e.phone ?? null,
        email:                   e.email ?? null,
        website:                 e.website ?? null,
        logoUrl:                 e.logoUrl ?? null,
        financialYearStartMonth: e.financialYearStartMonth ?? 1,
        sstRegistered:           e.sstRegistered ?? false,
        sstRegistrationNo:       e.sstRegistrationNo ?? null,
        sstEffectiveDate:        e.sstEffectiveDate ? new Date(e.sstEffectiveDate).toISOString() : null,
        sstFilingFrequency:      e.sstFilingFrequency ?? "BI_MONTHLY",
        eInvoiceEnabled:         e.eInvoiceEnabled ?? false,
        tin:                     e.tin ?? null,
        myInvoisClientId:        e.myInvoisClientId  ? maskCredential(e.myInvoisClientId)  : null,
        myInvoisClientSecret:    e.myInvoisClientSecret ? maskCredential(e.myInvoisClientSecret) : null,
        myInvoisEnvironment:     e.myInvoisEnvironment ?? "SANDBOX",
        eInvoiceEffectiveDate:   e.eInvoiceEffectiveDate ? new Date(e.eInvoiceEffectiveDate).toISOString() : null,
        directorName:            e.directorName ?? null,
        directorIcNo:            e.directorIcNo ?? null,
        bankName:                e.bankName ?? null,
        bankAccountNo:           e.bankAccountNo ?? null,
        bankAccountName:         e.bankAccountName ?? null,
        isActive:                e.isActive ?? true,
        panelEnabled:            e.panelEnabled ?? false,
        sstOnForeigner:          e.sstOnForeigner ?? false,
        pvMode:                  e.pvMode ?? "PER_CLINIC",
        clinics,
      }}
    />
  );
}
