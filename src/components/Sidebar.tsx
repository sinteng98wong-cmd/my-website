"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ClinicSwitcher } from "./ClinicSwitcher";
import { useAccess } from "@/context/AccessContext";
import type { ModuleKey } from "@/lib/modules";

type NavChild = {
  key:              string;
  label:            string;
  href:             string;
  superAdminOnly?:  boolean;
  managerOnly?:     boolean;
  financeVisible?:  boolean;
};

type NavItem = {
  type:            "item";
  key:             string;
  label:           string;
  href:            string;
  module?:         ModuleKey;
  superAdminOnly?: boolean;
};

type NavGroup = {
  type:            "group";
  key:             string;
  label:           string;
  module?:         ModuleKey;
  superAdminOnly?: boolean;
  children:        NavChild[];
};

type NavEntry = NavItem | NavGroup;

const NAV: NavEntry[] = [
  // ── Dashboard ──────────────────────────────────────────────────────
  { type: "item", key: "dashboard", label: "Dashboard", href: "/dashboard" },

  // ── Patient Care ───────────────────────────────────────────────────
  {
    type:  "group",
    key:   "patient-care",
    label: "Patient Care",
    children: [
      { key: "patients",     label: "Patients",     href: "/patients"     },
      { key: "appointments", label: "Appointments", href: "/appointments" },
      { key: "schedule",     label: "Schedule",     href: "/schedule"     },
      { key: "lab",          label: "Lab Work",     href: "/lab"          },
    ],
  },

  // ── Finance ────────────────────────────────────────────────────────
  {
    type:   "group",
    key:    "finance",
    label:  "Finance",
    module: "invoices",
    children: [
      { key: "invoices",         label: "Invoices",        href: "/invoices"                                },
      { key: "ledger",           label: "Daily Ledger",    href: "/ledger"                                  },
      { key: "settlements",      label: "Settlements",     href: "/ledger/settlements",    financeVisible: true },
      { key: "monthly-closing",  label: "Monthly Closing", href: "/ledger/monthly-closing", financeVisible: true },
      { key: "commission",       label: "Commission",      href: "/commission"                              },
      { key: "payment-vouchers", label: "Payment Vouchers", href: "/payment-vouchers",     financeVisible: true },
      { key: "reports",          label: "Reports",         href: "/reports"                                 },
    ],
  },

  // ── Human Resources ────────────────────────────────────────────────
  {
    type:   "group",
    key:    "human-resources",
    label:  "Human Resources",
    module: "hr",
    children: [
      { key: "hr-home",           label: "HR Overview",       href: "/hr",                    managerOnly: true },
      { key: "hr-staff",          label: "Staff Directory",   href: "/hr/staff",              managerOnly: true },
      { key: "hr-schedule",       label: "Schedule",          href: "/hr/schedule"                              },
      { key: "hr-leave",          label: "Leave",             href: "/hr/leave"                                 },
      { key: "hr-attendance",     label: "Attendance",        href: "/hr/attendance",         managerOnly: true },
      { key: "hr-payroll",        label: "Payroll",           href: "/hr/payroll",            managerOnly: true },
      { key: "hr-doctor-payroll", label: "Doctor Payroll",    href: "/hr/doctor-payroll",     managerOnly: true },
      { key: "hr-my-slips",       label: "My Payslips",       href: "/hr/payroll/my-slips"                      },
      { key: "hr-claims",         label: "Claims",            href: "/hr/claims"                                },
      { key: "hr-kpi",            label: "KPI",               href: "/hr/kpi"                                   },
      { key: "hr-appraisals",     label: "Appraisals",        href: "/hr/appraisals"                            },
      { key: "hr-disciplinary",   label: "Disciplinary",      href: "/hr/disciplinary",       managerOnly: true },
      { key: "hr-training",       label: "Training",          href: "/hr/training"                              },
    ],
  },

  // ── Inventory ──────────────────────────────────────────────────────
  {
    type:   "group",
    key:    "inventory",
    label:  "Inventory",
    module: "inventory",
    children: [
      { key: "inv-overview", label: "Overview",         href: "/inventory"            },
      { key: "stock",        label: "Stock Levels",     href: "/stock"                },
      { key: "batches",      label: "Batches & Expiry", href: "/inventory/batches"    },
    ],
  },

  // ── Procurement ────────────────────────────────────────────────────
  {
    type:   "group",
    key:    "procurement",
    label:  "Procurement",
    module: "inventory",
    children: [
      { key: "purchase-orders", label: "Purchase Orders",  href: "/inventory/purchase-orders" },
      { key: "pool-orders",     label: "Pool Orders",      href: "/inventory/pool-orders"      },
      { key: "do",              label: "Delivery Orders",  href: "/inventory/delivery-orders"  },
      { key: "stock-invoices",  label: "Stock Invoices",   href: "/inventory/stock-invoices"   },
    ],
  },

  // ── Compliance ─────────────────────────────────────────────────────
  {
    type:  "group",
    key:   "compliance",
    label: "Compliance",
    children: [
      { key: "licenses",          label: "Licenses",          href: "/licenses"                                  },
      { key: "license-types",     label: "License Types",     href: "/admin/license-types",   superAdminOnly: true },
      { key: "consent-templates", label: "Consent Templates", href: "/admin/consent-templates", managerOnly: true  },
    ],
  },

  // ── Admin ──────────────────────────────────────────────────────────
  {
    type:  "group",
    key:   "admin",
    label: "Admin",
    children: [
      { key: "companies",   label: "Companies",          href: "/admin/companies",         superAdminOnly: true },
      { key: "users",       label: "Users",              href: "/users",                   superAdminOnly: true },
      { key: "patient-src", label: "Patient Sources",    href: "/admin/patient-sources",   superAdminOnly: true },
      { key: "expense-cat", label: "Expense Categories", href: "/admin/expense-categories", superAdminOnly: true },
      { key: "einvoice",    label: "e-Invoice",          href: "/admin/einvoice",          financeVisible: true },
      { key: "config",      label: "Settings",           href: "/config"                                        },
      { key: "suppliers",   label: "Suppliers",          href: "/admin/suppliers"                               },
      { key: "categories",  label: "Categories",         href: "/inventory/categories"                          },
    ],
  },
];

