import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ClinicFilter } from "@/components/ClinicFilter";
import { clinicScopeFor, clinicWhere } from "@/lib/clinic-access";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"];

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

export default async function InventoryDashboardPage({
  searchParams,
}: {
  searchParams: { clinicId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  if (!ALLOWED.includes(role)) redirect("/dashboard");

  const userId = (session.user as any).id as string;

  // Data-layer scoping: a branch user's queries are restricted to their own
  // clinics, and a clinicId in the URL can only narrow that, never widen it.
  const allowed = await clinicScopeFor(role, userId);
  if (!allowed.ok) redirect("/dashboard");

  const scope = await clinicScopeFor(role, userId, searchParams.clinicId);
  // An out-of-scope clinicId falls back to the user's own clinics.
  const dataScope = scope.ok ? scope.clinicIds : allowed.clinicIds;
  const clinicId = scope.ok ? searchParams.clinicId : undefined;

  const [clinics, lowStockItems, openPools] = await Promise.all([
    prisma.clinic.findMany({
      where: allowed.clinicIds ? { id: { in: allowed.clinicIds } } : {},
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.clinicStock.findMany({
      where: clinicWhere(dataScope),
      include: {
        item: { select: { id: true, name: true, sku: true, category: true, unit: true } },
        clinic: { select: { id: true, name: true } },
      },
      orderBy: [{ clinic: { name: "asc" } }, { item: { name: "asc" } }],
    }).then((rows) => rows.filter((cs) => cs.quantity <= cs.parLevel)),
    prisma.poolOrder.findMany({
      where: { status: { in: ["OPEN", "REOPENED"] } },
      include: {
        lines: { include: { item: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Inventory</h1>
        <div className="flex gap-2">
          <Link href="/inventory/pool-orders" className="btn-secondary text-sm">Pool Orders</Link>
          <Link href="/inventory/delivery-orders" className="btn-secondary text-sm">Delivery Orders</Link>
        </div>
      </div>

      {/* Clinic filter */}
      <ClinicFilter clinics={clinics} selected={clinicId} />

      {/* Low stock warning banner */}
      {lowStockItems.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="font-semibold text-amber-800 mb-3">
            ⚠ {lowStockItems.length} item{lowStockItems.length > 1 ? "s" : ""} at or below par level
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-amber-700 uppercase border-b border-amber-200">
                  <th className="text-left py-2">Item</th>
                  <th className="text-left py-2">SKU</th>
                  <th className="text-left py-2">Category</th>
                  <th className="text-left py-2">Clinic</th>
                  <th className="text-right py-2">Current Qty</th>
                  <th className="text-right py-2">Par Level</th>
                  <th className="text-right py-2">Shortage</th>
                  <th className="text-left py-2 pl-4">Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((cs) => {
                  const shortage = Math.max(0, cs.parLevel - cs.quantity);
                  const openPoolWithItem = (openPools as any[]).find((p: any) =>
                    p.lines.some((l: any) => l.item.id === cs.itemId)
                  );
                  return (
                    <tr key={cs.id} className="border-b border-amber-100 last:border-0">
                      <td className="py-2 font-medium text-slate-800">{cs.item.name}</td>
                      <td className="py-2 font-mono text-xs text-slate-400">{cs.item.sku}</td>
                      <td className="py-2 text-slate-600">{cs.item.category}</td>
                      <td className="py-2 text-slate-600">{cs.clinic.name}</td>
                      <td className={`py-2 text-right font-medium ${cs.quantity === 0 ? "text-red-600" : "text-amber-700"}`}>
                        {cs.quantity}
                      </td>
                      <td className="py-2 text-right text-slate-500">{cs.parLevel}</td>
                      <td className="py-2 text-right text-red-600 font-medium">{shortage}</td>
                      <td className="py-2 pl-4">
                        <div className="flex gap-2">
                          <Link
                            href={`/inventory/delivery-orders/new?itemId=${cs.itemId}`}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            Request from HQ
                          </Link>
                          {openPoolWithItem ? (
                            <Link
                              href={`/inventory/pool-orders/${openPoolWithItem.id}`}
                              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                            >
                              Join Pool Order
                            </Link>
                          ) : (
                            <Link
                              href="/inventory/pool-orders?status=OPEN"
                              className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                            >
                              View Open Pools
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lowStockItems.length === 0 && (
        <div className="card p-6 text-center text-slate-400">
          <p>All items are above par level. Stock levels look good.</p>
        </div>
      )}
    </div>
  );
}
