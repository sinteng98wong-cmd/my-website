import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DEFAULT_CODES } from "@/lib/journal";
import { AccountCodesClient } from "./AccountCodesClient";

export default async function AccountCodesPage() {
  const session = await getServerSession(authOptions);
  if (!["SUPER_ADMIN","FINANCE"].includes((session?.user as any)?.role)) redirect("/dashboard");

  const [dbCodes, clinics] = await Promise.all([
    prisma.ledgerAccountCode.findMany({ orderBy: [{ clinicId: "asc" }, { sortOrder: "asc" }] }),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Merge: for each entry type, show DB value or default
  const rows = DEFAULT_CODES.map(def => {
    const override = dbCodes.find(d => d.clinicId === null && d.entryType === def.entryType);
    return {
      entryType:   def.entryType,
      accountCode: override?.accountCode ?? def.accountCode,
      subCode:     override?.subCode     ?? def.subCode ?? "",
      description: override?.description ?? def.description,
      module:      override?.module      ?? def.module,
      sortOrder:   def.sortOrder,
      isOverridden: !!override,
    };
  });

  return (
    <AccountCodesClient
      rows={rows}
      clinics={clinics}
      clinicOverrides={dbCodes.filter(d => d.clinicId !== null)}
    />
  );
}
