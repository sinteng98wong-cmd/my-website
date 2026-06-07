"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Clinic        = { id: string; name: string };
type Doctor        = { id: string; name: string };
type TreatmentType = { id: string; name: string };
type Template      = { id: string; name: string; description: string | null; order: number; defaultCost: number | null };
type StageRow      = {
  name: string; description: string; order: number; cost: string;
  templateId?: string; typeName?: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

export function NewPlanClient({
  clinics, doctors, treatmentTypes, initialClinicId, initialDentistId, isDoctor,
}: {
  clinics: Clinic[]; doctors: Doctor[]; treatmentTypes: TreatmentType[];
  initialClinicId: string; initialDentistId: string; isDoctor: boolean;
}) {
  const router = useRouter();

  const [patientSearch,  setPatientSearch]  = useState("");
  const [patientOptions, setPatientOptions] = useState<{ id: string; name: string; patientRef: string }[]>([]);
  const [patientId,      setPatientId]      = useState("");
  const [patientName,    setPatientName]    = useState("");

  const [clinicId,    setClinicId]    = useState(initialClinicId);
  const [dentistId,   setDentistId]   = useState(initialDentistId);
  const [title,       setTitle]       = useState("");
  const [toothCodes,  setToothCodes]  = useState("");
  const [paymentMode, setPaymentMode] = useState("DEPOSIT_BALANCE");
  const [discount,    setDiscount]    = useState("0");
  const [deposit,     setDeposit]     = useState("0");
  const [notes,       setNotes]       = useState("");
  const [stages,      setStages]      = useState<StageRow[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  // Multi-treatment-type: preview state
  const [addTypeId,       setAddTypeId]       = useState("");
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [previewTemplates, setPreviewTemplates] = useState<(Template & { typeName: string }) [] | null>(null);

  // Track which types have been applied (for dedup)
  const [appliedTypeIds, setAppliedTypeIds] = useState<string[]>([]);

  async function searchPatients(q: string) {
    setPatientSearch(q);
    if (q.length < 2) { setPatientOptions([]); return; }
    const res  = await fetch(`/api/patients?search=${encodeURIComponent(q)}&limit=8`);
    const data = res.ok ? await res.json() : { patients: [] };
    setPatientOptions(data.patients ?? data ?? []);
  }

  async function handleTypeSelect(typeId: string) {
    setAddTypeId(typeId);
    setPreviewTemplates(null);
    if (!typeId) return;
    const typeName = treatmentTypes.find(t => t.id === typeId)?.name ?? "";
    setPreviewLoading(true);
    const res       = await fetch(`/api/admin/stage-templates?treatmentTypeId=${typeId}`);
    const templates: Template[] = res.ok ? await res.json() : [];
    setPreviewLoading(false);
    setPreviewTemplates(templates.map(t => ({ ...t, typeName })));
  }

  function applyPreview() {
    if (!previewTemplates || previewTemplates.length === 0) return;
    const offset = stages.length;
    setStages(s => [
      ...s,
      ...previewTemplates.map((t, i) => ({
        name:       t.name,
        description: t.description ?? "",
        order:       offset + i + 1,
        cost:        String(t.defaultCost ?? 0),
        templateId:  t.id,
        typeName:    t.typeName,
      })),
    ]);
    setAppliedTypeIds(ids => [...ids, addTypeId]);
    setAddTypeId("");
    setPreviewTemplates(null);
  }

  function addStage() {
    setStages(s => [...s, { name: "", description: "", order: s.length + 1, cost: "0" }]);
  }

  function updateStage(i: number, field: keyof StageRow, val: string) {
    setStages(s => s.map((st, j) => j === i ? { ...st, [field]: val } : st));
  }

  function removeStage(i: number) {
    setStages(s => s.filter((_, j) => j !== i).map((st, j) => ({ ...st, order: j + 1 })));
  }

  function moveStage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    setStages(s => {
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((st, k) => ({ ...st, order: k + 1 }));
    });
  }

  const subtotal = stages.reduce((s, st) => s + (parseFloat(st.cost) || 0), 0);
  const total    = Math.max(0, subtotal - (parseFloat(discount) || 0));

  async function handleSubmit(e: React.FormEvent, sendQuotation = false) {
    e.preventDefault();
    setError("");
    if (!patientId) { setError("Select a patient"); return; }
    if (!clinicId)  { setError("Select a branch"); return; }
    if (!dentistId) { setError("Select a dentist"); return; }
    if (!title)     { setError("Plan title is required"); return; }
    if (stages.length === 0) { setError("At least one stage is required"); return; }

    setSaving(true);
    const res = await fetch("/api/treatment-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId, clinicId, dentistId, title,
        toothCodes:      toothCodes.split(",").map(s => s.trim()).filter(Boolean),
        stages:          stages.map((s, i) => ({
          name:        s.name,
          description: s.description || undefined,
          order:       i + 1,
          cost:        parseFloat(s.cost) || 0,
          templateId:  s.templateId,
        })),
        paymentMode,
        discount:        parseFloat(discount) || 0,
        depositRequired: parseFloat(deposit)  || 0,
        notes:           notes || undefined,
      }),
    });

    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to create plan"); return; }

    if (sendQuotation) {
      await fetch(`/api/treatment-plans/${data.id}/quote`, { method: "PATCH" });
    }
    router.push(`/treatment-plans/${data.id}`);
  }

  // Group applied type names for display
  const appliedTypeNames = appliedTypeIds
    .map(id => treatmentTypes.find(t => t.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/treatment-plans" className="text-sm text-slate-500 hover:text-slate-700">← Treatment Plans</Link>
        <h1 className="page-title mt-2">New Treatment Plan</h1>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      <form className="space-y-5">

        {/* Patient */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Patient</h2>
          <div className="relative">
            <input className="form-input" placeholder="Search patient by name or ref…"
              value={patientSearch}
              onChange={e => searchPatients(e.target.value)} />
            {patientOptions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {patientOptions.map(p => (
                  <button key={p.id} type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center justify-between"
                    onClick={() => {
                      setPatientId(p.id);
                      setPatientName(p.name);
                      setPatientSearch(p.name + " (" + p.patientRef + ")");
                      setPatientOptions([]);
                    }}>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-slate-400 text-xs">{p.patientRef}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {patientId && <p className="text-xs text-green-600 mt-1.5">✓ {patientName} selected</p>}
        </div>

        {/* Plan info */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Plan Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Branch</label>
              <select className="form-input" value={clinicId} onChange={e => setClinicId(e.target.value)} required>
                <option value="">Select branch…</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Dentist</label>
              <select className="form-input" value={dentistId} onChange={e => setDentistId(e.target.value)} disabled={isDoctor} required>
                <option value="">Select dentist…</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Plan Title</label>
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Root Canal + Crown — Tooth 16" required />
          </div>
          <div>
            <label className="form-label">Tooth Codes (FDI)</label>
            <input className="form-input" value={toothCodes} onChange={e => setToothCodes(e.target.value)}
              placeholder="16, 17 (comma separated)" />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional clinical or plan notes" />
          </div>
        </div>

        {/* Treatment Types & Stages */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Treatment Stages</h2>
            <button type="button" onClick={addStage} className="btn-outline text-xs py-1 px-3">+ Add Custom Stage</button>
          </div>

          {/* Applied type chips */}
          {appliedTypeNames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {appliedTypeNames.map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Add treatment type selector */}
          <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50">
            <p className="text-xs font-medium text-slate-600">Auto-fill stages from a treatment type</p>
            <div className="flex gap-2">
              <select
                className="form-input flex-1"
                value={addTypeId}
                onChange={e => handleTypeSelect(e.target.value)}
              >
                <option value="">Select treatment type…</option>
                {treatmentTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Preview */}
            {previewLoading && (
              <p className="text-xs text-slate-400">Loading templates…</p>
            )}
            {previewTemplates !== null && !previewLoading && (
              previewTemplates.length === 0 ? (
                <p className="text-xs text-slate-400">No active stage templates for this treatment type.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{previewTemplates.length} stages</span> will be added:{" "}
                    {previewTemplates.map(t => t.name).join(", ")}
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-xs">
                    {previewTemplates.map((t, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2">
                        <div>
                          <span className="font-medium text-slate-700">{i + 1}. {t.name}</span>
                          {t.description && <span className="text-slate-400 ml-2">{t.description}</span>}
                        </div>
                        <span className="font-mono text-slate-500">{fmt(t.defaultCost ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={applyPreview}
                      className="btn-primary text-xs py-1.5 px-4"
                    >
                      Add {previewTemplates.length} Stages
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddTypeId(""); setPreviewTemplates(null); }}
                      className="btn-outline text-xs py-1.5 px-4"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Stages list */}
          {stages.length === 0 ? (
            <p className="text-sm text-slate-400 py-2 text-center">No stages yet. Add a treatment type above or add a custom stage.</p>
          ) : (
            <div className="space-y-2">
              {stages.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 bg-white border border-slate-200 rounded-lg">
                  {/* Reorder */}
                  <div className="col-span-1 flex flex-col items-center gap-0.5 pt-1">
                    <button
                      type="button"
                      onClick={() => moveStage(i, -1)}
                      disabled={i === 0}
                      className="text-slate-300 hover:text-slate-600 disabled:opacity-30 text-xs leading-none"
                      title="Move up"
                    >▲</button>
                    <span className="text-xs text-slate-400 font-mono">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => moveStage(i, 1)}
                      disabled={i === stages.length - 1}
                      className="text-slate-300 hover:text-slate-600 disabled:opacity-30 text-xs leading-none"
                      title="Move down"
                    >▼</button>
                  </div>

                  {/* Name */}
                  <div className="col-span-4">
                    {s.typeName && (
                      <span className="inline-block text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 mb-1">
                        {s.typeName}
                      </span>
                    )}
                    <input className="form-input text-sm" placeholder="Stage name"
                      value={s.name} onChange={e => updateStage(i, "name", e.target.value)} required />
                  </div>

                  {/* Description */}
                  <div className="col-span-4">
                    <input className="form-input text-sm" placeholder="Description (optional)"
                      value={s.description} onChange={e => updateStage(i, "description", e.target.value)} />
                  </div>

                  {/* Cost */}
                  <div className="col-span-2">
                    <input className="form-input text-sm" type="number" step="0.01" min="0" placeholder="Cost"
                      value={s.cost} onChange={e => updateStage(i, "cost", e.target.value)} />
                  </div>

                  {/* Remove */}
                  <div className="col-span-1 pt-1 flex justify-end">
                    <button type="button" onClick={() => removeStage(i)}
                      className="text-red-400 hover:text-red-600 text-lg leading-none">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Payment Settings</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Payment Mode</label>
              <select className="form-input" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                <option value="DEPOSIT_BALANCE">Deposit + Balance</option>
                <option value="PAY_PER_STAGE">Pay Per Stage</option>
                <option value="FULL_UPFRONT">Full Upfront</option>
              </select>
            </div>
            <div>
              <label className="form-label">Discount (MYR)</label>
              <input className="form-input" type="number" step="0.01" min="0"
                value={discount} onChange={e => setDiscount(e.target.value)} />
            </div>
            {paymentMode === "DEPOSIT_BALANCE" && (
              <div>
                <label className="form-label">Required Deposit (MYR)</label>
                <input className="form-input" type="number" step="0.01" min="0"
                  value={deposit} onChange={e => setDeposit(e.target.value)} />
              </div>
            )}
          </div>

          {/* Quotation summary */}
          <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal ({stages.length} stages)</span>
              <span className="font-mono">{fmt(subtotal)}</span>
            </div>
            {parseFloat(discount) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span className="font-mono">({fmt(parseFloat(discount) || 0)})</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-200">
              <span>Total</span>
              <span className="font-mono">{fmt(total)}</span>
            </div>
            {paymentMode === "DEPOSIT_BALANCE" && parseFloat(deposit) > 0 && (
              <div className="flex justify-between text-blue-600">
                <span>Deposit Required</span>
                <span className="font-mono">{fmt(parseFloat(deposit) || 0)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Link href="/treatment-plans" className="btn-outline">Cancel</Link>
          <button type="button" onClick={e => handleSubmit(e as any)} disabled={saving} className="btn-outline">
            {saving ? "Saving…" : "Save as Draft"}
          </button>
          <button type="button" onClick={e => handleSubmit(e as any, true)} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save & Send Quotation"}
          </button>
        </div>
      </form>
    </div>
  );
}
