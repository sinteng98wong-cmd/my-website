"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["DOCTOR","NURSE","RECEPTIONIST","STOREKEEPER","CLINIC_MANAGER","FINANCE"] as const;

const ROLE_CLASS: Record<string, string> = {
  DOCTOR:         "badge-blue",
  NURSE:          "badge-green",
  RECEPTIONIST:   "badge-slate",
  STOREKEEPER:    "badge-amber",
  CLINIC_MANAGER: "badge-amber",
  FINANCE:        "badge-blue",
};

type UserClinicRow = {
  clinicId: string;
  roleOverride: string | null;
  clinic: { id: string; name: string };
};

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  userClinics: UserClinicRow[];
};

type Clinic = { id: string; name: string };

export function StaffClient({ staff, clinics }: { staff: StaffUser[]; clinics: Clinic[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving]     = useState<string | null>(null);
  const [localStaff, setLocalStaff] = useState<StaffUser[]>(staff);

  async function setRoleOverride(userId: string, clinicId: string, roleOverride: string) {
    const key = `${userId}-${clinicId}`;
    setSaving(key);
    await fetch(`/api/staff/${userId}/clinic-role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId, roleOverride: roleOverride || null }),
    });
    setSaving(null);

    // Update local state
    setLocalStaff(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const existingLink = u.userClinics.find(uc => uc.clinicId === clinicId);
      if (existingLink) {
        return { ...u, userClinics: u.userClinics.map(uc =>
          uc.clinicId === clinicId ? { ...uc, roleOverride: roleOverride || null } : uc
        )};
      } else {
        const clinic = clinics.find(c => c.id === clinicId)!;
        return { ...u, userClinics: [...u.userClinics, { clinicId, roleOverride: roleOverride || null, clinic }] };
      }
    }));
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Staff</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {localStaff.length} team members · Click a row to manage branch role overrides
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Name", "Email", "Default Role", "Branches", "Status", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localStaff.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No records found</td></tr>
            )}
            {localStaff.map((u) => (
              <>
                <tr
                  key={u.id}
                  className={`table-row cursor-pointer ${expanded === u.id ? "bg-blue-50" : ""}`}
                  onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                >
                  <td className="px-5 py-3 font-medium text-slate-900">{u.name}</td>
                  <td className="px-5 py-3 text-slate-500">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={ROLE_CLASS[u.role] ?? "badge-slate"}>{u.role}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.userClinics.length === 0 ? (
                        <span className="text-slate-400 text-xs">No branches</span>
                      ) : u.userClinics.map((uc) => (
                        <span key={uc.clinicId} className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 flex items-center gap-1">
                          {uc.clinic.name}
                          {uc.roleOverride && (
                            <span className="text-blue-600 font-semibold">({uc.roleOverride})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={u.active ? "badge-green" : "badge-red"}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">
                    {expanded === u.id ? "▲ Close" : "▼ Branch roles"}
                  </td>
                </tr>

                {/* Expanded: per-branch role override */}
                {expanded === u.id && (
                  <tr key={`${u.id}-expanded`}>
                    <td colSpan={6} className="px-5 py-4 bg-slate-50 border-t border-slate-200">
                      <p className="text-xs font-semibold text-slate-700 mb-3">
                        Branch Role Overrides — {u.name}
                        <span className="ml-2 font-normal text-slate-400">
                          Default role: <span className="font-medium">{u.role}</span> · Leave blank to use default
                        </span>
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {clinics.map((clinic) => {
                          const link     = u.userClinics.find(uc => uc.clinicId === clinic.id);
                          const current  = link?.roleOverride ?? "";
                          const key      = `${u.id}-${clinic.id}`;
                          const isSaving = saving === key;

                          return (
                            <div key={clinic.id} className="bg-white border border-slate-200 rounded-lg p-3">
                              <p className="text-xs font-medium text-slate-700 mb-2">{clinic.name}</p>
                              <div className="flex items-center gap-2">
                                <select
                                  defaultValue={current}
                                  onChange={e => setRoleOverride(u.id, clinic.id, e.target.value)}
                                  disabled={isSaving}
                                  className="form-input text-xs py-1.5 flex-1"
                                >
                                  <option value="">— Use default ({u.role}) —</option>
                                  {ROLES.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                                {isSaving && <span className="text-xs text-slate-400">…</span>}
                                {!isSaving && current && (
                                  <span className="text-xs text-blue-600 font-medium whitespace-nowrap">
                                    ✓ {current}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
