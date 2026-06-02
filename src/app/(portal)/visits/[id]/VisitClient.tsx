"use client";

import { useState } from "react";
import Link from "next/link";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}

const METHOD_LABELS: Record<string, string> = {
  CASH_CURRENT: "Cash (Current)", CASH_NEXT: "Cash (Next Month)",
  CREDIT_CARD: "Credit Card", FPX: "FPX",
  EWALLET: "eWallet", ATOME: "Atome", PANEL: "Panel",
};
const METHOD_COLORS: Record<string, string> = {
  CASH_CURRENT: "badge-green", CASH_NEXT: "badge-green",
  CREDIT_CARD: "badge-blue", FPX: "badge-blue",
  EWALLET: "badge-blue", ATOME: "badge-amber", PANEL: "badge-slate",
};
const LAB_STATUS: Record<string, string> = {
  ORDERED: "badge-amber", SENT_TO_LAB: "badge-blue",
  RECEIVED: "badge-green", FITTED: "badge-green",
};

type TreatmentType  = { id: string; name: string; defaultPrice: number };
type Vendor         = { id: string; name: string };
type Doctor         = { id: string; name: string };
type PanelProvider  = { id: string; name: string; code: string };
type PaymentLine    = { method: string; amount: number; panelProvider?: { id: string; name: string } | null };

type Treatment = {
  id: string;
  treatmentType: { id: string; name: string };
  doctor: { user: { id: string; name: string } } | null;
  billedAmount: number;
  labFee: number;
  labJob: { id: string; labJobRef: string; status: string; vendor: { name: string } } | null;
};
type Invoice = {
  id: string; invoiceRef: string; total: number; collectedAt: string | null;
  payments: PaymentLine[];
};
type Visit = {
  id: string; visitRef: string; visitDate: string;
  chiefComplaint?: string; remarks?: string;
  patient: { id: string; name: string; patientRef: string; phone?: string; isForeigner: boolean };
  clinic: { id: string; name: string };
  treatments: Treatment[];
  invoices: Invoice[];
  appointment: { id: string; apptRef: string; type: string } | null;
};

