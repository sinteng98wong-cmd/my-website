import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LicensesClient } from "./LicensesClient";

export default async function LicensesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");

  const [clinics, licenseTypes, doctors] = await Promise.all([
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.licenseType.findMany({ where: { isActive: true }, orderBy: [{ scope: "asc" }, { order: "asc" }] }),
    prisma.staffProfile.findMany({
      where: { user: { role: "DOCTOR", active: true } },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return (
    <LicensesClient
      clinics={clinics}
      licenseTypes={licenseTypes}
      staffOptions={doctors.map(d => ({ id: d.id, name: d.user.name }))}
      role={role}
    />
  );
}
