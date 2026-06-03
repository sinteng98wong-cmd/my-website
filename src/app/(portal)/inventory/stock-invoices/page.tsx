import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format } from "date-fns";

const ALLOWED = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", {
    style: "currency",
    currency: "MYR",
  }).format(Number(n));
}

function lineValue(qty: number, cost: string | number) {
  return qty * Number(cost);
}

export default async function StockInvoicesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  if (!ALLOWED.includes(role)) redirect("/dashboard");

  const canRecord = ["SUPER_ADMIN", "FINANCE"].includes(role);

  const [invoices, uninvoicedDOs] = await Promise.all([
    prisma.stockInvoice.findMany({
      include: {
        fromEntity: { select: { legalName: true } },
        deliveryOrders: {
          select: {
            id: true,
            toClinic: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.deliveryOrder.findMany({
      where: { status: "RECEIVED", stockInvoiceId: null },
      include: {
        toClinic:   { select: { name: true } },
        fromClinic: { select: { name: true } },
        lines: {
          select: { quantity: true, receivedQty: true, unitCost: true },
        },
      },
      orderBy: { receivedAt: "asc" },
    }),
  ]);

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title">Stock Invoices</h1>
        {canRecord && (
          <Link href="/inventory/stock-invoices/new" className="btn-primary">
            Record Invoice
          </Link>
        )}
      </div>

      {/* ── Uninvoiced DOs alert ───────────────────────────────────────── */}
      {uninvoicedDOs.length > 0 && (
        <div className="mb-6">
          {/* Banner */}
          <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-t-lg">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-sm font-medium text-amber-800">
                {uninvoicedDOs.length} received delivery order
                {uninvoicedDOs.length !== 1 ? "s" : ""} not yet linked to an
                invoice
              </p>
            </div>
            {/* Action bar */}
            {canRecord && (
              <div className="flex items-center gap-2">
                <Link
                  href="/inventory/stock-invoices/new"
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  Record Invoice →
                </Link>
              </div>
            )}
          </div>

          {/* Uninvoiced DO table */}
          <div className="border border-amber-200 border-t-0 rounded-b-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 border-b border-amber-200">
                  {["DO Ref", "From", "To Branch", "Received", "Lines", "Value", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-semibold text-amber-700 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {uninvoicedDOs.map((do_) => {
                  const value = do_.lines.reduce(
                    (s, l) =>
                      s + lineValue(l.receivedQty ?? l.quantity, Number(l.unitCost)),
                    0
                  );
                  return (
                    <tr key={do_.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                        {do_.doRef}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {do_.fromClinic.name}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {do_.toClinic.name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {do_.receivedAt
                          ? format(new Date(do_.receivedAt), "d MMM yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500">
                        {do_.lines.length}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {fmt(value)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/inventory/delivery-orders/${do_.id}`}
                            className="text-xs text-slate-500 hover:text-slate-700 underline"
                          >
                            View DO
                          </Link>
                          {canRecord && (
                            <Link
                              href={`/inventory/stock-invoices/new`}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Record Invoice
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

      {/* ── Recorded invoices ─────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 text-sm">Recorded Invoices</h2>
          <span className="text-xs text-slate-400">{invoices.length} total</span>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {[
                "Invoice No.",
                "Source",
                "Branch",
                "Month",
                "Total",
                "Invoice Date",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No stock invoices recorded yet.
                </td>
              </tr>
            )}
            {invoices.map((inv) => {
              const branch = inv.deliveryOrders[0]?.toClinic?.name ?? "—";
              const grand = Number(inv.totalAmount) + Number(inv.sst);
              return (
                <tr key={inv.id} className="table-row">
                  <td className="px-4 py-3">
                    <p className="font-mono font-semibold text-slate-800">{inv.invoiceRef}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{inv.fromEntity.legalName}</p>
                  </td>
                  <td className="px-4 py-3">
                    {(inv as any).source === "SUPPLIER" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                        {(inv as any).supplier?.name ?? "Supplier"}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        Internal
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{branch}</td>
                  <td className="px-4 py-3 text-slate-500">{inv.month}</td>
                  <td className="px-4 py-3 font-semibold">{fmt(grand)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {inv.issuedAt
                      ? format(new Date(inv.issuedAt), "d MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/inventory/stock-invoices/${inv.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
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