type Clinic = { id: string; name: string };

interface SidebarProps {
  clinics:          Clinic[];
  selectedClinicId: string | undefined;
  allowedModules:   string[];
  effectiveRole:    string;
  baseRole:         string;
}

export function Sidebar({ clinics, selectedClinicId, allowedModules, effectiveRole, baseRole }: SidebarProps) {
  const { data: session } = useSession();
  const pathname           = usePathname();
  const { canAccess, loading } = useAccess();
  const role         = (session?.user as any)?.role ?? "";
  const isSuperAdmin = role === "SUPER_ADMIN";

  function entryVisible(entry: { module?: ModuleKey; superAdminOnly?: boolean }) {
    if (isSuperAdmin) return true;
    if (entry.superAdminOnly) return false;
    if (entry.module) return !loading && canAccess(entry.module as ModuleKey);
    return true;
  }

  function childVisible(child: NavChild) {
    if (isSuperAdmin) return true;
    if (child.superAdminOnly) return false;
    if (child.managerOnly)    return ["CLINIC_MANAGER"].includes(role);
    if (child.financeVisible) return ["FINANCE", "CLINIC_MANAGER"].includes(role);
    return true;
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="flex h-screen w-56 flex-col bg-slate-900 flex-shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-slate-800/60 flex-shrink-0">
        <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-white font-bold text-xs tracking-wide">D</span>
        </div>
        <span className="font-semibold text-white text-sm tracking-tight">DentalOS</span>
      </div>

      {/* Clinic Switcher */}
      {clinics.length > 0 && (
        <div className="px-3 pt-3 pb-2 border-b border-slate-800/60 flex-shrink-0">
          {clinics.length > 1
            ? <ClinicSwitcher clinics={clinics} selected={selectedClinicId} />
            : <p className="text-xs text-slate-400 truncate px-2">{clinics[0]?.name ?? ""}</p>
          }
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-thin">
        {NAV.map((entry) => {
          if (!entryVisible(entry)) return null;

          /* ── Flat item ────────────────────────────────────── */
          if (entry.type === "item") {
            const active = isActive(entry.href);
            return (
              <Link
                key={entry.key}
                href={entry.href}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {entry.label}
              </Link>
            );
          }

          /* ── Group ────────────────────────────────────────── */
          const visibleChildren = entry.children.filter(childVisible);
          if (visibleChildren.length === 0) return null;

          return (
            <div key={entry.key} className="pt-4 first:pt-1">
              <p className="px-3 mb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                {entry.label}
              </p>
              <div className="space-y-0.5">
                {visibleChildren.map((child) => {
                  const active = isActive(child.href);
                  return (
                    <Link
                      key={child.key}
                      href={child.href}
                      className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-slate-800/60 flex-shrink-0">
        <p className="text-xs font-semibold text-white truncate">{session?.user?.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-500 capitalize">{effectiveRole.replace("_", " ").toLowerCase()}</span>
          {effectiveRole !== baseRole && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
              override
            </span>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-2.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Sign out
        </button>
      </div>

    </aside>
  );
}
