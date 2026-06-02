import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";
import { AppointmentsClient } from "./AppointmentsClient";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { date?: string; clinicId?: string };
}) {
  await requirePermission("patient:manage");

  const today    = new Date().toISOString().slice(0, 10);
  const dateStr  = searchParams.date ?? today;
  const clinicId = searchParams.clinicId ?? getSelectedClinicId() ?? "";

  // MYT day window
  const dayStart = new Date(dateStr + "T00:00:00+08:00");
  const dayEnd   = new Date(dateStr + "T23:59:59+08:00");

  const [appts, clinics, doctors, patients] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        startTime: { gte: dayStart, lte: dayEnd },
        ...(clinicId ? { clinicId } : {}),
      },
      include: {
        patient: { select: { id: true, name: true, patientRef: true, phone: true } },
        doctor:  { select: { id: true, name: true } },
        clinic:  { select: { id: true, name: true } },
        visit:   { select: { id: true, visitRef: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: "DOCTOR", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.patient.findMany({
      where: notDeleted(),
      select: { id: true, name: true, patientRef: true, phone: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  const prev = new Date(dayStart); prev.setDate(prev.getDate() - 1);
  const next = new Date(dayStart); next.setDate(next.getDate() + 1);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date(dateStr + "T00:00:00").toLocaleDateString("en-MY", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>

        <div className="flex items-end gap-2">
          <form className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Branch</label>
              <select name="clinicId" defaultValue={clinicId} className="form-input w-auto">
                <option value="">All Branches</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Date</label>
              <input type="date" name="date" defaultValue={dateStr} className="form-input w-auto" />
            </div>
            <button type="submit" className="btn-outline self-end">Go</button>
          </form>

          <div className="flex gap-1 self-end">
            <Link href={`/appointments?date=${prev.toISOString().slice(0,10)}${clinicId ? `&clinicId=${clinicId}` : ""}`}
              className="btn-ghost px-2 py-2 text-sm">←</Link>
            <Link href={`/appointments?date=${today}${clinicId ? `&clinicId=${clinicId}` : ""}`}
              className="btn-ghost text-xs">Today</Link>
            <Link href={`/appointments?date=${next.toISOString().slice(0,10)}${clinicId ? `&clinicId=${clinicId}` : ""}`}
              className="btn-ghost px-2 py-2 text-sm">→</Link>
          </div>
        </div>
      </div>

      <AppointmentsClient
        initialAppts={JSON.parse(JSON.stringify(appts))}
        clinics={clinics}
        doctors={doctors}
        patients={patients}
        dateStr={dateStr}
        clinicId={clinicId}
      />
    </div>
  );
}
