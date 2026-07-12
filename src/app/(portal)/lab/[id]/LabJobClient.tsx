"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}

const STATUS_STEPS = ["ORDERED","SENT_TO_LAB","RECEIVED","FITTED"] as const;
const STATUS_LABEL: Record<string, string> = {
  ORDERED: "Ordered", SENT_TO_LAB: "Sent to Lab", RECEIVED: "Received", FITTED: "Fitted",
};

type Job = any;
type Vendor = { id: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null };

export function LabJobClient({ job: initial, vendors }: { job: Job; vendors: Vendor[] }) {
  const router         = useRouter();
  const [job, setJob]  = useState<Job>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [vendorPick, setVendorPick] = useState("");

  // Status update form
  const [statusForm, setStatusForm] = useState({
    status:      job.status,
    sentDate:    job.sentDate?.slice(0, 10) ?? "",
    expectedDate: job.expectedDate?.slice(0, 10) ?? "",
    receivedDate: job.receivedDate?.slice(0, 10) ?? "",
    fittedDate:  job.fittedDate?.slice(0, 10) ?? "",
    notes:       job.notes ?? "",
  });

  // Invoice form
  const [invForm, setInvForm] = useState({
    invoiceDate:   job.invoiceDate?.slice(0, 10) ?? "",
    invoiceNumber: job.invoiceNumber ?? "",
    invoiceAmount: job.invoiceAmount?.toString() ?? "",
    paidToVendor:  job.paidToVendor ?? false,
    paidDate:      job.paidDate?.slice(0, 10) ?? "",
  });

  async function save(data: any) {
    setSaving(true); setError("");
    const res = await fetch(`/api/lab/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const updated = await res.json();
    setSaving(false);
    if (!res.ok) { setError(updated.error ?? "Failed"); return; }
    setJob(updated);
    router.refresh();
  }

  const currentStep = STATUS_STEPS.indexOf(job.status);
  const patient      = job.visit?.patient;
  const visits       = job.visit;
  const labTreatments = job.treatments ?? [];

  // Commission preview
  const commRows = labTreatments.flatMap((t: any) =>
    t.commissions.map((c: any) => ({
      treatment: t.treatmentType.name,
      txAmount:  Number(c.txAmount),
      labFee:    Number(c.labFee),
      base:      Number(c.txAmount) - Number(c.labFee),
      split:     Number(c.doctorSplit),
      rate:      Number(c.doctorRate),
      payout:    Number(c.finalPayout),
      status:    c.status,
    }))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/lab" className="text-sm text-slate-500 hover:text-slate-700">← Lab Work</Link>
          <h1 className="page-title mt-2">{job.labJobRef}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {patient?.name} · {job.vendor?.name ?? "Vendor TBD"} · {job.clinic.name}
          </p>
        </div>
        <span className={`badge ${
          job.status === "FITTED" ? "badge-green" :
          job.status === "RECEIVED" ? "badge-amber" :
          job.status === "SENT_TO_LAB" ? "badge-blue" : "badge-slate"
        } text-sm px-3 py-1`}>
          {STATUS_LABEL[job.status]}
        </span>
      </div>

      {/* Progress bar */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 right-0 top-4 h-0.5 bg-slate-200" />
          <div
            className="absolute left-0 top-4 h-0.5 bg-blue-500 transition-all"
            style={{ width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%` }}
          />
          {STATUS_STEPS.map((s, i) => (
            <div key={s} className="relative flex flex-col items-center z-10">
              <button
                onClick={() => save({ status: s })}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                  i < currentStep  ? "bg-blue-500 border-blue-500 text-white" :
                  i === currentStep ? "bg-blue-600 border-blue-600 text-white" :
                  "bg-white border-slate-300 text-slate-400 hover:border-blue-400"
                }`}
                title={`Set to ${STATUS_LABEL[s]}`}
              >
                {i < currentStep ? "✓" : i + 1}
              </button>
              <span className={`text-xs mt-1.5 font-medium ${i <= currentStep ? "text-blue-700" : "text-slate-400"}`}>
                {STATUS_LABEL[s]}
              </span>
              {i === 0 && job.sentDate && <span className="text-xs text-slate-400">{new Date(job.sentDate).toLocaleDateString("en-MY",{dateStyle:"short"})}</span>}
              {i === 1 && job.expectedDate && <span className="text-xs text-slate-400">Exp: {new Date(job.expectedDate).toLocaleDateString("en-MY",{dateStyle:"short"})}</span>}
              {i === 2 && job.receivedDate && <span className="text-xs text-slate-400">{new Date(job.receivedDate).toLocaleDateString("en-MY",{dateStyle:"short"})}</span>}
              {i === 3 && job.fittedDate && <span className="text-xs text-slate-400">{new Date(job.fittedDate).toLocaleDateString("en-MY",{dateStyle:"short"})}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Patient + Visit info */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Patient & Visit</h2>
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Patient</dt>
              <dd>
                <Link href={`/patients/${patient?.id}`} className="text-blue-600 hover:underline font-medium">
                  {patient?.name}
                </Link>
                <span className="text-xs text-slate-400 ml-1">({patient?.patientRef})</span>
              </dd>
            </div>
            {patient?.phone && <div><dt className="text-xs text-slate-500">Phone</dt><dd className="text-slate-900">{patient.phone}</dd></div>}
            <div>
              <dt className="text-xs text-slate-500">Work Description</dt>
              <dd className="text-slate-900">{job.workDescription ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Treatments</dt>
              <dd className="text-slate-900">{labTreatments.map((t: any) => t.treatmentType.name).join(", ")}</dd>
            </div>
          </dl>

          {/* Visit invoices (payment status) */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Payments Received</p>
            {visits?.invoices?.length === 0 ? (
              <p className="text-xs text-slate-400">No invoices yet</p>
            ) : (
              <div className="space-y-1.5">
                {visits?.invoices?.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between text-xs">
                    <Link href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">{inv.invoiceRef}</Link>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fmt(inv.total)}</span>
                      <span className={inv.collectedAt ? "badge-green" : "badge-amber"}>
                        {inv.collectedAt ? "Paid" : "Pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lab Vendor info — assignable after case assessment */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Lab Vendor</h2>
          {!job.vendor && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-amber-600">No vendor assigned yet — choose one after assessing the case:</p>
              <div className="flex gap-2">
                <select className="form-input text-sm flex-1" value={vendorPick} onChange={e => setVendorPick(e.target.value)}>
                  <option value="">Select vendor…</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <button
                  onClick={() => vendorPick && save({ vendorId: vendorPick })}
                  disabled={saving || !vendorPick}
                  className="btn-primary text-xs disabled:opacity-40"
                >
                  Assign
                </button>
              </div>
            </div>
          )}
          <dl className="space-y-2.5 text-sm">
            {[
              { label: "Name",    value: job.vendor?.name ?? "— To be decided —" },
              { label: "Contact", value: job.vendor?.contactName ?? "—" },
              { label: "Phone",   value: job.vendor?.phone ?? "—" },
              { label: "Email",   value: job.vendor?.email ?? "—" },
            ].map(r => (
              <div key={r.label}>
                <dt className="text-xs text-slate-500">{r.label}</dt>
                <dd className="text-slate-900">{r.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-slate-500">Estimated Fee</dt>
              <dd className="text-lg font-semibold text-slate-900">{fmt(job.estimatedFee)}</dd>
            </div>
          </dl>
        </div>

        {/* Dates */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Update Dates</h2>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="space-y-3">
            {[
              { label: "Sent to Lab",   key: "sentDate" },
              { label: "Expected Back", key: "expectedDate" },
              { label: "Received",      key: "receivedDate" },
              { label: "Fitted",        key: "fittedDate" },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="form-label text-xs">{label}</label>
                <input type="date" value={(statusForm as any)[key]}
                  onChange={e => setStatusForm(f => ({ ...f, [key]: e.target.value }))}
                  className="form-input text-sm" />
              </div>
            ))}
            <div>
              <label className="form-label text-xs">Notes</label>
              <input type="text" value={statusForm.notes}
                onChange={e => setStatusForm(f => ({ ...f, notes: e.target.value }))}
                className="form-input text-sm" placeholder="Any notes…" />
            </div>
            <button onClick={() => save(statusForm)} disabled={saving} className="btn-outline text-sm w-full justify-center">
              {saving ? "Saving…" : "Save Dates"}
            </button>
          </div>
        </div>
      </div>

      {/* Lab Invoice Section */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Lab Invoice</h2>
        <p className="text-xs text-slate-500 mb-4">
          Record the actual invoice from the lab vendor. This will update the lab fee on the treatment
          and automatically recalculate the doctor's commission.
        </p>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <label className="form-label text-xs">Invoice Date</label>
            <input type="date" value={invForm.invoiceDate}
              onChange={e => setInvForm(f => ({ ...f, invoiceDate: e.target.value }))}
              className="form-input text-sm" />
          </div>
          <div>
            <label className="form-label text-xs">Invoice Number</label>
            <input type="text" value={invForm.invoiceNumber}
              onChange={e => setInvForm(f => ({ ...f, invoiceNumber: e.target.value }))}
              placeholder="e.g. LB-2026-0441" className="form-input text-sm" />
          </div>
          <div>
            <label className="form-label text-xs">Invoice Amount (RM) *</label>
            <input type="number" step="0.01" value={invForm.invoiceAmount}
              onChange={e => setInvForm(f => ({ ...f, invoiceAmount: e.target.value }))}
              placeholder="0.00" className="form-input text-sm" />
          </div>
          <div className="flex flex-col justify-end gap-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={invForm.paidToVendor}
                onChange={e => setInvForm(f => ({ ...f, paidToVendor: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600" />
              <span className="text-slate-700">Paid to vendor</span>
            </label>
            {invForm.paidToVendor && (
              <input type="date" value={invForm.paidDate}
                onChange={e => setInvForm(f => ({ ...f, paidDate: e.target.value }))}
                className="form-input text-sm" placeholder="Payment date" />
            )}
          </div>
        </div>

        {/* Variance indicator */}
        {invForm.invoiceAmount && (
          <div className={`p-3 rounded-md mb-4 text-sm ${
            Number(invForm.invoiceAmount) > Number(job.estimatedFee)
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-green-50 border border-green-200 text-green-700"
          }`}>
            Variance: {fmt(Number(invForm.invoiceAmount) - Number(job.estimatedFee))}
            {" "}({Number(invForm.invoiceAmount) > Number(job.estimatedFee) ? "over" : "under"} estimate)
          </div>
        )}

        <button onClick={() => save(invForm)} disabled={saving || !invForm.invoiceAmount} className="btn-primary">
          {saving ? "Saving…" : "Record Invoice & Update Commission"}
        </button>
      </div>

      {/* Commission Impact */}
      {commRows.length > 0 && (
        <div className="card p-5">
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">Commission Impact</h2>
            <div className="text-xs text-slate-500 text-right">
              <span className="font-medium text-slate-700">{job.vendor?.name ?? "Vendor TBD"}</span>
              {job.invoiceNumber && (
                <span className="ml-2 font-mono text-slate-600">#{job.invoiceNumber}</span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Formula: (Treatment Amount − Lab Fee) × Split% × Rate%
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="text-left pb-2">Treatment</th>
                <th className="text-right pb-2">Tx Amount</th>
                <th className="text-right pb-2">Lab Fee</th>
                <th className="text-right pb-2">Base</th>
                <th className="text-right pb-2">Split</th>
                <th className="text-right pb-2">Rate</th>
                <th className="text-right pb-2">Commission</th>
                <th className="text-right pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {commRows.map((c: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 text-slate-900">{c.treatment}</td>
                  <td className="py-2.5 text-right">{fmt(c.txAmount)}</td>
                  <td className="py-2.5 text-right text-slate-500">{fmt(c.labFee)}</td>
                  <td className="py-2.5 text-right">{fmt(c.base)}</td>
                  <td className="py-2.5 text-right">{c.split}%</td>
                  <td className="py-2.5 text-right">{c.rate}%</td>
                  <td className="py-2.5 text-right font-semibold text-blue-700">{fmt(c.payout)}</td>
                  <td className="py-2.5 text-right">
                    <span className={
                      c.status === "LOCKED" ? "badge-green" :
                      c.status === "PENDING_LOCK" ? "badge-amber" : "badge-slate"
                    }>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
