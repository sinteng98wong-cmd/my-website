import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUserClinics } from "@/lib/selected-clinic";
import { headNurseClinicIds } from "@/lib/payroll-config";
import { AttendanceClient } from "./AttendanceClient";

export default async function AttendancePage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  // Designated Head Nurses reach this page for their own branch so they can
  // review and submit the month; everything else stays manager-only.
  const headNurseClinics = isManager ? [] : await headNurseClinicIds(userId);
  if (!isManager && headNurseClinics.length === 0) redirect("/dashboard");

  const clinics = isManager
    ? await getUserClinics()
    : await prisma.clinic.findMany({ where: { id: { in: headNurseClinics } }, select: { id: true, name: true } });

  return <AttendanceClient clinics={clinics.map(c => ({ id: c.id, name: c.name }))} />;
}
