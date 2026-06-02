"use client";

import Link from "next/link";

export function TabSwitcher({ activeTab }: { activeTab: string }) {
  const tabs = [
    { key: "roles",     label: "Role Defaults" },
    { key: "overrides", label: "User Overrides" },
  ];
  return (
    <div className="flex border-b border-slate-200">
      {tabs.map(t => (
        <Link
          key={t.key}
          href={`/admin/module-config?tab=${t.key}`}
          className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === t.key
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
