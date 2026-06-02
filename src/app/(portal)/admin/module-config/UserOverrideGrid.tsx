"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MODULE_LABELS, ROLE_LABELS, MODULE_ACTIONS, ACTION_LABELS, ACTION_SHORT,
  type ModuleKey, type ActionKey,
} from "@/lib/modules";
import type { ModuleAccessEntry } from "@/lib/module-access";

type User   = { id: string; name: string; role: string };
type Clinic = { id: string; name: string };
type AccessMap = Record<ModuleKey, ModuleAccessEntry>;

function ActionPill({
  action, active, roleHas, isOverride, disabled, onChange,
}: {
  action:    ActionKey;
  active:    boolean;
  roleHas:   boolean;
  isOverride: boolean;
  disabled:  boolean;
  onChange:  (v: boolean) => void;
}) {
  const base = active
    ? isOverride
      ? "bg-amber-500 text-white border-amber-600"   // override = amber
      : "bg-blue-600 text-white border-blue-700"     // role default = blue
    : "bg-white text-slate-200 border-slate-200 hover:border-slate-400 hover:text-slate-400";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      title={`${ACTION_LABELS[action]}${isOverride && active ? " (overridden)" : ""}`}
      className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold
        transition-colors border select-none disabled:opacity-40 disabled:cursor-not-allowed ${base}`}
    >
      {ACTION_SHORT[action]}
    </button>
  );
}

export function UserOverrideGrid({
  users,
  clinics,
}: {
  users:   User[];
  clinics: Clinic[];
}) {
  const [selectedUser,   setSelectedUser]   = useState("");
  const [selectedClinic, setSelectedClinic] = useState("");
  const [accessMap,      setAccessMap]      = useState<AccessMap | null>(null);
  const [userClinics,    setUserClinics]    = useState<string[]>([]);
  const [loadingGrid,    setLoadingGrid]    = useState(false);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState("");
  const [userInfo,       setUserInfo]       = useState<{
    name: string; effectiveRole: string; isRoleOverridden: boolean; overrideCount: number;
  } | null>(null);

  // When user changes, load their assigned clinics
  useEffect(() => {
    setSelectedClinic("");
    setAccessMap(null);
    setLoadError(null);
    setUserClinics([]);
    if (!selectedUser) return;
    fetch(`/api/admin/users/${selectedUser}/clinics`)
      .then(r => r.json())
      .then((ids: string[]) => setUserClinics(ids))
      .catch(() => setUserClinics(clinics.map(c => c.id)));
  }, [selectedUser, clinics]);

  const loadAccess = useCallback(async (userId: string, clinicId: string) => {
    setLoadingGrid(true);
    setAccessMap(null);
    setLoadError(null);
    try {
      const res  = await fetch(`/api/admin/user-module-override?userId=${userId}&clinicId=${clinicId}`);
      const data = await res.json();
      if (!res.ok) { setLoadError(data.error ?? `Error ${res.status}`); return; }
      if (!data.access) { setLoadError("No access data returned."); return; }
      setAccessMap(data.access);
      const user = users.find(u => u.id === userId);
      setUserInfo({
        name:             user?.name ?? "",
        effectiveRole:    data.access[Object.keys(data.access)[0]]?.effectiveRole ?? user?.role ?? "",
        isRoleOverridden: data.isRoleOverridden ?? false,
        overrideCount:    data.overrideCount ?? 0,
      });
    } catch (err: any) {
      setLoadError(err.message ?? "Failed to load.");
    } finally {
      setLoadingGrid(false);
    }
  }, [users]);

  useEffect(() => {
    if (selectedUser && selectedClinic) loadAccess(selectedUser, selectedClinic);
  }, [selectedUser, selectedClinic, loadAccess]);

  async function saveActions(mod: ModuleKey, actions: ActionKey[] | null) {
    setSaving(true);
    setSaveMsg("Saving…");
    try {
      const res = await fetch("/api/admin/user-module-override", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUser, clinicId: selectedClinic, module: mod, actions }),
      });
      if (!res.ok) throw new Error();
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(""), 2000);
      // Refresh
      await loadAccess(selectedUser, selectedClinic);
    } catch {
      setSaveMsg("Error saving");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAction(mod: ModuleKey, action: ActionKey, enable: boolean) {
    const entry = accessMap?.[mod];
    if (!entry) return;
    const current = entry.overrideActions ?? entry.roleActions;
    let next = enable ? [...current, action] : current.filter(a => a !== action);
    // Auto-add view when enabling any action
    if (enable && action !== "view" && !next.includes("view")) next = ["view", ...next];
    await saveActions(mod, next);
  }

  async function resetModule(mod: ModuleKey) {
    await saveActions(mod, null);
  }

  const availableClinics = userClinics.length > 0
    ? clinics.filter(c => userClinics.includes(c.id))
    : [];

  const selectedClinicName = clinics.find(c => c.id === selectedClinic)?.name ?? "";

  return (
    <div>
      {/* Selectors */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="form-label">User</label>
          <select className="form-input" value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}>
            <option value="">Select user…</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} ({ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Branch</label>
          <select className="form-input" value={selectedClinic}
            onChange={e => setSelectedClinic(e.target.value)}
            disabled={!selectedUser}>
            <option value="">
              {!selectedUser ? "Select a user first…" : "Select branch…"}
            </option>
            {availableClinics.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedUser && availableClinics.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Not assigned to any branch. Assign them in Users first.
            </p>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-blue-600 text-white text-xs font-bold flex items-center justify-center">V</span>
          <span>Role default (active)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-amber-500 text-white text-xs font-bold flex items-center justify-center">C</span>
          <span>Admin override (active)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-white border border-slate-200 text-slate-300 text-xs font-bold flex items-center justify-center">E</span>
          <span>Not granted</span>
        </div>
      </div>

      {/* Summary */}
      {userInfo && (
        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm flex items-center justify-between">
          <span>
            <span className="font-medium">{userInfo.name}</span> at <span className="font-medium">{selectedClinicName}</span>
            {" — "}effective role:{" "}
            <span className="font-semibold">{ROLE_LABELS[userInfo.effectiveRole as keyof typeof ROLE_LABELS] ?? userInfo.effectiveRole}</span>
            {userInfo.isRoleOverridden && (
              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">role overridden</span>
            )}
          </span>
          <span className={userInfo.overrideCount > 0 ? "text-amber-600 font-medium text-xs" : "text-slate-400 text-xs"}>
            {userInfo.overrideCount} module override{userInfo.overrideCount !== 1 ? "s" : ""} active
          </span>
        </div>
      )}

      {/* Save status */}
      {saveMsg && (
        <div className="text-right text-sm mb-2">
          <span className={saveMsg.includes("Error") ? "text-red-600" : saveMsg.includes("✓") ? "text-green-600" : "text-slate-400"}>
            {saveMsg}
          </span>
        </div>
      )}

      {/* States */}
      {!selectedUser || !selectedClinic ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">
          {!selectedUser ? "Select a user to begin" : "Now select which branch to configure"}
        </div>
      ) : loadingGrid ? (
        <div className="border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">
          Loading module access…
        </div>
      ) : loadError ? (
        <div className="border border-red-200 bg-red-50 rounded-xl p-8 text-center text-sm">
          <p className="font-medium text-red-700 mb-1">Could not load module access</p>
          <p className="text-red-400 text-xs">{loadError}</p>
          <button onClick={() => loadAccess(selectedUser, selectedClinic)}
            className="mt-3 text-xs text-red-600 underline">Try again</button>
        </div>
      ) : accessMap ? (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white border-b-2 border-slate-200 sticky top-0 z-10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[140px] border-r border-slate-200">
                    Module
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Actions
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">
                    Reset
                  </th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((mod, i) => {
                  const entry = accessMap[mod];
                  if (!entry) return null;
                  const available      = MODULE_ACTIONS[mod] ?? ["view"];
                  const isOverridden   = entry.overrideActions !== null;
                  const effectiveSet   = new Set(entry.effectiveActions);
                  const roleSet        = new Set(entry.roleActions);
                  const bg             = i % 2 === 0 ? "bg-white" : "bg-slate-50/50";

                  return (
                    <tr key={mod} className={`border-b border-slate-100 ${bg}`}>
                      <td className="px-4 py-3 font-medium text-slate-800 border-r border-slate-200">
                        {MODULE_LABELS[mod]}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {available.map(action => (
                            <ActionPill
                              key={action}
                              action={action}
                              active={effectiveSet.has(action)}
                              roleHas={roleSet.has(action)}
                              isOverride={isOverridden && effectiveSet.has(action) !== roleSet.has(action)}
                              disabled={saving}
                              onChange={v => toggleAction(mod, action, v)}
                            />
                          ))}
                          {effectiveSet.size === 0 && (
                            <span className="text-xs text-slate-300 italic">No access</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {isOverridden ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                            Overridden
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            Role default
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isOverridden && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => resetModule(mod)}
                            title="Reset to role default"
                            className="text-slate-300 hover:text-red-500 text-xl font-bold disabled:opacity-40"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
