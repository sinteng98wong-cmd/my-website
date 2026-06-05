import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { TreatmentPlansClient } from "./TreatmentPlansClient";

export default async function TreatmentPlansPage({
  searchParams,
}: {
  searchParams: { status?: string; clinicId?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN","CLINIC_MANAGER","DOCTOR","RECEPTIONIST"].includes(role)) redirect("/dashboard");

  const clinicId = searchParams.clinicId ?? getSelectedClinicId() ?? "";

  const [clinics, doctors] = await Promise.all([
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "DOCTOR", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <TreatmentPlansClient
      clinics={clinics}
      doctors={doctors}
      initialClinicId={clinicId}
      initialStatus={searchParams.status ?? ""}
      role={role}
    />
  );
}
