"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, RotateCcw, Percent, FlaskConical, Wallet, CheckCircle2 } from "lucide-react";

type StageRule = {
  name: string;
  percent: number;
  requiresLabInvoice?: boolean;
  paymentThresholdPct?: number;
  requiresCaseComplete?: boolean;
};

type Scheme = {
  id?: string;
  clinicId: string | null;
  name: string;
  matchCodes: string[];
  subTypes: string[];
  paymentTracked: boolean;
  stages: StageRule[];
  active: boolean;
};

interface Props {
  clinics:  { id: string; name: string }[];
  saved:    Scheme[];
  defaults: Omit<Scheme, "id" | "clinicId" | "active">[];
}

export function PayoutRulesClient({ clinics, saved, defaults }: Props) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState<string>(""); // "" = global defaults

  // Effective editing set for the selected scope: saved row for this scope,
  // else (for clinic scope) the global saved row, else the built-in default.
  const schemes = useMemo(() => {
    const byName = new Map<string, Scheme & { source: "default" | "global" | "clinic" }>();
    for (const d of defaults) {
      byName.set(d.name, { ...d, clinicId: clinicId || null, active: true, id: undefined, source: "default" });
    }
    for (const s of saved.filter(s => s.clinicId === null)) {
      byName.set(s.name, { ...s, ...(clinicId ? { id: undefined, clinicId } : {}), source: "global" });
    }
    if (clinicId) {
      for (const s of saved.filter(s => s.clinicId === clinicId)) {
        byName.set(s.name, { ...s, source: "clinic" });
      }
    }
    return Array.from(byName.values());
  }, [clinicId, saved, defaults]);

  return (
    <div className="space-y-5">
      {/* Scope selector */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-600">Rules for</label>
        <select value={clinicId} onChange={e => setClinicId(e.target.value)} className="form-input w-auto">
          <option value="">All clinics (default)</option>
          {clinics.map(c => <option key={c.id} value={c.id}>{c.name} (override)</option>)}
        </select>
        {clinicId && (
          <p className="text-xs text-slate-400">
            Saving here creates a copy that applies only to this clinic — other clinics keep the default.
          </p>
        )}
      </div>

      {schemes.map(s => (
        <SchemeCard key={`${clinicId}:${s.name}`} scheme={s} onSaved={() => router.refresh()} />
      ))}
    </div>
  );
}

// ─── Single scheme editor ─────────────────────────────────────────────────────

