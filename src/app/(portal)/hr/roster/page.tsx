import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WeeklyRosterClient } from "./WeeklyRosterClient";

const ADMIN = ["SUPER_ADMIN", "CLINIC_MANAGER"];

/** Monday (start of week) for a given MYT date, as YYYY-MM-DD. */
function mondayOf(dateMYT: string): string {
  const d = new Date(`${dateMYT}T00:00:00+08:00`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

export default async function RosterPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user) redirect("/login");
  if (!ADMIN.includes(role)) redirect("/dashboard");

  const branches = await prisma.clinic.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const todayMYT = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const weekStart = mondayOf(todayMYT);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Weekly Roster</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Drag shifts between days or pull staff from the pool. A staff member can&apos;t hold overlapping shifts — even across branches.
        </p>
      </div>

      <WeeklyRosterClient branches={branches} initialWeekStart={weekStart} canEdit={ADMIN.includes(role)} />
    </div>
  );
}
