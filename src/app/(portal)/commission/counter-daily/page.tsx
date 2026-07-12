import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { CounterDailyClient, type CounterRow } from "./CounterDailyClient";

const COUNTER_ROLES = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE", "RECEPTIONIST", "NURSE"];

export default async function CounterDailyPage({
  searchParams,
}: {
  searchParams: { day?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user) redirect("/login");
  if (!COUNTER_ROLES.includes(role)) redirect("/dashboard");

  const clinicId = getSelectedClinicId() ?? "";
  const todayMYT = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? "") ? searchParams.day! : todayMYT;

  const dayStart = new Date(`${day}T00:00:00+08:00`);
  const dayEnd   = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const clinic = clinicId
    ? await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } })
    : null;

  // Every treatment recorded that day at the clinic (all doctors).
  // NOTE: we deliberately select NO commission/entitlement fields — the counter
  // only reconciles billed vs collected cash.
  const treatments = await prisma.treatment.findMany({
    where: {
      visit: {
        visitDate: { gte: dayStart, lt: dayEnd },
        deletedAt: null,
        ...(clinicId ? { clinicId } : {}),
      },
    },
    select: {
      id: true,
      billedAmount: true,
      collectedAmount: true,
      treatmentType: { select: { name: true } },
      doctor: { select: { id: true, user: { select: { name: true } } } },
      visit: { select: { patient: { select: { name: true, patientRef: true } } } },
      locumPayoutLines: {
        select: { id: true, counterVerifiedAt: true, doctorVerifiedAt: true, status: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: CounterRow[] = treatments.map(t => {
    // A treatment may have a line per doctor; the counter cares about the cash,
    // so treat the treatment as one row and verify all its lines together.
    const lines = t.locumPayoutLines;
    const anyLine = lines[0] ?? null;
    const allVerified = lines.length > 0 && lines.every(l => !!l.counterVerifiedAt);
    return {
      id:            t.id,
      lineIds:       lines.map(l => l.id),
      patientName:   t.visit.patient.name,
      patientRef:    t.visit.patient.patientRef,
      doctorId:      t.doctor?.id ?? "unassigned",
      doctorName:    t.doctor?.user.name ?? "Unassigned",
      treatmentName: t.treatmentType.name,
      billed:        Number(t.billedAmount),
      collected:     Number(t.collectedAmount),
      hasLine:       lines.length > 0,
      counterVerified: allVerified,
      paid:          anyLine?.status === "PAID",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Daily Collection Verification</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Reconcile the day&apos;s billed and collected amounts{clinic ? ` for ${clinic.name}` : ""}, then verify the cash.
        </p>
      </div>

      <CounterDailyClient day={day} clinicId={clinicId} rows={rows} />
    </div>
  );
}