function SchemeCard({ scheme, onSaved }: { scheme: Scheme & { source: string }; onSaved: () => void }) {
  const [stages, setStages]         = useState<StageRule[]>(scheme.stages.map(s => ({ ...s })));
  const [matchCodes, setMatchCodes] = useState(scheme.matchCodes.join(", "));
  const [subTypes, setSubTypes]     = useState(scheme.subTypes.join(", "));
  const [paymentTracked, setPT]     = useState(scheme.paymentTracked);
  const [busy, setBusy]             = useState(false);
  const [msg, setMsg]               = useState("");
  const [err, setErr]               = useState("");

  const total = stages.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  // No stages = one-off scheme (full release on completion) — always valid
  const totalOk = stages.length === 0 || Math.abs(total - 100) <= 0.01;

  function setStage(i: number, patch: Partial<StageRule>) {
    setStages(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s));
  }

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    const res = await fetch("/api/payout-schemes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: scheme.id,
        clinicId: scheme.clinicId,
        name: scheme.name,
        matchCodes: matchCodes.split(",").map(c => c.trim()).filter(Boolean),
        subTypes:   subTypes.split(",").map(c => c.trim()).filter(Boolean),
        paymentTracked,
        stages,
        active: true,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "Save failed"); return; }
    setMsg("Saved");
    onSaved();
  }

  async function resetToDefault() {
    if (!scheme.id) return;
    setBusy(true); setErr(""); setMsg("");
    const res = await fetch(`/api/payout-schemes/${scheme.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setErr(d.error ?? "Reset failed"); return; }
    setMsg("Reset to default");
    onSaved();
  }

  const sourceBadge = {
    default: <span className="badge-slate text-[10px]">Built-in default</span>,
    global:  <span className="badge-blue text-[10px]">Customised (all clinics)</span>,
    clinic:  <span className="badge-purple text-[10px]">Clinic override</span>,
  }[scheme.source as "default" | "global" | "clinic"];

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold text-slate-900">{scheme.name}</h3>
        {sourceBadge}
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={paymentTracked} onChange={e => setPT(e.target.checked)} className="rounded" />
          <Wallet size={14} className="text-slate-400" />
          Release by patient payment progress
        </label>
      </div>

      {/* Stage rows */}
      <div className={paymentTracked ? "opacity-40 pointer-events-none" : ""}>
        <div className="grid grid-cols-[1fr_90px_120px_120px_110px_36px] gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">
          <span>Stage</span><span>Percent</span><span>Lab invoice</span><span>Payment ≥ %</span><span>Case done</span><span />
        </div>
        <div className="space-y-1.5">
          {stages.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_120px_120px_110px_36px] gap-2 items-center">
              <input value={s.name} onChange={e => setStage(i, { name: e.target.value })} className="form-input text-sm py-1.5" placeholder="Stage name" />
              <div className="relative">
                <input type="number" min="0" max="100" step="0.5" value={s.percent}
                  onChange={e => setStage(i, { percent: Number(e.target.value) })}
                  className="form-input text-sm py-1.5 pr-7" />
                <Percent size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
              <label className="flex items-center justify-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={!!s.requiresLabInvoice}
                  onChange={e => setStage(i, { requiresLabInvoice: e.target.checked || undefined })} className="rounded" />
                <FlaskConical size={12} />
              </label>
              <input type="number" min="0" max="100" placeholder="—" value={s.paymentThresholdPct ?? ""}
                onChange={e => setStage(i, { paymentThresholdPct: e.target.value ? Number(e.target.value) : undefined })}
                className="form-input text-sm py-1.5 text-center" />
              <label className="flex items-center justify-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={!!s.requiresCaseComplete}
                  onChange={e => setStage(i, { requiresCaseComplete: e.target.checked || undefined })} className="rounded" />
                <CheckCircle2 size={12} />
              </label>
              <button onClick={() => setStages(prev => prev.filter((_, j) => j !== i))}
                className="text-slate-300 hover:text-red-500 transition-colors flex justify-center">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => setStages(prev => [...prev, { name: "", percent: 0 }])}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            <Plus size={12} /> Add stage
          </button>
          <span className={`text-xs font-medium ml-auto ${totalOk ? "text-green-600" : "text-red-600"}`}>
            {stages.length === 0
              ? "No stages — one-off completion, full release"
              : <>Total: {total}% {totalOk ? "✓" : "(must equal 100%)"}</>}
          </span>
        </div>
      </div>

      {/* Match codes + sub-types */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="form-label text-xs">Match treatment codes (comma-separated)</label>
          <input value={matchCodes} onChange={e => setMatchCodes(e.target.value)} className="form-input text-sm" placeholder="RCT, ENDO, ROOT" />
        </div>
        <div>
          <label className="form-label text-xs">Sub-types (comma-separated, e.g. PFM, Valplast)</label>
          <input value={subTypes} onChange={e => setSubTypes(e.target.value)} className="form-input text-sm" placeholder="PFM, Zirconia, Emax" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <button onClick={save} disabled={busy || (!paymentTracked && !totalOk)}
          className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-40">
          <Save size={12} /> {busy ? "Saving…" : "Save"}
        </button>
        {scheme.id && (
          <button onClick={resetToDefault} disabled={busy}
            className="btn-secondary text-xs flex items-center gap-1.5">
            <RotateCcw size={12} /> Reset to default
          </button>
        )}
        {msg && <span className="text-xs text-green-600">{msg}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
