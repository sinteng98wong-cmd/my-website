import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { ScheduleClient } from "./ScheduleClient";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session   = await getServerSession(authOptions);
  const role      = (session?.user as any)?.role;
  const userId    = (session?.user as any)?.id;
  const clinicId  = getSelectedClinicId();

  const dateStr = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const date    = new Date(dateStr);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const isDoctor  = role === "DOCTOR";
  const canManage = ["SUPER_ADMIN","CLINIC_MANAGER"].includes(role);

  const [schedules, clinics, staff] = await Promise.all([
    prisma.schedule.findMany({
      where: {
        date: { gte: date, lt: nextDay },
        ...(clinicId ? { clinicId } : {}),
        ...(isDoctor ? { doctorId: userId } : {}),
      },
      include: {
        clinic:       { select: { id: true, name: true } },
        doctor:       { select: { id: true, name: true } },
        nurse:        { select: { id: true, name: true } },
        receptionist: { select: { id: true, name: true } },
      },
      orderBy: [{ clinicId: "asc" }, { startTime: "asc" }],
    }),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { active: true, role: { in: ["DOCTOR","NURSE","RECEPTIONIST","CLINIC_MANAGER"] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <ScheduleClient
      schedules={JSON.parse(JSON.stringify(schedules))}
      clinics={clinics}
      staff={staff}
      dateStr={dateStr}
      canManage={canManage}
    />
  );
}
