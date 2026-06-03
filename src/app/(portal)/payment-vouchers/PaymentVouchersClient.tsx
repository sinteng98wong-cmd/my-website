"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PV = {
  id: string;
  pvRef: string;
  status: string;
  totalAmount: string | number;
  createdAt: string;
  supplier: { name: string } | null;
  clinic: { name: string };
  preparedBy: { name: string } | null;
  _count: { invoices: number };
};

const STATUS_TABS = [
  { key: "ALL",              label: "All" },
  { key: "DRAFT",            label: "Draft" },
  { key: "PENDING_DIRECTOR", label: "Pending Director" },
  { key: "PENDING_PIC",      label: "Pending PIC" },
  { key: "APPROVED",         label: "Approved" },
  { key: "PAID",             label: "Paid" },
  { key: "REJECTED",         label: "Rejected" },
];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT:            "badge-slate",
    PENDING_DIRECTOR: "badge-amber",
    PENDING_PIC:      "bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full",
    APPROVED:         "badge-green",
    PAID:             "bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full",
    REJECTED:         "badge-red",
  };
  const cls = map[status] ?? "badge-slate";
  const label = status.replace(/_/g, " ");
  return <span className={cls}>{label}</span>;
}

export function PaymentVouchersClient({
  pvs,
  role,
  userId,
}: {
  pvs: PV[];
  role: string;
  userId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("ALL");

  const filtered = tab === "ALL" ? pvs : pvs.filter((p) => p.status === tab);

  const myApprovals = pvs.filter(
    (p) =>
      (p.status === "PENDING_DIRECTOR") ||
      (p.status === "PENDING_PIC")
  );

  const canCreate = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const isApprover = !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Payment Vouchers</h1>
        {canCreate && (
          <Link href="/payment-vouchers/new" className="btn-primary">
            + New PV
          </Link>
        )}
      </div>

      {isApprover && myApprovals.length > 0 && (
        <div className="card mb-6 border-l-4 border-amber-400">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">My Pending Approvals ({myApprovals.length})</h2>
          <div className="space-y-2">
            {myApprovals.map((pv) => (
              <div
                key={pv.id}
                className="flex items-center justify-between p-3 bg-amber-50 rounded-md cursor-pointer hover:bg-amber-100"
                onClick={() => router.push(`/payment-vouchers/${pv.id}`)}
              >
                <div>
                  <span className="font-medium text-sm">{pv.pvRef}</span>
                  <span className="text-slate-500 text-xs ml-2">{pv.supplier?.name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">RM {Number(pv.totalAmount).toFixed(2)}</span>
                  {statusBadge(pv.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-slate-400">
              ({(tab === t.key || t.key === "ALL" ? (t.key === "ALL" ? pvs.length : pvs.filter(p => p.status === t.key).length) : pvs.filter(p => p.status === t.key).length)})
            </span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">PV Ref</th>
              <th className="table-header">Supplier</th>
              <th className="table-header">Clinic</th>
              <th className="table-header">Invoices</th>
              <th className="table-header text-right">Total (RM)</th>
              <th className="table-header">Status</th>
              <th className="table-header">Prepared By</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400">No payment vouchers found</td>
              </tr>
            )}
            {filtered.map((pv) => (
              <tr
                key={pv.id}
                className="table-row cursor-pointer hover:bg-slate-50"
                onClick={() => router.push(`/payment-vouchers/${pv.id}`)}
              >
                <td className="px-4 py-3 font-mono text-xs font-medium text-blue-700">{pv.pvRef}</td>
                <td className="px-4 py-3 text-slate-600">{pv.supplier?.name ?? <span className="text-slate-400 italic">Inter-branch</span>}</td>
                <td className="px-4 py-3 text-slate-600">{pv.clinic.name}</td>
                <td className="px-4 py-3 text-slate-500">{pv._count.invoices}</td>
                <td className="px-4 py-3 text-right font-medium">{Number(pv.totalAmount).toFixed(2)}</td>
                <td className="px-4 py-3">{statusBadge(pv.status)}</td>
                <td className="px-4 py-3 text-slate-500">{pv.preparedBy?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/payment-vouchers/${pv.id}`}
                    className="text-blue-600 hover:underline text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
