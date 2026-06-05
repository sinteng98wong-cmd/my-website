import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlanDetailClient } from "./PlanDetailClient";

export default async function PlanDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  if (!["SUPER_ADMIN","CLINIC_MANAGER","DOCTOR","RECEPTIONIST"].includes(role)) redirect("/dashboard");

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id: params.id },
    include: {
      patient:   { select: { id: true, name: true, patientRef: true, phone: true } },
      clinic:    { select: { id: true, name: true } },
      dentist:   { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      stages: {
        orderBy: { order: "asc" },
        include: { performedBy: { select: { name: true } }, visit: { select: { id: true, visitRef: true } } },
      },
      payments: {
        orderBy: { paidAt: "asc" },
        include: { recordedBy: { select: { name: true } }, invoice: { select: { id: true, invoiceRef: true } } },
      },
    },
  });

  if (!plan) notFound();

  // Fetch today's visits for this patient (for linking stage completion)
  const today = new Date(); today.setHours(0,0,0,0);
  const visits = await prisma.visit.findMany({
    where: { patientId: plan.patientId, deletedAt: null },
    select: { id: true, visitRef: true, visitDate: true },
    orderBy: { visitDate: "desc" },
    take: 10,
  });

  return (
    <PlanDetailClient
      plan={JSON.parse(JSON.stringify(plan))}
      visits={visits.map(v => ({ ...v, visitDate: v.visitDate.toISOString() }))}
      role={role}
    />
  );
}
