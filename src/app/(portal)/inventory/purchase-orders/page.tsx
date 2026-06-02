import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format } from "date-fns";

const STATUS_CLASS: Record<string, string> = {
  DRAFT:      "badge-slate",
  SUBMITTED:  "badge-amber",
  CONFIRMED:  "badge-blue",
  PARTIAL:    "badge-indigo",
  RECEIVED:   "badge-green",
  INVOICED:   "badge-emerald",
  CANCELLED:  "badge-red",
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

export default async function PurchaseOrdersPage() {
  await requirePermission("stock:manage");

  const orders = await prisma.purchaseOrder.findMany({
    include: {
      clinic:   { select: { name: true } },
      supplier: { select: { name: true } },
      lines:    { select: { quantity: true, unitCost: true, receivedQty: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingCount = orders.filter((o) =>
    ["SUBMITTED", "CONFIRMED", "PARTIAL"].includes(o.status)
  ).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Orders placed directly with external suppliers
          </p>
        </div>
        <Link href="/inventory/purchase-orders/new" className="btn-primary">
          + New Purchase Order
        </Link>
      </div>

      {pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <p className="text-sm text-amber-800 font-medium">
            {pendingCount} order{pendingCount !== 1 ? "s" : ""} awaiting receipt
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Source legend */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            External supplier order
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-400">
            See <Link href="/inventory/delivery-orders" className="underline">Delivery Orders</Link> for internal clinic transfers
          </span>
        </div>

        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["PO Ref", "Supplier", "Receiving Branch", "Items", "Value", "Expected", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No purchase orders yet.{" "}
                  <Link href="/inventory/purchase-orders/new" className="text-blue-600 underline">Create one</Link>
                </td>
              </tr>
            )}
            {orders.map((o) => {
              const value = o.lines.reduce((s, l) => s + l.quantity * Number(l.unitCost), 0);
              return (
                <tr key={o.id} className="table-row">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{o.poRef}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-violet-700 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                      {o.supplier.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.clinic.name}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{o.lines.length}</td>
                  <td className="px-4 py-3 font-medium">{fmt(value)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {o.expectedDate ? format(new Date(o.expectedDate), "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_CLASS[o.status] ?? "badge-slate"}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/inventory/purchase-orders/${o.id}`} className="text-xs text-blue-600 hover:underline">
                      View
                    </Link>
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
