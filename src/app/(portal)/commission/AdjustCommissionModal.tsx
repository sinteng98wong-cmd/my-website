"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

// ── Types ─────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  treatmentId: string;
  month: string;
  txAmount: number;
  labFee: number;
  doctorSplit: number;
  doctorRate: number;
  finalPayout: number;
  patientId?: string;
  treatment: {
    treatmentType: { name: string };
    visit: { patient: { id: string; name: string } };
  };
};

type CoDoctor = {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorSplit: number;
  doctorRate: number;
  commission: number;
  status: string;
};

type TreatmentData = {
  txAmount: number;
  labFee: number;
  sst: number;
  patientId?: string;
  labJob?: { invoiceNumber?: string | null; invoiceAmount?: number | null; vendor?: { name: string } | null } | null;
  rows: CoDoctor[];
  totalSplit: number;
};

type DoctorProfile = {
  id: string;
  name: string;
  type: string;
  defaultRate: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcCommission(txAmount: number, labFee: number, sst: number, split: number, rate: number) {
  const net = Math.max(txAmount - labFee - sst, 0);
  return Math.round(net * (split / 100) * (rate / 100) * 100) / 100;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const BAR_COLOURS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-purple-500", "bg-rose-500", "bg-cyan-500",
];

function SplitBar({ doctors, highlightId, thisSplit }: {
  doctors: CoDoctor[]; highlightId: string; thisSplit: number;
}) {
  const adjusted = doctors.map(d =>
    d.id === highlightId ? { ...d, doctorSplit: thisSplit } : d
  );
  const total = adjusted.reduce((s, d) => s + d.doctorSplit, 0);
  const over  = total > 100.01;
  const ok    = Math.abs(total - 100) < 0.01;

  return (
    <div className="space-y-2">
      <div className="flex h-5 rounded-lg overflow-hidden gap-px bg-slate-200">
        {adjusted.map((d, i) => (
          <div
            key={d.id}
            className={`${BAR_COLOURS[i % BAR_COLOURS.length]} transition-all ${d.id === highlightId ? "opacity-100" : "opacity-60"}`}
            style={{ width: `${Math.min(d.doctorSplit, 100)}%` }}
            title={`${d.doctorName}: ${d.doctorSplit}%`}
          />
        ))}
        {total < 99.99 && (
          <div className="bg-slate-300" style={{ width: `${100 - total}%` }} title="Unallocated" />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {adjusted.map((d, i) => (
          <span key={d.id} className={`flex items-center gap-1 text-xs ${d.id === highlightId ? "font-semibold text-slate-800" : "text-slate-500"}`}>
            <span className={`w-2 h-2 rounded-sm ${BAR_COLOURS[i % BAR_COLOURS.length]}`} />
            {d.doctorName}: {d.id === highlightId ? thisSplit : d.doctorSplit}%
          </span>
        ))}
        {total < 99.99 && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-sm bg-slate-300" />
            Unallocated: {Math.round((100 - total) * 100) / 100}%
          </span>
        )}
      </div>
      <div className={`text-xs font-medium flex items-center gap-1 ${over ? "text-red-600" : ok ? "text-green-600" : "text-amber-600"}`}>
        <span>{over ? "✕" : ok ? "✓" : "△"}</span>
        {over
          ? `Total ${Math.round(total * 100) / 100}% — exceeds 100%`
          : ok
          ? "Total = 100% — fully allocated"
          : `Total ${Math.round(total * 100) / 100}% — ${Math.round((100 - total) * 100) / 100}% unallocated`}
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange, suffix, min = 0, max, step = "0.5", hint, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  suffix?: string; min?: number; max?: number; step?: string; hint?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number" value={value}
          onChange={e => onChange(e.target.value)}
          min={min} max={max} step={step}
          disabled={disabled}
          className={`form-input ${suffix ? "pr-8" : ""} ${disabled ? "bg-slate-50 text-slate-400" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── Add Co-Doctor Panel ───────────────────────────────────────────────────────

function AddDoctorPanel({
  treatmentId,
  month,
  txAmount,
  labFee,
  sst,
  existingDoctorIds,
  remainingSplit,
  pendingAdjustments,
  onAdded,
}: {
  treatmentId: string;
  month: string;
  txAmount: number;
  labFee: number;
  sst: number;
  existingDoctorIds: string[];
  remainingSplit: number;
  pendingAdjustments: { rowId: string; newSplit: number }[];
  onAdded: () => void;
}) {
  const [profiles,    setProfiles]    = useState<DoctorProfile[]>([]);
  const [selectedId,  setSelectedId]  = useState("");
  const [split,       setSplit]       = useState(String(Math.max(remainingSplit, 0)));
  const [rate,        setRate]        = useState("");
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState("");
  const [open,        setOpen]        = useState(false);

  useEffect(() => {
    fetch("/api/commission/doctor/profiles")
      .then(r => r.json())
      .then((data: DoctorProfile[]) => {
        setProfiles(data.filter(p => !existingDoctorIds.includes(p.id)));
      });
  }, [existingDoctorIds.join(",")]);

  // Auto-fill rate when doctor selected
  function selectDoctor(id: string) {
    setSelectedId(id);
    const profile = profiles.find(p => p.id === id);
    if (profile) setRate(String(profile.defaultRate));
  }

  const splitN = parseFloat(split) || 0;
  const rateN  = parseFloat(rate)  || 0;
  const preview = calcCommission(txAmount, labFee, sst, splitN, rateN);

  async function add() {
    if (!selectedId) { setError("Select a doctor"); return; }
    if (splitN <= 0)  { setError("Split must be > 0"); return; }
    setBusy(true); setError("");
    const res = await fetch(`/api/commission/doctor/treatment/${treatmentId}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        doctorProfileId: selectedId,
        doctorSplit:     splitN,
        doctorRate:      rateN,
        month,
        pendingAdjustments,   // tell server about unsaved split changes in this modal session
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to add doctor");
      return;
    }
    setOpen(false);
    setSelectedId(""); setSplit(String(remainingSplit)); setRate("");
    onAdded();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 text-blue-700 text-sm font-medium rounded-xl hover:bg-blue-50 transition-colors"
      >
        <span className="text-base">+</span>
        Add co-doctor ({Math.max(remainingSplit, 0).toFixed(1)}% unallocated)
      </button>
    );
  }

  return (
    <div className="border-2 border-blue-300 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold uppercase tracking-wide flex items-center justify-between">
        <span>Add Co-Doctor</span>
        <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white">✕</button>
      </div>
      <div className="p-4 space-y-3 bg-blue-50/40">
        {/* Doctor selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Select Doctor</label>
          <select
            value={selectedId}
            onChange={e => selectDoctor(e.target.value)}
            className="form-input"
          >
            <option value="">— choose doctor —</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type}) — default rate {p.defaultRate}%
              </option>
            ))}
            {profiles.length === 0 && (
              <option disabled>All doctors already assigned</option>
            )}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumInput
            label="Treatment Share (%)"
            value={split}
            onChange={setSplit}
            suffix="%" min={0} max={100}
            hint={`${remainingSplit.toFixed(1)}% available`}
          />
          <NumInput
            label="Commission Rate (%)"
            value={rate}
            onChange={setRate}
            suffix="%" min={0} max={100}
            hint="Auto-filled from profile"
          />
        </div>

        {selectedId && (
          <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-blue-200 text-sm">
            <span className="text-slate-500">Estimated commission:</span>
            <span className="font-semibold text-blue-700">{RM(preview)}</span>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          onClick={add}
          disabled={busy || !selectedId}
          className="btn-primary w-full justify-center disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add to Commission"}
        </button>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function AdjustCommissionModal({ row, onClose, onSaved }: {
  row: Row; onClose: () => void; onSaved: () => void;
}) {
  const [split,   setSplit]   = useState(String(row.doctorSplit));
  const [rate,    setRate]    = useState(String(row.doctorRate));
  const [labFee,  setLabFee]  = useState(String(row.labFee));
  const [note,    setNote]    = useState("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState("");
  const [txData,  setTxData]  = useState<TreatmentData | null>(null);
  const [loading, setLoading] = useState(true);

  function loadTxData() {
    setLoading(true);
    fetch(`/api/commission/doctor/treatment/${row.treatmentId}`)
      .then(r => r.json())
      .then(d => { setTxData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadTxData(); }, [row.treatmentId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const splitN  = parseFloat(split)  || 0;
  const rateN   = parseFloat(rate)   || 0;
  const labFeeN = parseFloat(labFee) || 0;
  const sst     = txData?.sst ?? 0;
  const net     = Math.max(row.txAmount - labFeeN - sst, 0);
  const preview = Math.round(net * (splitN / 100) * (rateN / 100) * 100) / 100;

  const changed = splitN !== row.doctorSplit || rateN !== row.doctorRate || labFeeN !== row.labFee;

  const otherSplits = txData
    ? txData.rows.filter(r => r.id !== row.id).reduce((s, r) => s + r.doctorSplit, 0)
    : 0;
  const totalPreview  = otherSplits + splitN;
  const splitOver     = totalPreview > 100.01;
  const remainingSplit = Math.max(100 - totalPreview, 0);

  const existingDoctorIds = txData?.rows.map(r => r.doctorId) ?? [];

  async function save() {
    if (splitOver) { setError("Total split across all doctors cannot exceed 100%"); return; }
    if (!changed)  { onClose(); return; }
    setBusy(true); setError("");
    const res = await fetch(`/api/commission/doctor/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust", doctorSplit: splitN, doctorRate: rateN, labFee: labFeeN, note: note || undefined }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Save failed"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900">Adjust Commission</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              <Link
                href={`/patients/${txData?.patientId || row.patientId || row.treatment.visit.patient.id}`}
                className="text-blue-600 hover:underline font-medium"
                onClick={onClose}
              >
                {row.treatment.visit.patient.name}
              </Link>
              {" — "}{row.treatment.treatmentType.name}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none mt-0.5">×</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">

          {/* Formula */}
          <div className="p-3 bg-slate-800 rounded-xl text-center">
            <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide font-medium">Commission Formula</p>
            <p className="text-sm font-mono text-white">
              (Tx − Lab Fee) × <span className="text-blue-300 font-bold">Share %</span> × <span className="text-emerald-300 font-bold">Rate %</span>
            </p>
            <p className="text-xs text-slate-400 mt-1.5">
              <span className="text-blue-300">Share</span> = this doctor's portion of the treatment revenue &nbsp;·&nbsp;
              <span className="text-emerald-300">Rate</span> = this doctor's personal commission %
            </p>
          </div>

          {/* Reference */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl text-sm">
            <div><p className="text-xs text-slate-400 mb-0.5">Tx Amount</p><p className="font-semibold">{RM(row.txAmount)}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">Lab Fee</p><p className="font-semibold">{RM(labFeeN)}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">Net</p><p className="font-semibold">{RM(net)}</p></div>
          </div>
          {txData?.labJob && (
            <div className="flex items-center gap-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <span className="font-semibold">Lab:</span>
              <span>{txData.labJob.vendor?.name ?? "—"}</span>
              {txData.labJob.invoiceNumber && (
                <span className="font-mono">#{txData.labJob.invoiceNumber}</span>
              )}
              {txData.labJob.invoiceAmount != null && (
                <span>{RM(Number(txData.labJob.invoiceAmount))}</span>
              )}
            </div>
          )}

          {/* ── Section 1: Share ─────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center">1</span>
              Treatment Share — who gets what portion
            </p>

            <NumInput label="This Doctor's Share (%)" value={split} onChange={setSplit} suffix="%" min={0} max={100} />

            {loading && <p className="text-xs text-slate-400">Loading co-doctors…</p>}
            {!loading && txData && (
              <SplitBar doctors={txData.rows} highlightId={row.id} thisSplit={splitN} />
            )}
          </div>

          {/* ── Section 2: Rate ──────────────────────────────────── */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold flex items-center justify-center">2</span>
              Commission Rate — this doctor's personal rate
            </p>
            <div className="grid grid-cols-2 gap-4">
              <NumInput label="Commission Rate (%)" value={rate} onChange={setRate} suffix="%" min={0} max={100} hint="Independent of share — each doctor has their own rate" />
              <NumInput label="Lab Fee (RM)" value={labFee} onChange={setLabFee} suffix="RM" min={0} hint="Shared deduction across all doctors" />
            </div>
          </div>

          {/* Live calculation */}
          <div className={`rounded-xl border-2 overflow-hidden ${changed ? "border-blue-300" : "border-slate-200"}`}>
            <div className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wide ${changed ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              Live Preview
            </div>
            <div className="px-4 py-3 space-y-1 text-sm bg-white">
              <div className="flex justify-between text-slate-500">
                <span>Net (Tx − Lab Fee)</span><span className="tabular-nums">{RM(net)}</span>
              </div>
              <div className="flex justify-between text-blue-600">
                <span>× Share ({splitN}%)</span><span className="tabular-nums">{RM(Math.round(net * splitN / 100 * 100) / 100)}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>× Rate ({rateN}%)</span><span className="tabular-nums font-semibold">= {RM(preview)}</span>
              </div>
            </div>
            {changed && (
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-800 flex justify-between">
                <span>Change:</span>
                <span className="font-semibold">{RM(row.finalPayout)} → {RM(preview)} ({preview >= row.finalPayout ? "+" : ""}{RM(preview - row.finalPayout)})</span>
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Reason <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Dr B handled endo portion, Dr A did crown" className="form-input" />
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          {/* ── Add co-doctor ─────────────────────────────────────── */}
          {!loading && txData && (
            <div className="pt-4 border-t border-slate-100">
              <AddDoctorPanel
                treatmentId={row.treatmentId}
                month={row.month}
                txAmount={row.txAmount}
                labFee={labFeeN}
                sst={sst}
                existingDoctorIds={existingDoctorIds}
                remainingSplit={remainingSplit}
                pendingAdjustments={[{ rowId: row.id, newSplit: splitN }]}
                onAdded={() => { loadTxData(); onSaved(); }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy || splitOver} className="btn-primary disabled:opacity-50">
            {busy ? "Saving…" : changed ? "Save Adjustment" : "No Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
