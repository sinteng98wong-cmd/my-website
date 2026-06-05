import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { requirePermission } from "@/lib/rbac";
import { VisitClient } from "./VisitClient";

export default async function VisitPage({ params }: { params: { id: string } }) {
  await requirePermission("patient:manage");

  const [visit, treatmentTypes, vendors, doctors, panelProviders] = await Promise.all([
    prisma.visit.findUnique({
      where: notDeleted({ id: params.id }),
      include: {
        patient: { select: { id: true, name: true, patientRef: true, phone: true, isForeigner: true } },
        clinic:  { select: { id: true, name: true } },
        treatments: {
          include: {
            treatmentType: { select: { id: true, name: true, defaultPrice: true } },
            doctor: { include: { user: { select: { id: true, name: true } } } },
            labJob: { select: { id: true, labJobRef: true, status: true, vendor: { select: { name: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
        invoices: {
          include: {
            payments: { include: { panelProvider: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
        appointment: { select: { id: true, apptRef: true, type: true } },
      },
    }),
    prisma.treatmentType.findMany({ orderBy: { name: "asc" } }),
    prisma.labVendor.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "DOCTOR", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.panelProvider.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
  ]);

  const banks = await prisma.settlementBank.findMany({
    where: { isActive: true },
    select: { id: true, name: true, settlementDays: true },
    orderBy: { name: "asc" },
  });

  if (!visit) notFound();

  const visitSafe        = JSON.parse(JSON.stringify(visit));
  const typesSafe        = treatmentTypes.map(t => ({ ...t, defaultPrice: Number(t.defaultPrice) }));

  return (
    <div>
      <div className="mb-6">
        <Link href={`/patients/${visit.patient.id}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← {visit.patient.name}
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="page-title">Visit Entry</h1>
          <span className="badge-slate font-mono">{visit.visitRef}</span>
        </div>
      </div>

      <VisitClient
        visit={visitSafe}
        treatmentTypes={typesSafe}
        vendors={vendors}
        doctors={doctors}
        panelProviders={panelProviders}
        banks={banks}
      />
    </div>
  );
}
