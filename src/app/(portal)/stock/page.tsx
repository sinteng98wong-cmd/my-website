import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clinicScopeFor, clinicWhere } from "@/lib/clinic-access";

export default async function StockPage() {
  const session = await requirePermission("stock:manage");
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  // Branch users see only their own clinics' stock — enforced in the query,
  // not by hiding rows in the markup.
  const scope = await clinicScopeFor(role, userId);
  if (!scope.ok) redirect("/dashboard");

  const clinicStocks = await prisma.clinicStock.findMany({
    where: clinicWhere(scope.clinicIds),
    include: {
      item: true,
      clinic: { select: { name: true } },
    },
    orderBy: [{ clinic: { name: "asc" } }, { item: { name: "asc" } }],
    take: 200,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title">Stock</h1>
        <div className="flex gap-2">
          <Link href="/inventory/pool-orders" className="btn-secondary text-sm">
            Pool Orders
          </Link>
          <Link href="/inventory/delivery-orders" className="btn-secondary text-sm">
            Delivery Orders
          </Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["SKU", "Name", "Category", "Clinic", "Quantity", "Par Level", "Status"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clinicStocks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  No stock records found
                </td>
              </tr>
            )}
            {clinicStocks.map((cs) => {
              const low = cs.quantity <= cs.parLevel;
              return (
                <tr key={cs.id} className="table-row">
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">{cs.item.sku}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{cs.item.name}</td>
                  <td className="px-5 py-3 text-slate-600">{cs.item.category}</td>
                  <td className="px-5 py-3 text-slate-600">{cs.clinic.name}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {cs.quantity} {cs.item.unit}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{cs.parLevel}</td>
                  <td className="px-5 py-3">
                    {cs.quantity === 0 ? (
                      <span className="badge-red">Out of Stock</span>
                    ) : low ? (
                      <span className="badge-amber">Low Stock</span>
                    ) : (
                      <span className="badge-green">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
