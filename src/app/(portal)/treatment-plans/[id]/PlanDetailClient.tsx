"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Stage = {
  id: string; name: string; description: string|null; order: number; status: string;
  cost: number; completedAt: string|null; clinicalNotes: string|null; nextStageDate: string|null;
  performedBy: { name: string }|null; visit: { id: string; visitRef: string }|null;
};
type Payment = {
  id: string; amount: number; paymentType: string; paidAt: string; notes: string|null;
  recordedBy: { name: string }|null; invoice: { id: string; invoiceRef: string }|null;
};
type Plan = {
  id: string; planRef: string; title: string; status: string; paymentMode: string;
  toothCodes: string[]; notes: string|null;
  subtotal: number; discount: number; sstAmount: number; totalAmount: number;
  depositRequired: number; totalPaid: number;
  acceptedAt: string|null; acceptedByName: string|null; quotedAt: string|null; completedAt: string|null;
  patient: { id: string; name: string; patientRef: string; phone: string|null };
  clinic:  { id: string; name: string };
  dentist: { id: string; name: string };
  stages:  Stage[]; payments: Payment[];
};
type Visit = { id: string; visitRef: string; visitDate: string };

const STATUS_COLORS: Record<string,string> = {
  DRAFT:"badge-slate", QUOTED:"badge-amber", ACCEPTED:"badge-blue",
  IN_PROGRESS:"badge-cyan", COMPLETED:"badge-green", CANCELLED:"badge-red",
};
const STAGE_COLORS: Record<string,string> = {
  PENDING:"text-slate-400", IN_PROGRESS:"text-blue-500",
  COMPLETED:"text-green-600", SKIPPED:"text-slate-300",
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY",{ style:"currency",currency:"MYR" }).format(n);
}
function fmtDate(d: string|null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY",{ dateStyle:"medium" });
}

