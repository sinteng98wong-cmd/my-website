import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format } from "date-fns";

const ALLOWED = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"];

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "badge-slate",
  PENDING: "badge-amber",
  APPROVED: "badge-blue",
  IN_TRANSIT: "badge-indigo",
  RECEIVED: "badge-green",
  INVOICED: "badge-emerald",
};

const STATUS_TABS = ["All", "DRAFT", "PENDING", "APPROVED", "IN_TRANSIT", "RECEIVED", "INVOICED"];

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

export default async function DeliveryOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!ALLOWED.includes(role)) redirect("/dashboard");

  const statusFilter = searchParams.status && searchParams.status !== "All"
    ? searchParams.status
    : undefined;

  const userClinicIds = role === "SUPER_ADMIN" || role === "FINANCE"
    ? undefined
    : (await prisma.userClinic.findMany({ where: { userId }, select: { clinicId: true } })).map((uc) => uc.clinicId);

  const where: any = {};
  if (statusFilter) where.status = statusFilter;
  if (userClinicIds) {
    where.OR = [
      { fromClinicId: { in: userClinicIds } },
      { toClinicId: { in: userClinicIds } },
    ];
  }

  const orders = await prisma.deliveryOrder.findMany({
    where,
    include: {
      fromClinic: { select: { id: true, name: true } },
      toClinic: { select: { id: true, name: true } },
      poolOrder: { select: { id: true, poRef: true } },
      lines: { select: { quantity: true, unitCost: true } },
    },
    orderBy: { raisedAt: "desc" },
    take: 200,
  });

  const myClinicIds = new Set(userClinicIds ?? []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title">Delivery Orders</h1>
        {["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role) && (
          <Link href="/inventory/delivery-orders/new" className="btn-primary">
            New Delivery Order
          </Link>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        {STATUS_TABS.map((s) => {
          const active = (searchParams.status ?? "All") === s;
          return (
            <a
              key={s}
              href={`?status=${s}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {s === "All" ? "All" : s.replace("_", " ").charAt(0) + s.replace("_", " ").slice(1).toLowerCase()}
            </a>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["DO Ref", "From → To", "Status", "Items", "Total Value", "Pool Order", "Raised", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">No delivery orders found</td>
              </tr>
            )}
            {orders.map((o) => {
              const totalValue = o.lines.reduce((s, l) => s + l.quantity * Number(l.unitCost), 0);
              const actionNeeded = myClinicIds.has(o.toClinicId) && o.status === "IN_TRANSIT";
              const approvalNeeded = myClinicIds.has(o.fromClinicId) && o.status === "PENDING";
              const rowClass = actionNeeded
                ? "table-row bg-amber-50"
                : approvalNeeded
                  ? "table-row bg-blue-50"
                  : "table-row";

              return (
                <tr key={o.id} className={rowClass}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.doRef}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {o.fromClinic.name} → {o.toClinic.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_CLASS[o.status] ?? "badge-slate"}>
                      {o.status.replace("_", " ")}
                    </span>
                    {actionNeeded && <span className="ml-2 text-amber-600 text-xs">• Receipt needed</span>}
                    {approvalNeeded && <span className="ml-2 text-blue-600 text-xs">• Approval needed</span>}
                  </td>
                  <td className="px-4 py-3 text-center">{o.lines.length}</td>
                  <td className="px-4 py-3 font-medium">{fmt(totalValue)}</td>
                  <td className="px-4 py-3">
                    {o.poolOrder
                      ? <Link href={`/inventory/pool-orders/${o.poolOrder.id}`} className="text-blue-600 hover:underline text-xs">{o.poolOrder.poRef}</Link>
                      : "—"
                    }
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {format(new Date(o.raisedAt), "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/inventory/delivery-orders/${o.id}`} className="text-blue-600 hover:underline text-xs">
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
