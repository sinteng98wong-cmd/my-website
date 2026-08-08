"use client";

import { useEffect, useState } from "react";

type Clinic = { id: string; name: string };

export function PayrollSettingsClient({ clinics, canEdit }: { clinics: Clinic[]; canEdit: boolean }) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [cfg, setCfg] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    if (!clinicId) return;
    setMsg(""); setError("");
    const d = await fetch(`/api/admin/clinic-payroll-config?clinicId=${clinicId}`).then((r) => r.json());
    setCfg(d?.error ? null : d);
    if (d?.error) setError(d.error);
  }
  useEffect(() => { load(); }, [clinicId]);

  async function save() {
    setBusy(true); setMsg(""); setError("");
    const res = await fetch("/api/admin/clinic-payroll-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicId,
        firstApproverId: cfg.firstApproverId || null,
        secondApproverId: cfg.secondApproverId || null,
        headNurseStaffProfileId: cfg.headNurseStaffProfileId || null,
        lunchOtAllowed: !!cfg.lunchOtAllowed,
        lunchOtMaxMinutes: Number(cfg.lunchOtMaxMinutes) || 0,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Save failed"); return; }
    setMsg("Payroll settings saved.");
    load();
  }

  const set = (patch: any) => setCfg({ ...cfg, ...patch });

  return (
    <div className="space-y-5 max-w-3xl">
      <select className="form-input w-56 text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
        {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}
      {msg && <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{msg}</div>}

      {cfg && (
        <>
          <div className="card p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-slate-800">Payment approvers</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                The 1st approver signs each payslip after HR locks the payroll. The 2nd approver
                signs the bank payment, which releases the money. They must be different people,
                and whoever prepares a bank payment can never approve it.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <label className="block">
                <span className="text-xs uppercase text-slate-500">1st payment approver</span>
                <select className="form-input mt-1 w-full" disabled={!canEdit} value={cfg.firstApproverId ?? ""} onChange={(e) => set({ firstApproverId: e.target.value })}>
                  <option value="">— not set —</option>
                  {cfg.candidates.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs uppercase text-slate-500">2nd payment approver</span>
                <select className="form-input mt-1 w-full" disabled={!canEdit} value={cfg.secondApproverId ?? ""} onChange={(e) => set({ secondApproverId: e.target.value })}>
                  <option value="">— not set —</option>
                  {cfg.candidates.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-slate-800">Monthly attendance</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Only the designated Head Nurse may submit the branch&apos;s monthly attendance.
                Payroll for a month cannot be locked until they have submitted it.
              </p>
            </div>
            <label className="block text-sm">
              <span className="text-xs uppercase text-slate-500">Head Nurse</span>
              <select className="form-input mt-1 w-full md:w-1/2" disabled={!canEdit} value={cfg.headNurseStaffProfileId ?? ""} onChange={(e) => set({ headNurseStaffProfileId: e.target.value })}>
                <option value="">— not set —</option>
                {cfg.nurses.map((n: any) => <option key={n.id} value={n.id}>{n.name}{n.jobTitle ? ` — ${n.jobTitle}` : ` (${n.role})`}</option>)}
              </select>
            </label>
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-slate-800">Lunch OT</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Lunch OT is a branch-level permission. Where it is off, Lunch OT minutes are
                refused at entry and never paid — it is not an attendance exception to be waved through.
              </p>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" disabled={!canEdit} checked={!!cfg.lunchOtAllowed} onChange={(e) => set({ lunchOtAllowed: e.target.checked })} />
                <span>Allow Lunch OT at this branch</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs uppercase text-slate-500">Daily cap (minutes)</span>
                <input type="number" min={0} max={480} className="form-input w-24" disabled={!canEdit || !cfg.lunchOtAllowed}
                  value={cfg.lunchOtMaxMinutes ?? 60} onChange={(e) => set({ lunchOtMaxMinutes: e.target.value })} />
              </label>
            </div>
          </div>

          {canEdit && <button onClick={save} disabled={busy} className="btn-primary text-sm">{busy ? "Saving…" : "Save Settings"}</button>}
        </>
      )}
    </div>
  );
}