export function PlanDetailClient({ plan: initial, visits, role }: {
  plan: Plan; visits: Visit[]; role: string;
}) {
  const router = useRouter();
  const [plan, setPlan]   = useState<Plan>(initial);
  const [error, setError] = useState("");

  // Accept modal
  const [showAccept, setShowAccept] = useState(false);
  const [acceptName, setAcceptName] = useState(plan.patient.name);
  const [accepting,  setAccepting]  = useState(false);

  // Complete stage modal
  const [activeStage,   setActiveStage]   = useState<Stage|null>(null);
  const [stageVisitId,  setStageVisitId]  = useState(visits[0]?.id ?? "");
  const [stageNotes,    setStageNotes]    = useState("");
  const [stageNextDate, setStageNextDate] = useState("");
  const [completingStage, setCompletingStage] = useState(false);

  // Payment modal
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount,   setPayAmount]   = useState("");
  const [payType,     setPayType]     = useState("DEPOSIT");
  const [payNotes,    setPayNotes]    = useState("");
  const [paying,      setPaying]      = useState(false);

  async function reload() {
    const res = await fetch(`/api/treatment-plans/${plan.id}`);
    if (res.ok) setPlan(await res.json());
  }

  async function handleSendQuotation() {
    await fetch(`/api/treatment-plans/${plan.id}/quote`, { method: "PATCH" });
    await reload();
  }

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setAccepting(true);
    await fetch(`/api/treatment-plans/${plan.id}/accept`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedByName: acceptName }),
    });
    setAccepting(false); setShowAccept(false);
    await reload();
  }

  async function handleCompleteStage(e: React.FormEvent) {
    e.preventDefault();
    if (!activeStage || !stageVisitId) return;
    setCompletingStage(true);
    const res = await fetch(`/api/treatment-plans/${plan.id}/stages/${activeStage.id}/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitId: stageVisitId,
        clinicalNotes: stageNotes || undefined,
        nextStageDate: stageNextDate || undefined,
      }),
    });
    setCompletingStage(false);
    if (res.ok) { setActiveStage(null); setStageNotes(""); setStageNextDate(""); await reload(); }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setPaying(true);
    await fetch(`/api/treatment-plans/${plan.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseFloat(payAmount), paymentType: payType, notes: payNotes || undefined }),
    });
    setPaying(false); setShowPayment(false); setPayAmount(""); setPayNotes("");
    await reload();
  }

  async function handleCancel() {
    if (!confirm("Cancel this treatment plan?")) return;
    await fetch(`/api/treatment-plans/${plan.id}/cancel`, { method: "PATCH" });
    await reload();
  }

  const outstanding   = Math.max(0, Number(plan.totalAmount) - Number(plan.totalPaid));
  const depositPaid   = plan.payments.filter(p => p.paymentType === "DEPOSIT").reduce((s,p) => s + Number(p.amount), 0);
  const completedStages = plan.stages.filter(s => s.status === "COMPLETED").length;
  const canActOnStages  = ["ACCEPTED","IN_PROGRESS"].includes(plan.status);
  const canManage       = ["SUPER_ADMIN","CLINIC_MANAGER","DOCTOR"].includes(role);
  const nextPending     = plan.stages.find(s => s.status === "PENDING" || s.status === "IN_PROGRESS");

  return (
    <div className="max-w-3xl space-y-5">
      {/* Back + Header */}
      <div>
        <Link href="/treatment-plans" className="text-sm text-slate-500 hover:text-slate-700">← Treatment Plans</Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">{plan.title}</h1>
              <span className={STATUS_COLORS[plan.status] ?? "badge-slate"}>{plan.status.replace("_"," ")}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {plan.planRef} · {plan.patient.name} · {plan.clinic.name}
              {plan.toothCodes.length > 0 && <span className="ml-2 text-slate-400">Tooth {plan.toothCodes.join(", ")}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {plan.status === "DRAFT" && canManage && (
              <button onClick={handleSendQuotation} className="btn-primary">Send Quotation</button>
            )}
            {plan.status === "QUOTED" && canManage && (
              <button onClick={() => setShowAccept(true)} className="btn-primary">Record Acceptance</button>
            )}
            {!["COMPLETED","CANCELLED"].includes(plan.status) && canManage && (
              <button onClick={handleCancel} className="btn-outline text-red-600 hover:bg-red-50">Cancel Plan</button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      {/* Financial summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Amount",   value: fmt(Number(plan.totalAmount)),  color: "text-slate-800" },
          { label: "Paid",           value: fmt(Number(plan.totalPaid)),     color: "text-green-700" },
          { label: "Outstanding",    value: fmt(outstanding),                color: outstanding > 0 ? "text-amber-700" : "text-slate-400" },
          { label: "Deposit Status", value: depositPaid >= Number(plan.depositRequired) ? "Met ✓" : `${fmt(depositPaid)} / ${fmt(Number(plan.depositRequired))}`, color: depositPaid >= Number(plan.depositRequired) ? "text-green-700" : "text-amber-700" },
        ].map(c => (
          <div key={c.label} className="stat-card p-4">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`text-lg font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Quotation */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Quotation</h2>
          {plan.quotedAt && <span className="text-xs text-slate-400">Sent {fmtDate(plan.quotedAt)}</span>}
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["#","Stage","Description","Cost"].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.stages.map(s => (
              <tr key={s.id} className="table-row">
                <td className="px-5 py-2.5 text-slate-400 text-xs">{s.order}</td>
                <td className="px-5 py-2.5 font-medium text-slate-800">{s.name}</td>
                <td className="px-5 py-2.5 text-slate-500 text-xs">{s.description ?? "—"}</td>
                <td className="px-5 py-2.5 font-mono text-slate-700">{fmt(Number(s.cost))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">{fmt(Number(plan.subtotal))}</span></div>
          {Number(plan.discount) > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span className="font-mono">({fmt(Number(plan.discount))})</span></div>}
          <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-200"><span>Total</span><span className="font-mono">{fmt(Number(plan.totalAmount))}</span></div>
        </div>
        {plan.acceptedAt && (
          <div className="px-5 py-3 border-t border-green-200 bg-green-50 text-xs text-green-700">
            ✓ Accepted by <strong>{plan.acceptedByName}</strong> on {fmtDate(plan.acceptedAt)}
          </div>
        )}
      </div>

      {/* Progress timeline */}
      {["ACCEPTED","IN_PROGRESS","COMPLETED"].includes(plan.status) && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Progress</h2>
            <span className="text-xs text-slate-400">{completedStages} / {plan.stages.length} stages complete</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            {plan.stages.map((s, i) => {
              const isNext = s.id === nextPending?.id;
              return (
                <div key={s.id} className="flex gap-4">
                  {/* Step indicator */}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                      s.status === "COMPLETED" ? "bg-green-100 border-green-400 text-green-700" :
                      s.status === "IN_PROGRESS" ? "bg-blue-100 border-blue-400 text-blue-700" :
                      "bg-white border-slate-200 text-slate-400"
                    }`}>
                      {s.status === "COMPLETED" ? "✓" : s.order}
                    </div>
                    {i < plan.stages.length - 1 && (
                      <div className={`w-0.5 h-8 mt-1 ${s.status === "COMPLETED" ? "bg-green-300" : "bg-slate-200"}`} />
                    )}
                  </div>
                  {/* Stage content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-medium text-sm ${s.status === "COMPLETED" ? "text-slate-700" : s.status === "SKIPPED" ? "line-through text-slate-400" : "text-slate-800"}`}>
                          {s.name}
                        </p>
                        {s.description && <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-slate-600">{fmt(Number(s.cost))}</span>
                        {isNext && canActOnStages && canManage && (
                          <button onClick={() => { setActiveStage(s); setStageVisitId(visits[0]?.id ?? ""); }} className="btn-primary text-xs py-1 px-3">
                            Mark Complete
                          </button>
                        )}
                      </div>
                    </div>
                    {s.status === "COMPLETED" && (
                      <div className="mt-2 bg-green-50 rounded-lg p-3 text-xs space-y-1">
                        <div className="flex gap-4">
                          <span className="text-green-700">✓ Completed {fmtDate(s.completedAt)}</span>
                          {s.performedBy && <span className="text-slate-500">by {s.performedBy.name}</span>}
                          {s.visit && <Link href={`/visits/${s.visit.id}`} className="text-blue-600 hover:underline">{s.visit.visitRef}</Link>}
                        </div>
                        {s.clinicalNotes && <p className="text-slate-600 mt-1">{s.clinicalNotes}</p>}
                        {s.nextStageDate && <p className="text-blue-600">Next: {fmtDate(s.nextStageDate)}</p>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payments */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Payments</h2>
          {!["CANCELLED"].includes(plan.status) && (
            <button onClick={() => setShowPayment(true)} className="btn-outline text-xs py-1 px-3">Record Payment</button>
          )}
        </div>
        {plan.payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No payments recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Date","Type","Amount","Invoice","By","Notes"].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.payments.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="px-5 py-2.5 text-slate-600">{fmtDate(p.paidAt)}</td>
                  <td className="px-5 py-2.5"><span className="badge-slate">{p.paymentType}</span></td>
                  <td className="px-5 py-2.5 font-mono text-green-700">{fmt(Number(p.amount))}</td>
                  <td className="px-5 py-2.5">{p.invoice ? <Link href={`/invoices/${p.invoice.id}`} className="text-blue-600 hover:underline text-xs">{p.invoice.invoiceRef}</Link> : "—"}</td>
                  <td className="px-5 py-2.5 text-xs text-slate-500">{p.recordedBy?.name ?? "—"}</td>
                  <td className="px-5 py-2.5 text-xs text-slate-400">{p.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {outstanding > 0 && (
          <div className="px-5 py-3 border-t border-amber-200 bg-amber-50 flex justify-between text-sm">
            <span className="font-medium text-amber-800">Outstanding Balance</span>
            <span className="font-mono font-bold text-amber-800">{fmt(outstanding)}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {plan.notes && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Notes</h2>
          <p className="text-sm text-slate-600">{plan.notes}</p>
        </div>
      )}

      {/* Accept modal */}
      {showAccept && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Record Patient Acceptance</h2>
            <p className="text-sm text-slate-500 mb-4">Patient is accepting the treatment plan and quotation.</p>
            <form onSubmit={handleAccept} className="space-y-3">
              <div>
                <label className="form-label">Patient Name (as confirmed) <span className="text-red-500">*</span></label>
                <input className="form-input" value={acceptName} onChange={e => setAcceptName(e.target.value)} required />
              </div>
              <p className="text-xs text-slate-400">Timestamp will be recorded automatically.</p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAccept(false)} className="btn-outline">Cancel</button>
                <button type="submit" disabled={accepting} className="btn-primary">{accepting ? "Recording…" : "Confirm Acceptance"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete stage modal */}
      {activeStage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Complete Stage: {activeStage.name}</h2>
            <form onSubmit={handleCompleteStage} className="space-y-3">
              <div>
                <label className="form-label">Link to Visit <span className="text-red-500">*</span></label>
                <select className="form-input" value={stageVisitId} onChange={e => setStageVisitId(e.target.value)} required>
                  <option value="">Select visit…</option>
                  {visits.map(v => (
                    <option key={v.id} value={v.id}>{v.visitRef} — {new Date(v.visitDate).toLocaleDateString("en-MY")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Clinical Notes</label>
                <textarea className="form-input" rows={3} value={stageNotes} onChange={e => setStageNotes(e.target.value)} placeholder="Optional notes for this stage…" />
              </div>
              <div>
                <label className="form-label">Next Appointment Date</label>
                <input type="date" className="form-input" value={stageNextDate} onChange={e => setStageNextDate(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setActiveStage(null)} className="btn-outline">Cancel</button>
                <button type="submit" disabled={completingStage} className="btn-primary">{completingStage ? "Saving…" : "Mark Complete"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Record Payment</h2>
            <form onSubmit={handlePayment} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Amount (MYR) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" min="0.01" className="form-input" value={payAmount} onChange={e => setPayAmount(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">Payment Type</label>
                  <select className="form-input" value={payType} onChange={e => setPayType(e.target.value)}>
                    <option value="DEPOSIT">Deposit</option>
                    <option value="STAGE">Stage Payment</option>
                    <option value="BALANCE">Final Balance</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input className="form-input" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowPayment(false)} className="btn-outline">Cancel</button>
                <button type="submit" disabled={paying} className="btn-primary">{paying ? "Saving…" : "Record Payment"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
