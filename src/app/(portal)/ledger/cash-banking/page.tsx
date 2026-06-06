import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";
import { CashBankingClient } from "./CashBankingClient";

export default async function CashBankingPage({
  searchParams,
}: {
  searchParams: { month?: string; clinicId?: string };
}) {
  await requirePermission("ledger:view");

  const month    = searchParams.month    ?? new Date().toISOString().slice(0, 7);
  const clinicId = searchParams.clinicId ?? getSelectedClinicId() ?? "";

  const [year, mon] = month.split("-").map(Number);
  const from = new Date(year, mon - 1, 1);
  const to   = new Date(year, mon, 0, 23, 59, 59);

  const [ledgerEntries, bankRecords, clinics] = await Promise.all([
    prisma.dailyLedger.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(clinicId ? { clinicId } : {}),
        cashCurrent: { gt: 0 },
      },
      include: { clinic: { select: { id: true, name: true } } },
      orderBy: [{ clinicId: "asc" }, { date: "asc" }],
    }),
    prisma.cashBanking.findMany({
      where: {
        periodFrom: { gte: from, lte: to },
        ...(clinicId ? { clinicId } : {}),
      },
      include: { clinic: { select: { name: true } } },
      orderBy: { bankInDate: "desc" },
    }),
    prisma.clinic.findMany({
      select: { id: true, name: true, bankName: true, bankAccountNo: true, bankAccountName: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const ledgerDays = ledgerEntries.map(e => ({
    date:        e.date.toISOString().slice(0, 10),
    clinicId:    e.clinicId,
    clinicName:  e.clinic.name,
    cashCurrent: Number(e.cashCurrent),
  }));

  const bankRecordsSafe = bankRecords.map(r => ({
    id:              r.id,
    clinicId:        r.clinicId,
    clinicName:      r.clinic.name,
    clinicBankName:  r.clinic.bankName ?? undefined,
    periodFrom:      r.periodFrom.toISOString().slice(0, 10),
    periodTo:        r.periodTo.toISOString().slice(0, 10),
    expectedCash:    Number(r.expectedCash),
    bankInAmount:    Number(r.bankInAmount),
    variance:        Number(r.variance),
    bankInDate:      r.bankInDate.toISOString().slice(0, 10),
    depositType:     r.depositType,
    referenceNo:     r.referenceNo ?? undefined,
    notes:           r.notes       ?? undefined,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="mb-1">
            <Link href="/ledger" className="text-sm text-slate-500 hover:text-slate-700">← Collection Ledger</Link>
          </div>
          <h1 className="page-title">Cash Banking</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track cash collected vs. banked into clinic account — {month}
          </p>
        </div>

        <form className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Branch</label>
            <select name="clinicId" defaultValue={clinicId} className="form-input w-auto">
              <option value="">All Branches</option>
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Month</label>
            <input type="month" name="month" defaultValue={month} className="form-input w-auto" />
          </div>
          <button type="submit" className="btn-outline self-end">Apply</button>
        </form>
      </div>

      <CashBankingClient
        clinics={clinics}
        ledgerDays={ledgerDays}
        bankRecords={bankRecordsSafe}
        month={month}
        clinicId={clinicId}
      />
    </div>
  );
}
