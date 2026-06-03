import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { LeaveClient } from "./LeaveClient";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session  = await getServerSession(authOptions);
  const role     = (session?.user as any)?.role;
  const userId   = (session?.user as any)?.id;
  const clinicId = getSelectedClinicId();

  const isManager = ["SUPER_ADMIN","CLINIC_MANAGER","FINANCE"].includes(role);
  const month     = searchParams.month ?? new Date().toISOString().slice(0, 7);
  const [y, m]    = month.split("-").map(Number);
  const from      = new Date(y, m - 1, 1);
  const to        = new Date(y, m, 1);

  const [leaves, clinics] = await Promise.all([
    (prisma as any).staffLeave.findMany({
      where: {
        ...(isManager ? {} : { staffId: userId }),
        ...(clinicId ? { clinicId } : {}),
        fromDate: { gte: from, lt: to },
      },
      include: {
        staff:      { select: { id: true, name: true, role: true } },
        clinic:     { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { appliedAt: "desc" },
    }),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Leave summary counts
  const pending  = leaves.filter((l: any) => l.status === "PENDING").length;
  const approved = leaves.filter((l: any) => l.status === "APPROVED").length;
  const totalDays = leaves.filter((l: any) => l.status === "APPROVED")
    .reduce((s: number, l: any) => s + Number(l.days), 0);

  return (
    <LeaveClient
      leaves={JSON.parse(JSON.stringify(leaves))}
      clinics={clinics}
      isManager={isManager}
      userId={userId}
      month={month}
      stats={{ pending, approved, totalDays }}
    />
  );
}
