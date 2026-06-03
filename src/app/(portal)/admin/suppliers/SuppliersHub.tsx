"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SuppliersClient } from "../../../(portal)/suppliers/SuppliersClient";
import { SuppliersClient as StockSuppliersClient } from "../../../(portal)/inventory/suppliers/SuppliersClient";

const TABS = [
  { key: "pv",    label: "Payment Voucher Suppliers", desc: "Suppliers used in payment vouchers — lab vendors, service providers, utilities" },
  { key: "stock", label: "Stock Suppliers",           desc: "Suppliers for dental materials and inventory items" },
] as const;

type TabKey = typeof TABS[number]["key"];

export function SuppliersHub({
  tab,
  pvSuppliers,
  stockSuppliers,
  role,
}: {
  tab: string;
  pvSuppliers: any[];
  stockSuppliers: any[];
  role: string;
}) {
  const activeTab = (tab === "stock" ? "stock" : "pv") as TabKey;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Suppliers</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage suppliers by category
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0 -mb-px">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/suppliers?tab=${t.key}`}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.key
                  ? "border-blue-600 text-blue-700 bg-blue-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                activeTab === t.key ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
              }`}>
                {t.key === "pv" ? pvSuppliers.length : stockSuppliers.length}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-400 -mt-2">
        {TABS.find((t) => t.key === activeTab)?.desc}
      </p>

      {/* Tab content */}
      {activeTab === "pv" && (
        <SuppliersClient suppliers={pvSuppliers} role={role} />
      )}
      {activeTab === "stock" && (
        <StockSuppliersClient initialSuppliers={stockSuppliers} />
      )}
    </div>
  );
}
