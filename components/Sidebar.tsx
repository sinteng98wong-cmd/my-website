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
  managerOnly?:     boolean;  // SUPER_ADMIN + CLINIC_MANAGER only
  financeVisible?:  boolean;  // also visible to FINANCE
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
      { key: "invoices",   label: "Invoices",     href: "/invoices"    },
      { key: "ledger",     label: "Daily Ledger", href: "/ledger"      },
      { key: "commission", label: "Commission",   href: "/commission"  },
      { key: "reports",    label: "Reports",      href: "/reports"     },
    ],
  },

  // ── Human Resources ────────────────────────────────────────────────
  {
    type:   "group",
    key:    "human-resources",
    label:  "Human Resources",
    module: "hr",
    children: [
      { key: "hr-home",         label: "HR Overview",     href: "/hr",                   managerOnly: true  },
      { key: "hr-staff",        label: "Staff Directory", href: "/hr/staff",             managerOnly: true  },
      { key: "hr-schedule",     label: "Schedule",        href: "/hr/schedule"                               },
      { key: "hr-leave",        label: "Leave",           href: "/hr/leave"                                  },
      { key: "hr-attendance",   label: "Attendance",      href: "/hr/attendance",        managerOnly: true  },
      { key: "hr-payroll",        label: "Payroll",             href: "/hr/payroll",            managerOnly: true  },
      { key: "hr-doctor-payroll", label: "Doctor Payroll Calc", href: "/hr/doctor-payroll",     managerOnly: true  },
      { key: "hr-my-slips",     label: "My Payslips",     href: "/hr/payroll/my-slips"                       },
      { key: "hr-claims",       label: "Claims",          href: "/hr/claims"                                 },
      { key: "hr-kpi",          label: "KPI",             href: "/hr/kpi"                                    },
      { key: "hr-appraisals",   label: "Appraisals",      href: "/hr/appraisals"                             },
      { key: "hr-disciplinary", label: "Disciplinary",    href: "/hr/disciplinary",      managerOnly: true  },
      { key: "hr-training",     label: "Training",        href: "/hr/training"                               },
    ],
  },

  // ── Inventory ──────────────────────────────────────────────────────
  {
    type:   "group",
    key:    "inventory",
    label:  "Inventory",
    module: "inventory",
    children: [
      { key: "inv-overview", label: "Overview",       href: "/inventory"              },
      { key: "stock",        label: "Stock Levels",   href: "/stock"                  },
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
      { key: "purchase-orders", label: "Purchase Orders",  href: "/inventory/purchase-orders"  },
      { key: "pool-orders",     label: "Pool Orders",      href: "/inventory/pool-orders"       },
      { key: "do",              label: "Delivery Orders",  href: "/inventory/delivery-orders"   },
      { key: "stock-invoices",  label: "Stock Invoices",   href: "/inventory/stock-invoices"    },
    ],
  },

  // ── Licenses ───────────────────────────────────────────────────────
  {
    type:  "group",
    key:   "licenses",
    label: "Compliance",
    children: [
      { key: "licenses",       label: "Licenses",      href: "/licenses"                                    },
      { key: "license-types",  label: "License Types", href: "/admin/license-types", superAdminOnly: true },
    ],
  },

  // ── Admin ──────────────────────────────────────────────────────────
  {
    type:  "group",
    key:   "admin",
    label: "Admin",
    children: [
      { key: "users",       label: "Users",           href: "/users",                  superAdminOnly: true },
      { key: "patient-src", label: "Patient Sources",  href: "/admin/patient-sources",  superAdminOnly: true },
      { key: "config",      label: "Settings",         href: "/config"              },
      { key: "suppliers",   label: "Suppliers",        href: "/inventory/suppliers" },
      { key: "categories",  label: "Categories",       href: "/inventory/categories"},
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
  const pathname          = usePathname();
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
    if (child.managerOnly) return ["CLINIC_MANAGER"].includes(role);
    return true;
  }

  return (
    <aside className="flex h-screen w-52 flex-col bg-white border-r border-slate-200 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-slate-200 flex-shrink-0">
        <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-xs">D</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">DentalOS</span>
      </div>

      {/* Clinic Switcher */}
      <div className="px-3 py-2.5 border-b border-slate-200 flex-shrink-0">
        {clinics.length > 1 ? (
          <ClinicSwitcher clinics={clinics} selected={selectedClinicId} />
        ) : (
          <p className="text-xs text-slate-500 truncate px-1">{clinics[0]?.name ?? "No clinic"}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV.map((entry) => {
          if (!entryVisible(entry)) return null;

          // ── Flat link ────────────────────────────────────────
          if (entry.type === "item") {
            const active = pathname === entry.href || pathname.startsWith(entry.href + "/");
            return (
              <Link
                key={entry.key}
                href={entry.href}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {entry.label}
              </Link>
            );
          }

          // ── Group ────────────────────────────────────────────
          const visibleChildren = entry.children.filter(childVisible);
          if (visibleChildren.length === 0) return null;

          return (
            <div key={entry.key} className="pt-2">
              <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {entry.label}
              </p>
              <div className="ml-2 border-l border-slate-200 pl-2 space-y-0.5">
                {visibleChildren.map((child) => {
                  const active = pathname === child.href || pathname.startsWith(child.href + "/");
                  return (
                    <Link
                      key={child.key}
                      href={child.href}
                      className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        active
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
      <div className="p-4 border-t border-slate-200 flex-shrink-0">
        <p className="text-xs font-medium text-slate-900 truncate">{session?.user?.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-400">{effectiveRole}</span>
          {effectiveRole !== baseRole && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium" title={`Default role: ${baseRole}`}>
              override
            </span>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-xs text-red-500 hover:text-red-600 mt-2"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
