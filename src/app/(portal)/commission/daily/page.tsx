import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DailySignoffClient } from "./DailySignoffClient";

export default async function DailySignoffPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role   = (session.user as any).role   as string;
  const userId = (session.user as any).id     as string;

  if (role !== "DOCTOR") redirect("/commission");

  const doctorProfile = await prisma.doctorProfile.findUnique({
    where:  { userId },
    select: { id: true },
  });
  if (!doctorProfile) redirect("/commission");

  const dateStr = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const date    = new Date(dateStr);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const [treatments, signoff] = await Promise.all([
    prisma.treatment.findMany({
      where: {
        doctorId: doctorProfile.id,
        visit: { visitDate: { gte: date, lt: nextDay }, deletedAt: null },
      },
      include: {
        treatmentType: { select: { name: true, code: true } },
        visit: {
          include: {
            clinic:  { select: { name: true } },
            patient: { select: { name: true, patientRef: true } },
          },
        },
      },
      orderBy: { visit: { visitDate: "asc" } },
    }),

    (prisma as any).doctorDailySignoff.findFirst({
      where: { doctorId: doctorProfile.id, date },
    }),
  ]);

  const rows = treatments.map(t => ({
    id:            t.id,
    patientName:   t.visit.patient.name,
    patientRef:    t.visit.patient.patientRef,
    clinicName:    t.visit.clinic.name,
    treatmentName: t.treatmentType.name,
    billedAmount:  Number(t.billedAmount),
    labFee:        Number(t.labFee),
    sst:           Number(t.sst),
    doctorSplit:   Number(t.doctorSplit),
    commission:    (
      (Number(t.billedAmount) - Number(t.labFee) - Number(t.sst)) *
      Number(t.doctorSplit) / 100
    ).toFixed(2),
  }));

  const total = rows.reduce((s, r) => s + r.billedAmount, 0);

  // ── History: last 30 days with signoff status ──────────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentSignoffs: { date: Date; signedAt: Date }[] = await (prisma as any).doctorDailySignoff.findMany({
    where:   { doctorId: doctorProfile.id, date: { gte: thirtyDaysAgo } },
    orderBy: { date: "desc" },
    take:    30,
    select:  { date: true, signedAt: true },
  });

  const signedDates = new Set(recentSignoffs.map(s => s.date.toISOString().slice(0, 10)));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Daily Sign-off</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review and confirm your treatments each day</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/commission" className="btn-outline text-sm">← Commission</Link>
        </div>
      </div>

      {/* Date selector */}
      <form className="mb-6 flex items-center gap-2">
        <input
          type="date"
          name="date"
          defaultValue={dateStr}
          max={new Date().toISOString().slice(0, 10)}
          className="form-input w-44"
        />
        <button type="submit" className="btn-outline">View</button>
      </form>

      {/* Selected date header */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-semibold text-slate-800">
          {new Date(dateStr).toLocaleDateString("en-MY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </h2>
        {signoff ? (
          <span className="badge-green text-xs">Signed</span>
        ) : treatments.length > 0 ? (
          <span className="badge-amber text-xs">Pending sign-off</span>
        ) : null}
      </div>

      <DailySignoffClient
        date={dateStr}
        treatments={rows}
        total={total}
        signoff={signoff ? { signedAt: signoff.signedAt.toISOString() } : null}
      />

      {/* Recent history */}
      {recentSignoffs.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Recent sign-offs (last 30 days)</h3>
          <div className="flex flex-wrap gap-2">
            {recentSignoffs.map(s => {
              const d = s.date.toISOString().slice(0, 10);
              return (
                <a
                  key={d}
                  href={`?date=${d}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
                >
                  ✓ {d}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
