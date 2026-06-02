import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayrollCalcClient } from "./PayrollCalcClient";

export default async function PayrollCalcPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");

  const month = searchParams.month ?? new Date().toISOString().slice(0, 7);

  // Load all doctor profiles with their type and name for the selector
  const doctors = await prisma.doctorProfile.findMany({
    include: {
      user:        { select: { name: true, email: true } },
      engagements: { where: { month }, select: { sessionsWorked: true, guaranteedFloor: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const doctorList = doctors.map(d => ({
    id:              d.id,
    name:            d.user.name,
    email:           d.user.email,
    type:            d.type as string,
    defaultRate:     Number(d.defaultRate),
    dayRate:         d.dayRate ? Number(d.dayRate) : null,
    engagement:      d.engagements[0]
      ? { sessionsWorked: d.engagements[0].sessionsWorked, guaranteedFloor: Number(d.engagements[0].guaranteedFloor) }
      : null,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Payroll Calculator</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Calculate final payout per doctor across all three pay-type structures
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={month} className="form-input w-auto" />
          <button type="submit" className="btn-primary">Apply</button>
        </form>
      </div>

      <PayrollCalcClient doctors={doctorList} month={month} canCommit={["SUPER_ADMIN", "FINANCE"].includes(role)} />
    </div>
  );
}
