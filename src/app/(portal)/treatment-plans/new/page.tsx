import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { NewPlanClient } from "./NewPlanClient";

export default async function NewTreatmentPlanPage() {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  const userId  = (session?.user as any)?.id;
  if (!["SUPER_ADMIN","CLINIC_MANAGER","DOCTOR"].includes(role)) redirect("/treatment-plans");

  const clinicId = getSelectedClinicId() ?? "";

  const [clinics, doctors, treatmentTypes] = await Promise.all([
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "DOCTOR", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.treatmentType.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <NewPlanClient
      clinics={clinics}
      doctors={doctors}
      treatmentTypes={treatmentTypes}
      initialClinicId={clinicId}
      initialDentistId={role === "DOCTOR" ? userId : ""}
      isDoctor={role === "DOCTOR"}
    />
  );
}
