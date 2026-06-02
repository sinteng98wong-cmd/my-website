"use client";

import { useState } from "react";
import { ROLE_LABELS } from "@/lib/modules";

const ALL_ROLES = ["FINANCE","CLINIC_MANAGER","DOCTOR","NURSE","RECEPTIONIST","STOREKEEPER"] as const;

export function RoleOverrideRow({
  userId, baseRole, clinic, currentOverride,
}: {
  userId:          string;
  baseRole:        string;
  clinic:          { id: string; name: string };
  currentOverride: string | null;
  allClinics:      { id: string; name: string }[];
}) {
  const [override, setOverride] = useState<string | null>(currentOverride);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  async function handleChange(value: string) {
    const newOverride = value === "__base__" ? null : value;
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/admin/users/${userId}/clinic-role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId: clinic.id, roleOverride: newOverride }),
    });
    setSaving(false);
    if (res.ok) {
      setOverride(newOverride);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const effectiveRole = override ?? baseRole;
  const isOverridden  = !!override;

  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-md px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{clinic.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-500">
            {ROLE_LABELS[effectiveRole as keyof typeof ROLE_LABELS] ?? effectiveRole}
          </span>
          {isOverridden
            ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">overridden</span>
            : <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">base role</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <select
          className="form-input text-xs py-1 w-44"
          value={override ?? "__base__"}
          disabled={saving}
          onChange={e => handleChange(e.target.value)}
        >
          <option value="__base__">Use base role ({ROLE_LABELS[baseRole as keyof typeof ROLE_LABELS] ?? baseRole})</option>
          {ALL_ROLES.map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>

        {saving && <span className="text-xs text-slate-400">Saving…</span>}
        {saved  && <span className="text-xs text-green-600">✓</span>}
      </div>
    </div>
  );
}
