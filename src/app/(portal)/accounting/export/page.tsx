import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccountingExportClient } from "./AccountingExportClient";

export default async function AccountingExportPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;

  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    redirect("/dashboard");
  }

  const userId = (session.user as any).id as string;

  let clinics: { id: string; name: string }[];
  if (role === "SUPER_ADMIN" || role === "FINANCE") {
    clinics = await prisma.clinic.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } else {
    const userClinics = await prisma.userClinic.findMany({
      where: { userId },
      include: { clinic: { select: { id: true, name: true } } },
    });
    clinics = userClinics.map((uc) => uc.clinic);
  }

  return (
    <AccountingExportClient
      clinics={clinics}
      role={role}
    />
  );
}
