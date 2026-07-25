import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { CalendarClient } from "./CalendarClient";

const VIEW_ROLES = ["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTIONIST", "DOCTOR", "NURSE", "FINANCE"];
const ADMIN      = ["SUPER_ADMIN", "CLINIC_MANAGER"];

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user) redirect("/login");
  if (!VIEW_ROLES.includes(role)) redirect("/dashboard");

  const [clinics, doctors, nurses, patientList] = await Promise.all([
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "DOCTOR", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "NURSE",  active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.patient.findMany({
      where:  { status: { not: "REJECTED" } as any },
      select: { id: true, name: true, patientRef: true },
      orderBy: { name: "asc" },
      take: 500,
    }).catch(() => []),
  ]);

  const selectedClinicId = getSelectedClinicId() ?? clinics[0]?.id ?? "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Calendar</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Appointments &amp; staff schedule — drag to reschedule, click a slot to add.
        </p>
      </div>

      <CalendarClient
        clinics={clinics}
        doctors={doctors}
        nurses={nurses}
        patients={patientList as any}
        selectedClinicId={selectedClinicId}
        canEditShifts={ADMIN.includes(role)}
      />
    </div>
  );
}
