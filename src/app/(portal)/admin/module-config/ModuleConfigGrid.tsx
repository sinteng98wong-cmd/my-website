"use client";

import { useState, useCallback } from "react";
import {
  MODULE_LABELS, ROLE_LABELS, MODULE_ACTIONS, ACTION_LABELS, ACTION_SHORT,
  type ModuleKey, type ConfigurableRole, type ActionKey,
} from "@/lib/modules";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const ROLE_COLORS: Record<ConfigurableRole, string> = {
  FINANCE:        "bg-blue-50 text-blue-700",
  CLINIC_MANAGER: "bg-amber-50 text-amber-700",
  DOCTOR:         "bg-indigo-50 text-indigo-700",
  NURSE:          "bg-green-50 text-green-700",
  RECEPTIONIST:   "bg-purple-50 text-purple-700",
  STOREKEEPER:    "bg-orange-50 text-orange-700",
};

function ActionPill({
  action,
  active,
  disabled,
  onChange,
}: {
  action: ActionKey;
  active: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      title={ACTION_LABELS[action]}
      className={`
        inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold
        transition-colors border select-none
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active
          ? "bg-blue-600 text-white border-blue-700"
          : "bg-white text-slate-300 border-slate-200 hover:border-slate-400 hover:text-slate-500"}
      `}
    >
      {ACTION_SHORT[action]}
    </button>
  );
}

export function ModuleConfigGrid({
  modules,
  roles,
  initialGrid,
}: {
  modules:     ModuleKey[];
  roles:       ConfigurableRole[];
  initialGrid: Record<string, Record<string, ActionKey[]>>;
}) {
  const [grid,   setGrid]   = useState(initialGrid);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const toggleAction = useCallback(
    async (mod: ModuleKey, role: ConfigurableRole, action: ActionKey, enabled: boolean) => {
      const prev  = grid[mod]?.[role] ?? [];
      const next  = enabled ? [...prev, action] : prev.filter(a => a !== action);
      // If adding an action other than "view", auto-add "view" too
      const final = enabled && action !== "view" && !next.includes("view")
        ? ["view", ...next]
        : next;

      setGrid(g => ({ ...g, [mod]: { ...g[mod], [role]: final } } as Record<string, Record<string, ActionKey[]>>));
      setSaving(true);
      setStatus("saving");

      try {
        const res = await fetch("/api/admin/module-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, module: mod, actions: final }),
        });
        if (!res.ok) throw new Error();
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } catch {
        setGrid(g => ({ ...g, [mod]: { ...g[mod], [role]: prev } } as Record<string, Record<string, ActionKey[]>>));
        setStatus("error");
      } finally {
        setSaving(false);
      }
    },
    [grid]
  );

  const allActions: ActionKey[] = ["view", "create", "edit", "delete", "export", "approve"];

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Actions:</span>
        {allActions.map(a => (
          <span key={a} className="flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-600 text-white font-bold text-xs">
              {ACTION_SHORT[a]}
            </span>
            {ACTION_LABELS[a]}
          </span>
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center justify-end mb-3 h-5">
        {status === "saving" && (
          <span className="text-sm text-slate-400 flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Saving…
          </span>
        )}
        {status === "saved" && <span className="text-sm text-green-600 font-medium">Saved ✓</span>}
        {status === "error" && <span className="text-sm text-red-600 font-medium">Error — try again</span>}
      </div>

      {/* Grid */}
      <div className="border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b-2 border-slate-200 sticky top-0 z-10">
                <th className="sticky left-0 z-20 bg-white px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-r border-slate-200 min-w-[140px]">
                  Module
                </th>
                {roles.map(role => (
                  <th key={role} className="px-3 py-3 text-center min-w-[150px]">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[role]}`}>
                      {ROLE_LABELS[role]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod, i) => {
                const available = MODULE_ACTIONS[mod] ?? ["view"];
                const bg = i % 2 === 0 ? "bg-white" : "bg-slate-50/50";
                return (
                  <tr key={mod} className={`border-b border-slate-100 ${bg}`}>
                    <td className={`sticky left-0 z-10 px-4 py-3 font-medium text-slate-800 border-r border-slate-200 ${bg}`}>
                      <div>{MODULE_LABELS[mod as ModuleKey] ?? mod}</div>
                      <div className="text-xs text-slate-400 font-normal mt-0.5">
                        {available.map(a => ACTION_SHORT[a]).join(" ")}
                      </div>
                    </td>
                    {roles.map(role => {
                      const roleActions = grid[mod]?.[role] ?? [];
                      const hasAny = roleActions.length > 0;
                      return (
                        <td key={role} className="px-3 py-3 text-center">
                          <div className="flex flex-wrap justify-center gap-1">
                            {available.map(action => (
                              <ActionPill
                                key={action}
                                action={action}
                                active={roleActions.includes(action)}
                                disabled={saving}
                                onChange={v => toggleAction(mod, role, action, v)}
                              />
                            ))}
                          </div>
                          {!hasAny && (
                            <div className="text-xs text-slate-300 mt-1">No access</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Super Admin always has all actions on all modules. Changes take effect on next page load.
        Ticking any action other than View will automatically add View.
      </p>
    </div>
  );
}