export function VisitClient({
  visit: initial, treatmentTypes, vendors, doctors, panelProviders,
}: {
  visit: Visit;
  treatmentTypes: TreatmentType[];
  vendors: Vendor[];
  doctors: Doctor[];
  panelProviders: PanelProvider[];
}) {
  const [visit, setVisit]           = useState<Visit>(initial);
  const [saving, setSaving]         = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [addingTx, setAddingTx]     = useState(false);
  const [error, setError]           = useState("");

  // Notes form
  const [notes, setNotes] = useState({
    chiefComplaint: initial.chiefComplaint ?? "",
    remarks:        initial.remarks        ?? "",
  });

  // Treatment add form
  const blank = {
    treatmentTypeId: "", doctorId: "", billedAmount: "",
    hasLab: false, labVendorId: "", labDescription: "",
    labEstimatedFee: "", labExpectedDate: "",
  };
  const [tx, setTx] = useState({ ...blank });

  // Billing form
  const [showBilling, setShowBilling]   = useState(false);
  const [billingError, setBillingError] = useState("");
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [applySst, setApplySst]         = useState(initial.patient.isForeigner);
  const SST_RATE = 0.06;

  const totalBilled   = visit.treatments.reduce((s, t) => s + Number(t.billedAmount), 0);
  const sstAmount     = applySst ? Math.round(totalBilled * SST_RATE * 100) / 100 : 0;
  const invoiceTotal  = Math.round((totalBilled + sstAmount) * 100) / 100;

  const blankLine = { method: "CASH_CURRENT", amount: "", panelProviderId: "" };
  const [payLines, setPayLines] = useState([{ ...blankLine }]);

  const payLinesTotal = payLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const payBalanceDue = Math.round((invoiceTotal - payLinesTotal) * 100) / 100;

  function addPayLine() { setPayLines(p => [...p, { ...blankLine }]); }
  function removePayLine(i: number) { setPayLines(p => p.filter((_, j) => j !== i)); }
  function updatePayLine(i: number, field: string, val: string) {
    setPayLines(p => p.map((l, j) => j === i ? { ...l, [field]: val } : l));
  }

  async function saveNotes() {
    setSavingNote(true);
    const res = await fetch(`/api/visits/${visit.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chiefComplaint: notes.chiefComplaint, remarks: notes.remarks }),
    });
    setSavingNote(false);
    if (res.ok) setVisit(v => ({ ...v, ...notes }));
  }

  function handleTypeChange(typeId: string) {
    const t = treatmentTypes.find(t => t.id === typeId);
    setTx(f => ({ ...f, treatmentTypeId: typeId, billedAmount: t ? String(t.defaultPrice) : f.billedAmount }));
  }

  async function handleAddTreatment(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!tx.treatmentTypeId) { setError("Select a treatment type"); return; }
    if (tx.hasLab && !tx.labVendorId) { setError("Select a lab vendor for the lab job"); return; }

    setAddingTx(true);
    const res = await fetch(`/api/visits/${visit.id}/treatments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        treatmentTypeId: tx.treatmentTypeId,
        doctorId:        tx.doctorId        || undefined,
        billedAmount:    parseFloat(tx.billedAmount) || 0,
        labFee:          tx.hasLab ? (parseFloat(tx.labEstimatedFee) || 0) : 0,
        labVendorId:     tx.hasLab ? tx.labVendorId    : undefined,
        labDescription:  tx.hasLab ? tx.labDescription : undefined,
        labEstimatedFee: tx.hasLab ? parseFloat(tx.labEstimatedFee) : undefined,
        labExpectedDate: tx.hasLab ? tx.labExpectedDate : undefined,
      }),
    });
    const data = await res.json();
    setAddingTx(false);
    if (!res.ok) { setError(data.error ?? "Failed to add treatment"); return; }

    const newTx: Treatment = {
      id:            data.treatment.id,
      treatmentType: data.treatment.treatmentType,
      doctor:        data.treatment.doctor,
      billedAmount:  data.treatment.billedAmount,
      labFee:        data.treatment.labFee,
      labJob:        data.labJob ? {
        id: data.labJob.id, labJobRef: data.labJob.labJobRef,
        status: data.labJob.status, vendor: data.labJob.vendor,
      } : null,
    };
    setVisit(v => ({ ...v, treatments: [...v.treatments, newTx] }));
    setTx({ ...blank });
  }

  async function handleRemoveTreatment(id: string) {
    if (!confirm("Remove this treatment?")) return;
    const res = await fetch(`/api/visits/${visit.id}/treatments?treatmentId=${id}`, { method: "DELETE" });
    if (res.ok) setVisit(v => ({ ...v, treatments: v.treatments.filter(t => t.id !== id) }));
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setBillingError("");

    // Validate all lines
    for (const l of payLines) {
      if (l.method === "PANEL" && !l.panelProviderId) {
        setBillingError("Panel payment requires a panel provider"); return;
      }
      if (!parseFloat(l.amount) || parseFloat(l.amount) <= 0) {
        setBillingError("All payment lines must have a positive amount"); return;
      }
    }
    if (Math.abs(payBalanceDue) > 0.01) {
      setBillingError(`Payment lines total (${fmt(payLinesTotal)}) must equal invoice total (${fmt(invoiceTotal)})`);
      return;
    }

    setSavingInvoice(true);
    const res = await fetch("/api/invoices", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitId:  visit.id,
        subtotal: totalBilled,
        sst:      sstAmount,
        payments: payLines.map(l => ({
          method:          l.method,
          amount:          parseFloat(l.amount),
          panelProviderId: l.panelProviderId || undefined,
        })),
      }),
    });
    const data = await res.json();
    setSavingInvoice(false);
    if (!res.ok) {
      const msg = data.issues?.formErrors?.[0] ?? data.error ?? "Failed to create invoice";
      setBillingError(msg); return;
    }
    setVisit(v => ({ ...v, invoices: [...v.invoices, data] }));
    setShowBilling(false);
    setPayLines([{ ...blankLine }]);
  }

  const totalLabFee = visit.treatments.reduce((s, t) => s + Number(t.labFee), 0);
  const alreadyInvoiced = visit.invoices.reduce((s, i) => s + Number(i.total), 0);

  return (
    <div className="space-y-6">
      {/* Patient header */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href={`/patients/${visit.patient.id}`} className="text-lg font-bold text-slate-900 hover:text-blue-600">
                {visit.patient.name}
              </Link>
              <span className="badge-slate">{visit.patient.patientRef}</span>
              {visit.patient.phone && <span className="text-sm text-slate-500">{visit.patient.phone}</span>}
              {visit.patient.isForeigner && <span className="badge-amber">Foreign</span>}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="font-mono">{visit.visitRef}</span>
              <span>·</span>
              <span>{new Date(visit.visitDate).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>·</span>
              <span>{visit.clinic.name}</span>
              {visit.appointment && (
                <><span>·</span><span>Appt: {visit.appointment.apptRef}</span></>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Billed</p>
            <p className="text-2xl font-bold text-slate-900">{fmt(totalBilled)}</p>
            {totalLabFee > 0 && <p className="text-xs text-slate-400">Lab fee: {fmt(totalLabFee)}</p>}
          </div>
        </div>
      </div>

      {/* Clinical Notes */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Clinical Notes</h2>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="form-label">Chief Complaint</label>
            <input className="form-input" placeholder="e.g. Toothache upper right, sensitivity to cold"
              value={notes.chiefComplaint}
              onChange={e => setNotes(n => ({ ...n, chiefComplaint: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Remarks / Clinical Notes</label>
            <textarea className="form-input min-h-[80px] resize-y"
              placeholder="Examination findings, treatment notes, follow-up instructions…"
              value={notes.remarks}
              onChange={e => setNotes(n => ({ ...n, remarks: e.target.value }))} />
          </div>
          <button onClick={saveNotes} disabled={savingNote} className="btn-outline text-sm w-fit">
            {savingNote ? "Saving…" : "Save Notes"}
          </button>
        </div>
      </div>

      {/* Treatments */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Treatments</h2>
        </div>

        {visit.treatments.length > 0 && (
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Treatment","Doctor","Amount","Lab Fee","Lab Job",""].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visit.treatments.map(t => (
                <tr key={t.id} className="table-row">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.treatmentType.name}</td>
                  <td className="px-4 py-3 text-slate-600">{t.doctor?.user.name ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 font-mono">{fmt(Number(t.billedAmount))}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{Number(t.labFee) > 0 ? fmt(Number(t.labFee)) : "—"}</td>
                  <td className="px-4 py-3">
                    {t.labJob ? (
                      <Link href={`/lab/${t.labJob.id}`} className="flex items-center gap-1.5 text-xs">
                        <span className="font-mono text-blue-600 hover:underline">{t.labJob.labJobRef}</span>
                        <span className={LAB_STATUS[t.labJob.status] ?? "badge-slate"}>{t.labJob.status.replace("_"," ")}</span>
                        <span className="text-slate-400">{t.labJob.vendor.name}</span>
                      </Link>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleRemoveTreatment(t.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-sm">
                <td className="px-4 py-2.5" colSpan={2}>Total</td>
                <td className="px-4 py-2.5 font-mono">{fmt(totalBilled)}</td>
                <td className="px-4 py-2.5 font-mono text-slate-500">{totalLabFee > 0 ? fmt(totalLabFee) : "—"}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        )}

        {/* Add treatment form */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Add Treatment</h3>
          {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}
          <form onSubmit={handleAddTreatment} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">Treatment Type <span className="text-red-500">*</span></label>
                <select className="form-input" value={tx.treatmentTypeId} onChange={e => handleTypeChange(e.target.value)} required>
                  <option value="">Select…</option>
                  {treatmentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Doctor</label>
                <select className="form-input" value={tx.doctorId} onChange={e => setTx(f => ({ ...f, doctorId: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Billed Amount (MYR)</label>
                <input type="number" step="0.01" min="0" className="form-input"
                  value={tx.billedAmount} onChange={e => setTx(f => ({ ...f, billedAmount: e.target.value }))} required />
              </div>
            </div>

            {/* Lab fee toggle */}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="hasLab" checked={tx.hasLab}
                onChange={e => setTx(f => ({ ...f, hasLab: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              <label htmlFor="hasLab" className="text-sm font-medium text-slate-700">Has lab work</label>
            </div>

            {tx.hasLab && (
              <div className="grid grid-cols-2 gap-3 pl-6 border-l-2 border-blue-200">
                <div>
                  <label className="form-label">Lab Vendor <span className="text-red-500">*</span></label>
                  <select className="form-input" value={tx.labVendorId} onChange={e => setTx(f => ({ ...f, labVendorId: e.target.value }))}>
                    <option value="">Select vendor…</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Estimated Lab Fee (MYR)</label>
                  <input type="number" step="0.01" min="0" className="form-input"
                    value={tx.labEstimatedFee} onChange={e => setTx(f => ({ ...f, labEstimatedFee: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <input type="text" className="form-input" placeholder="e.g. PFM Crown"
                    value={tx.labDescription} onChange={e => setTx(f => ({ ...f, labDescription: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Expected Date</label>
                  <input type="date" className="form-input"
                    value={tx.labExpectedDate} onChange={e => setTx(f => ({ ...f, labExpectedDate: e.target.value }))} />
                </div>
              </div>
            )}

            <button type="submit" disabled={addingTx} className="btn-primary text-sm">
              {addingTx ? "Adding…" : "+ Add Treatment"}
            </button>
          </form>
        </div>
      </div>

      {/* Billing / Invoices */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Billing &amp; Payment</h2>
          {visit.treatments.length > 0 && (
            <button onClick={() => setShowBilling(b => !b)} className="btn-primary text-sm">
              {showBilling ? "Cancel" : "+ Create Invoice"}
            </button>
          )}
        </div>

        {/* Create invoice form */}
        {showBilling && (
          <div className="px-5 py-5 border-b border-slate-200 bg-blue-50">
            <h3 className="text-sm font-semibold text-blue-900 mb-4">New Invoice</h3>
            {billingError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{billingError}</div>
            )}
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              {/* Totals preview */}
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="bg-white border border-slate-200 rounded-md p-3">
                  <p className="text-xs text-slate-500 mb-1">Subtotal</p>
                  <p className="font-mono font-semibold">{fmt(totalBilled)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <input type="checkbox" id="applySst" checked={applySst}
                      onChange={e => setApplySst(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300" />
                    <label htmlFor="applySst" className="text-xs text-slate-500">SST 6%</label>
                  </div>
                  <p className="font-mono font-semibold">{fmt(sstAmount)}</p>
                </div>
                <div className="bg-white border border-blue-300 rounded-md p-3">
                  <p className="text-xs text-slate-500 mb-1">Invoice Total</p>
                  <p className="font-mono font-bold text-blue-700">{fmt(invoiceTotal)}</p>
                </div>
                <div className={`rounded-md p-3 ${Math.abs(payBalanceDue) < 0.01 ? "bg-green-50 border border-green-300" : "bg-amber-50 border border-amber-300"}`}>
                  <p className="text-xs text-slate-500 mb-1">Balance Due</p>
                  <p className={`font-mono font-bold ${Math.abs(payBalanceDue) < 0.01 ? "text-green-700" : "text-amber-700"}`}>
                    {fmt(payBalanceDue)}
                  </p>
                </div>
              </div>

              {/* Payment lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="form-label mb-0">Payment Lines</label>
                  <button type="button" onClick={addPayLine} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    + Add line
                  </button>
                </div>
                <div className="space-y-2">
                  {payLines.map((line, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select className="form-input flex-1" value={line.method}
                        onChange={e => updatePayLine(i, "method", e.target.value)}>
                        {Object.entries(METHOD_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>

                      {line.method === "PANEL" && (
                        <select className="form-input flex-1" value={line.panelProviderId}
                          onChange={e => updatePayLine(i, "panelProviderId", e.target.value)} required>
                          <option value="">Select panel…</option>
                          {panelProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}

                      <input type="number" step="0.01" min="0" placeholder="0.00"
                        className="form-input w-36" value={line.amount}
                        onChange={e => updatePayLine(i, "amount", e.target.value)} required />

                      {payLines.length > 1 && (
                        <button type="button" onClick={() => removePayLine(i)}
                          className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={savingInvoice || Math.abs(payBalanceDue) > 0.01} className="btn-primary">
                  {savingInvoice ? "Creating…" : "Create Invoice"}
                </button>
                <button type="button" onClick={() => { setShowBilling(false); setBillingError(""); }} className="btn-outline">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Invoice list */}
        {visit.invoices.length === 0 && !showBilling ? (
          <p className="px-5 py-8 text-center text-slate-400 text-sm">No invoices yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {visit.invoices.map(inv => (
              <div key={inv.id} className="px-5 py-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Link href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline text-sm">
                      {inv.invoiceRef}
                    </Link>
                    {inv.collectedAt
                      ? <span className="badge-green">Paid</span>
                      : <span className="badge-amber">Pending</span>}
                  </div>
                  <span className="font-semibold text-slate-900">{fmt(Number(inv.total))}</span>
                </div>
                {/* Payment lines */}
                <div className="flex flex-wrap gap-2 mt-1">
                  {inv.payments.map((p, i) => (
                    <span key={i} className={`${METHOD_COLORS[p.method] ?? "badge-slate"} text-xs`}>
                      {p.method === "PANEL" && p.panelProvider
                        ? `Panel — ${p.panelProvider.name}`
                        : METHOD_LABELS[p.method] ?? p.method}
                      {" · "}{fmt(Number(p.amount))}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
