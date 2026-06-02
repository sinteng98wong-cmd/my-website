"use client";

import { useState, useTransition } from "react";

type Module  = { key: string; label: string };
type Clinic  = { id: string; name: string };
type Role    = string;

const ROLE_LABELS: Record<string, string> = {
  CLINIC_MANAGER: "Clinic Manager",
  FINANCE:        "Finance",
  DOCTOR:         "Doctor",
  NURSE:          "Nurse",
  RECEPTIONIST:   "Receptionist",
  STOREKEEPER:    "Storekeeper",
};

const ROLE_COLORS: Record<string, string> = {
  CLINIC_MANAGER: "bg-amber-100 text-amber-800",
  FINANCE:        "bg-blue-100 text-blue-800",
  DOCTOR:         "bg-indigo-100 text-indigo-800",
  NURSE:          "bg-green-100 text-green-800",
  RECEPTIONIST:   "bg-purple-100 text-purple-800",
  STOREKEEPER:    "bg-orange-100 text-orange-800",
};

export function AccessConfigClient({
  modules, roles, clinics, moduleMatrix, clinicMatrix,
}: {
  modules: Module[];
  roles: Role[];
  clinics: Clinic[];
  moduleMatrix: Record<string, Record<string, boolean>>;
  clinicMatrix: Record<string, Record<string, boolean>>;
}) {
  const [tab, setTab]       = useState<"modules" | "branches">("modules");
  const [mMatrix, setMMatrix] = useState(moduleMatrix);
  const [cMatrix, setCMatrix] = useState(clinicMatrix);
  const [saving, setSaving]   = useState<string | null>(null);
  const [saved, setSaved]     = useState<string | null>(null);

  async function toggle(type: "module" | "clinic", role: string, key: string, enabled: boolean) {
    const id = `${type}-${role}-${key}`;
    setSaving(id);

    // Optimistic update
    if (type === "module") {
      setMMatrix(prev => ({ ...prev, [role]: { ...prev[role], [key]: enabled } }));
    } else {
      setCMatrix(prev => ({ ...prev, [role]: { ...prev[role], [key]: enabled } }));
    }

    await fetch("/api/config/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, role, key, enabled }),
    });

    setSaving(null);
    setSaved(id);
    setTimeout(() => setSaved(null), 1500);
  }

  function selectAllModules(role: string, enabled: boolean) {
    for (const mod of modules) toggle("module", role, mod.key, enabled);
  }

  function selectAllClinics(role: string, enabled: boolean) {
    for (const clinic of clinics) toggle("clinic", role, clinic.id, enabled);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Access Configuration</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure which modules and branches each role can access. Changes take effect on next login / page refresh.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        {[
          { key: "modules",  label: "Module Access" },
          { key: "branches", label: "Branch Access" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Module Access Matrix ── */}
      {tab === "modules" && (
        <div>
          <p className="text-xs text-slate-500 mb-4">
            Super Admin always has access to all modules and cannot be restricted.
            Toggle checkboxes to enable or disable modules per role.
          </p>
          <div className="card overflow-x-auto">
            <table className="text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide w-36">Module</th>
                  {roles.map(role => (
                    <th key={role} className="px-4 py-3 text-center min-w-[110px]">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[role] ?? "bg-slate-100 text-slate-600"}`}>
                          {ROLE_LABELS[role] ?? role}
                        </span>
                        <div className="flex gap-1 text-xs">
                          <button onClick={() => selectAllModules(role, true)}
                            className="text-blue-500 hover:underline">All</button>
                          <span className="text-slate-300">|</span>
                          <button onClick={() => selectAllModules(role, false)}
                            className="text-slate-400 hover:underline">None</button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map(mod => (
                  <tr key={mod.key} className="table-row">
                    <td className="px-4 py-3 font-medium text-slate-700">{mod.label}</td>
                    {roles.map(role => {
                      const enabled = mMatrix[role]?.[mod.key] ?? false;
                      const id      = `module-${role}-${mod.key}`;
                      const isSaving = saving === id;
                      const isSaved  = saved  === id;
                      return (
                        <td key={role} className="px-4 py-3 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={isSaving}
                              onChange={e => toggle("module", role, mod.key, e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            {isSaving && <span className="ml-1 text-xs text-slate-400">…</span>}
                            {isSaved  && <span className="ml-1 text-xs text-green-500">✓</span>}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Branch Access Matrix ── */}
      {tab === "branches" && (
        <div>
          <p className="text-xs text-slate-500 mb-4">
            Control which branches each role can see data from. Super Admin and Finance always see all branches.
            If all are unchecked, the role will see all branches (default open access).
          </p>
          <div className="card overflow-x-auto">
            <table className="text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide w-44">Branch</th>
                  {roles.map(role => (
                    <th key={role} className="px-4 py-3 text-center min-w-[110px]">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[role] ?? "bg-slate-100 text-slate-600"}`}>
                          {ROLE_LABELS[role] ?? role}
                        </span>
                        <div className="flex gap-1 text-xs">
                          <button onClick={() => selectAllClinics(role, true)}
                            className="text-blue-500 hover:underline">All</button>
                          <span className="text-slate-300">|</span>
                          <button onClick={() => selectAllClinics(role, false)}
                            className="text-slate-400 hover:underline">None</button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clinics.map(clinic => (
                  <tr key={clinic.id} className="table-row">
                    <td className="px-4 py-3 font-medium text-slate-700">{clinic.name}</td>
                    {roles.map(role => {
                      const enabled = cMatrix[role]?.[clinic.id] ?? true;
                      const id      = `clinic-${role}-${clinic.id}`;
                      const isSaving = saving === id;
                      const isSaved  = saved  === id;
                      return (
                        <td key={role} className="px-4 py-3 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={isSaving}
                              onChange={e => toggle("clinic", role, clinic.id, e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            {isSaving && <span className="ml-1 text-xs text-slate-400">…</span>}
                            {isSaved  && <span className="ml-1 text-xs text-green-500">✓</span>}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            <strong>Note:</strong> Branch access works together with the individual user's clinic assignment.
            A user can only see branches that are both (1) allowed for their role here, and (2) assigned to them under Staff management.
          </div>
        </div>
      )}
    </div>
  );
}
