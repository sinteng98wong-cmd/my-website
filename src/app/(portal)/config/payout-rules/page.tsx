import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SCHEMES, DEFAULT_SCAN_RATES } from "@/services/locum-payout.service";
import { PayoutRulesClient } from "./PayoutRulesClient";

export default async function PayoutRulesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) redirect("/dashboard");

  const [clinics, saved, savedScans] = await Promise.all([
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    (prisma as any).payoutScheme.findMany({ orderBy: [{ name: "asc" }] }).catch(() => []),
    (prisma as any).payoutScanRate.findMany({ orderBy: [{ code: "asc" }] }).catch(() => []),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Payout Release Rules</h1>
        <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
          Configure how each case type releases the doctor&apos;s entitlement stage by stage.
          Rules apply to all clinics by default; save a clinic-specific copy to override
          for one branch (e.g. ortho released by patient payment progress).
        </p>
      </div>

      <PayoutRulesClient
        clinics={clinics}
        saved={(saved as any[]).map((s: any) => ({
          id: s.id, clinicId: s.clinicId, name: s.name,
          matchCodes: s.matchCodes, subTypes: s.subTypes,
          paymentTracked: s.paymentTracked, stages: s.stages, active: s.active,
        }))}
        defaults={DEFAULT_SCHEMES}
        savedScans={(savedScans as any[]).map((s: any) => ({
          clinicId: s.clinicId, code: s.code, label: s.label, rate: Number(s.rate), active: s.active,
        }))}
        defaultScans={DEFAULT_SCAN_RATES}
      />
    </div>
  );
}
