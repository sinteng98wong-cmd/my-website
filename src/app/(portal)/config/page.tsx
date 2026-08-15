import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function ConfigPage() {
  await requirePermission("config:manage");
  const session = await getServerSession(authOptions);
  const isSuperAdmin = (session?.user as any)?.role === "SUPER_ADMIN";

  const configs = await prisma.commissionConfig.findMany({
    include: {
      clinic: { select: { name: true } },
      tiers:  { orderBy: { tierOrder: "asc" } },
    },
    orderBy: { effectiveFrom: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Configuration</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Commission settings and access control
          </p>
        </div>
      </div>

      {/* Quick links for Super Admin */}
      {isSuperAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <Link
            href="/admin/module-config"
            className="card p-4 hover:shadow-md transition-shadow flex items-start gap-4"
          >
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-indigo-700 text-lg">🔐</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Role &amp; Module Access</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Configure per-action access per role, and set per-user
                per-clinic module overrides.
              </p>
            </div>
          </Link>

          <Link
            href="/config/payout-rules"
            className="card p-4 hover:shadow-md transition-shadow flex items-start gap-4"
          >
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-amber-700 text-lg">💰</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Payout Release Rules</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Stage-by-stage release percentages per case type (RCT, denture,
                crown, ortho, aligner) — customisable per clinic.
              </p>
            </div>
          </Link>

          <Link
            href="/config/payroll"
            className="card p-4 hover:shadow-md transition-shadow flex items-start gap-4"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-blue-700 text-lg">🏦</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Payroll Settings</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Per-branch 1st/2nd payment approvers, the Head Nurse who submits
                monthly attendance, and the Lunch OT permission.
              </p>
            </div>
          </Link>

          <Link
            href="/config/account-codes"
            className="card p-4 hover:shadow-md transition-shadow flex items-start gap-4"
          >
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-green-700 text-lg">📒</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800">GL Account Codes</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Configure ledger account codes for each clinic.
              </p>
            </div>
          </Link>

          <Link
            href="/inventory/suppliers"
            className="card p-4 hover:shadow-md transition-shadow flex items-start gap-4"
          >
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-teal-700 text-lg">🏭</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Suppliers</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Manage suppliers, contacts, and view account ledgers.
              </p>
            </div>
          </Link>

          <Link
            href="/inventory/categories"
            className="card p-4 hover:shadow-md transition-shadow flex items-start gap-4"
          >
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-violet-700 text-lg">🗂</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Stock Categories</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Hierarchical categories for dental materials, products and more.
              </p>
            </div>
          </Link>
        </div>
      )}

      {/* Commission configs */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-800">Commission Configurations</h2>
      </div>

      {configs.length === 0 && (
        <div className="card p-8 text-center text-slate-400">
          No commission configs found.
        </div>
      )}

      <div className="space-y-5">
        {configs.map((cfg) => (
          <div key={cfg.id} className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {cfg.clinic.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Method:{" "}
                  <span className="font-medium">{cfg.method}</span>
                  {" · "}
                  Tier Type:{" "}
                  <span className="font-medium">{cfg.tierType}</span>
                  {" · "}
                  Forfeit Threshold:{" "}
                  <span className="font-medium">
                    {cfg.forfeitThreshold} days
                  </span>
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Effective{" "}
                {new Date(cfg.effectiveFrom).toLocaleDateString("en-MY", {
                  dateStyle: "medium",
                })}
              </p>
            </div>

            {cfg.tiers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="table-header">
                    <tr>
                      {[
                        "Tier",
                        "Role Target",
                        "Floor (MYR)",
                        "Ceiling (MYR)",
                        "Rate %",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.tiers.map((t) => (
                      <tr key={t.id} className="table-row">
                        <td className="px-5 py-2.5 font-medium text-slate-900">
                          #{t.tierOrder}
                        </td>
                        <td className="px-5 py-2.5 text-slate-600">
                          {t.roleTarget ?? "All"}
                        </td>
                        <td className="px-5 py-2.5">
                          {new Intl.NumberFormat("ms-MY", {
                            style: "currency",
                            currency: "MYR",
                          }).format(Number(t.floorAmount))}
                        </td>
                        <td className="px-5 py-2.5 text-slate-500">
                          {t.ceilAmount
                            ? new Intl.NumberFormat("ms-MY", {
                                style: "currency",
                                currency: "MYR",
                              }).format(Number(t.ceilAmount))
                            : "Unlimited"}
                        </td>
                        <td className="px-5 py-2.5 font-semibold">
                          {Number(t.rate)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
