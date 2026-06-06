import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { ReconClient } from "./ReconClient";

export default async function ReconciliationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");

  const clinicId = getSelectedClinicId();

  const [clinics, panelProviders] = await Promise.all([
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    clinicId
      ? prisma.panelProvider.findMany({
          where: { clinicId, active: true },
          select: { id: true, name: true, code: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Default month = current month
  const now          = new Date();
  const defaultMonth = now.toISOString().slice(0, 7);

  return (
    <ReconClient
      clinics={clinics}
      panelProviders={panelProviders}
      initialClinicId={clinicId ?? clinics[0]?.id ?? ""}
      initialMonth={defaultMonth}
      role={role}
    />
  );
}
