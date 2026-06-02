import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format } from "date-fns";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", {
    style: "currency",
    currency: "MYR",
  }).format(Number(n));
}

export default async function StockInvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    redirect("/dashboard");
  }

  const invoice = await prisma.stockInvoice.findUnique({
    where: { id: params.id },
    include: {
      fromEntity: { select: { legalName: true } },
      deliveryOrders: {
        include: {
          fromClinic: { select: { name: true } },
          toClinic:   { select: { name: true } },
          lines: {
            include: {
              item: {
                select: { name: true, sku: true, unit: true, category: true },
              },
            },
          },
        },
        orderBy: { receivedAt: "asc" },
      },
    },
  });

  if (!invoice) notFound();

  const branch = invoice.deliveryOrders[0]?.toClinic?.name ?? "—";
  const grand  = Number(invoice.totalAmount.toString()) + Number(invoice.sst.toString());

  // Group by receivedAt date, then by category
  type LineWithMeta = {
    id: string;
    quantity: number;
    receivedQty: number | null;
    unitCost: any;
    item: { name: string; sku: string; unit: string; category: string };
    doRef: string;
  };

  const byDate: Record<string, Record<string, LineWithMeta[]>> = {};

  for (const do_ of invoice.deliveryOrders) {
    const dateKey = do_.receivedAt
      ? format(new Date(do_.receivedAt), "d MMM yyyy (EEE)")
      : "Unknown Date";

    if (!byDate[dateKey]) byDate[dateKey] = {};

    for (const l of do_.lines) {
      const cat = l.item.category;
      if (!byDate[dateKey][cat]) byDate[dateKey][cat] = [];
      byDate[dateKey][cat].push({ ...l, doRef: do_.doRef });
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between mb-2">
        <Link
          href="/inventory/stock-invoices"
          className="text-slate-500 hover:text-slate-700 text-sm"
        >
          Back to Stock Invoices
        </Link>
      </div>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
              Invoice Number
            </p>
            <h1 className="text-2xl font-bold font-mono text-slate-900">
              {invoice.invoiceRef}
            </h1>
            <p className="text-slate-600 mt-1">
              {invoice.fromEntity.legalName} &rarr; {branch}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              Month: {invoice.month} &bull; Recorded:{" "}
              {invoice.issuedAt
                ? format(new Date(invoice.issuedAt), "d MMM yyyy")
                : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wide">
              Grand Total
            </p>
            <p className="text-3xl font-bold text-blue-700">{fmt(grand)}</p>
            <p className="text-xs text-slate-400 mt-1">
              Subtotal {fmt(Number(invoice.totalAmount.toString()))} + SST {fmt(Number(invoice.sst.toString()))}
            </p>
          </div>
        </div>
      </div>

      {/* Breakdown grouped by date → category */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-800">
            Delivery Breakdown — {invoice.deliveryOrders.length} delivery order
            {invoice.deliveryOrders.length !== 1 ? "s" : ""}
          </h2>
        </div>

        {Object.entries(byDate).map(([date, catMap]) => {
          const dateTotal = Object.values(catMap)
            .flat()
            .reduce(
              (s, l) => s + (l.receivedQty ?? l.quantity) * Number(l.unitCost),
              0
            );
          return (
            <div key={date}>
              {/* Date row */}
              <div className="px-5 py-2 bg-slate-50 border-b border-t border-slate-200 flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {date}
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  {fmt(dateTotal)}
                </span>
              </div>

              {Object.entries(catMap).map(([category, lines]) => {
                const catTotal = lines.reduce(
                  (s, l) =>
                    s + (l.receivedQty ?? l.quantity) * Number(l.unitCost),
                  0
                );
                return (
                  <div key={category}>
                    {/* Category sub-header */}
                    <div className="px-6 py-1.5 border-b border-slate-100 flex items-center gap-3 bg-white">
                      <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {category}
                      </span>
                      <span className="ml-auto text-xs text-slate-500">
                        {fmt(catTotal)}
                      </span>
                    </div>

                    {/* Lines */}
                    <table className="w-full text-xs">
                      <tbody>
                        {lines.map((l) => {
                          const qty = l.receivedQty ?? l.quantity;
                          const discrepancy =
                            l.receivedQty !== null &&
                            l.receivedQty !== l.quantity;
                          const lineTotal = qty * Number(l.unitCost);
                          return (
                            <tr
                              key={l.id}
                              className={`border-b border-slate-50 ${
                                discrepancy ? "bg-amber-50" : ""
                              }`}
                            >
                              <td className="pl-8 pr-4 py-1.5 text-slate-700">
                                {l.item.name}
                              </td>
                              <td className="px-3 py-1.5 text-slate-400 font-mono">
                                {l.item.sku}
                              </td>
                              <td className="px-3 py-1.5 text-center text-slate-500">
                                {qty} {l.item.unit}
                                {discrepancy && (
                                  <span className="text-amber-600 ml-1">
                                    ⚠ req {l.quantity}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right text-slate-400">
                                {fmt(Number(l.unitCost))}
                              </td>
                              <td className="px-4 py-1.5 text-right font-medium text-slate-800">
                                {fmt(lineTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Totals */}
        <div className="px-5 py-4 border-t border-slate-200 flex justify-end">
          <table className="text-sm w-56">
            <tbody>
              <tr>
                <td className="py-1 text-slate-500">Subtotal</td>
                <td className="py-1 text-right font-medium">
                  {fmt(Number(invoice.totalAmount.toString()))}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-slate-500">SST</td>
                <td className="py-1 text-right font-medium">
                  {fmt(Number(invoice.sst.toString()))}
                </td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="pt-2 font-bold text-slate-800">Grand Total</td>
                <td className="pt-2 text-right font-bold text-lg text-blue-700">
                  {fmt(grand)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Linked DOs list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">
            Linked Delivery Orders
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                DO Ref
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                From
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Received
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                Value
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {invoice.deliveryOrders.map((do_) => {
              const val = do_.lines.reduce(
                (s, l) =>
                  s + (l.receivedQty ?? l.quantity) * Number(l.unitCost),
                0
              );
              return (
                <tr key={do_.id} className="table-row">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {do_.doRef}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {do_.fromClinic.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {do_.receivedAt
                      ? format(new Date(do_.receivedAt), "d MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {fmt(val)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/inventory/delivery-orders/${do_.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      View DO
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
