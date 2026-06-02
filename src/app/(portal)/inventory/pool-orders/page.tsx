import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDistanceToNow, isPast, differenceInHours } from "date-fns";

const ALLOWED = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"];

const STATUS_CLASS: Record<string, string> = {
  OPEN: "badge-blue",
  CLOSED: "badge-slate",
  REOPENED: "badge-cyan",
  SUBMITTED: "badge-amber",
  DELIVERED: "badge-purple",
  DISTRIBUTED: "badge-green",
  INVOICED: "badge-emerald",
};

const MODE_CLASS: Record<string, string> = {
  CENTRALISED: "badge-indigo",
  DIRECT: "badge-teal",
};

const STATUS_TABS = ["All", "OPEN", "CLOSED", "SUBMITTED", "DELIVERED", "DISTRIBUTED", "INVOICED"];

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

export default async function PoolOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  if (!ALLOWED.includes(role)) redirect("/dashboard");

  const statusFilter = searchParams.status && searchParams.status !== "All"
    ? searchParams.status
    : undefined;

  const orders = await prisma.poolOrder.findMany({
    where: statusFilter ? { status: statusFilter as any } : undefined,
    include: {
      initiatingClinic: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      _count: { select: { participants: true } },
      lines: { select: { unitCost: true, totalQty: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const now = new Date();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title">Pool Orders</h1>
        {["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role) && (
          <Link href="/inventory/pool-orders/new" className="btn-primary">
            New Pool Order
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
              {s === "All" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </a>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["PO Ref", "Supplier", "Mode", "Status", "Initiated By", "Participants", "MOQ Target", "Total Value", "Deadline", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">No pool orders found</td>
              </tr>
            )}
            {orders.map((o) => {
              const total = o.lines.reduce((s, l) => s + Number(l.unitCost) * l.totalQty, 0);
              const deadlineSoon = o.deadline && !isPast(o.deadline) && differenceInHours(o.deadline, now) <= 48;
              const deadlinePast = o.deadline && isPast(o.deadline);
              const rowClass = deadlineSoon && ["OPEN", "REOPENED"].includes(o.status)
                ? "table-row bg-amber-50"
                : "table-row";

              return (
                <tr key={o.id} className={rowClass}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.poRef}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{o.supplierName}</td>
                  <td className="px-4 py-3">
                    <span className={MODE_CLASS[o.deliveryMode] ?? "badge-slate"}>
                      {o.deliveryMode === "CENTRALISED" ? "Centralised" : "Direct"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_CLASS[o.status] ?? "badge-slate"}>
                      {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.initiatingClinic.name}</td>
                  <td className="px-4 py-3 text-center">{o._count.participants}</td>
                  <td className="px-4 py-3 text-slate-700">{fmt(Number(o.moqTarget))}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium">{fmt(total)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {o.deadline
                      ? deadlinePast
                        ? <span className="text-red-500">Passed</span>
                        : <span className={deadlineSoon ? "text-amber-600 font-medium" : ""}>
                            {formatDistanceToNow(o.deadline, { addSuffix: true })}
                          </span>
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/inventory/pool-orders/${o.id}`} className="text-blue-600 hover:underline text-xs">
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
