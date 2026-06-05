"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";

type Clinic = { id: string; name: string };

interface PortalShellProps {
  children:         React.ReactNode;
  clinics:          Clinic[];
  selectedClinicId: string | undefined;
  allowedModules:   string[];
  effectiveRole:    string;
  baseRole:         string;
}

export function PortalShell({
  children,
  clinics,
  selectedClinicId,
  allowedModules,
  effectiveRole,
  baseRole,
}: PortalShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sidebarProps = { clinics, selectedClinicId, allowedModules, effectiveRole, baseRole };

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fixed overlay on mobile, normal flow on desktop */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-30 transition-transform duration-300 ease-in-out",
          "md:relative md:z-auto md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <Sidebar {...sidebarProps} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden flex items-center h-14 px-4 border-b border-zinc-200 bg-white sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-zinc-600 hover:bg-zinc-100 transition-colors"
            aria-label="Open navigation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="ml-3 font-semibold text-sm text-zinc-800">DentalOS</span>
        </div>

        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
