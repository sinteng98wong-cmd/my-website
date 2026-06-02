"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

const STATUS_CLASS: Record<string, string> = {
  PENDING:  "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PAID:     "bg-green-100 text-green-700",
  VOIDED:   "bg-slate-100 text-slate-500 line-through",
};

const TYPE_LABEL: Record<string, string> = {
  PATIENT: "Patient", INTERNAL_DOCTOR: "Doctor", INTERNAL_CLINIC: "Clinic", EXTERNAL: "External",
};

function referrerName(c: any) {
  if (c.doctor) return c.doctor.name;
  if (c.clinic) return c.clinic.name;
  if (c.externalName) return c.externalName;
  return "—";
}

export function ReferralCommissionsClient({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth]     = useState("");
  const [status, setStatus]   = useState("");
  const [type, setType]       = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [configs, setConfigs] = useState<any[]>([]);
  const [payModal, setPayModal] = useState<any | null>(null);
  const [voidModal, setVoidModal] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    const q = new URLSearchParams();
    if (month) q.set("month", month);
    if (status) q.set("status", status);
    if (type) q.set("referralType", type);
    const r = await fetch(`/api/referral-commissions?${q}`).then((x) => x.json());
    setRows(Array.isArray(r) ? r : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [month, status, type]);

  useEffect(() => {
    if (isSuperAdmin) fetch("/api/admin/referral-commission-config").then((r) => r.json()).then(setConfigs).catch(() => {});
  }, [isSuperAdmin]);

  const totals = rows.reduce((a, c) => {
    a[c.status] = (a[c.status] ?? { count: 0, amount: 0 });
    a[c.status].count++; a[c.status].amount += Number(c.calculatedAmount);
    return a;
  }, {} as Record<string, { count: number; amount: number }>);

  async function approve(id: string) {
    await fetch(`/api/referral-commissions/${id}/approve`, { method: "PATCH" });
    load();
  }
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    await fetch(`/api/referral-commissions/${payModal.id}/pay`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentRef: fd.get("paymentRef"), paidAt: fd.get("paidAt") }),
    });
    setPayModal(null); load();
  }
  async function voidC(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    await fetch(`/api/referral-commissions/${voidModal.id}/void`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: fd.get("notes") }),
    });
    setVoidModal(null); load();
  }
  async function saveConfig(id: string, body: any) {
    const r = await fetch(`/api/admin/referral-commission-config/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then((x) => x.json());
    setConfigs((p) => p.map((c) => c.id === id ? r : c));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Referral Commissions</h1>
        <div className="flex gap-2">
          <input type="month" className="form-input text-sm py-1.5" value={month} onChange={(e) => setMonth(e.target.value)} />
          <select className="form-input text-sm py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["PENDING", "APPROVED", "PAID", "VOIDED"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="form-input text-sm py-1.5" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { k: "PENDING", label: "Pending", cls: "border-amber-200 bg-amber-50" },
          { k: "APPROVED", label: "Approved", cls: "border-blue-200 bg-blue-50" },
          { k: "PAID", label: "Paid", cls: "border-green-200 bg-green-50" },
          { k: "VOIDED", label: "Voided", cls: "border-slate-200 bg-slate-50" },
        ].map((c) => (
          <div key={c.k} className={`rounded-lg border px-4 py-3 ${c.cls}`}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="text-lg font-bold text-slate-800">{RM(totals[c.k]?.amount ?? 0)}</p>
            <p className="text-xs text-slate-400">{totals[c.k]?.count ?? 0} commissions</p>
          </div>
        ))}
      </div>

      {/* Config (super admin) */}
      {isSuperAdmin && (
        <div className="card overflow-hidden">
          <button onClick={() => setConfigOpen((v) => !v)} className="w-full px-5 py-3 flex justify-between items-center text-sm font-semibold text-slate-700">
            Commission Rates <span>{configOpen ? "▲" : "▼"}</span>
          </button>
          {configOpen && (
            <table className="w-full text-sm border-t border-slate-100">
              <thead className="table-header"><tr>
                {["Referral Type", "Commission Type", "Rate", "Active"].map((h) => <th key={h} className="px-4 py-2 text-left text-xs text-slate-500 uppercase">{h}</th>)}
              </tr></thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50">
                    <td className="px-4 py-2">{TYPE_LABEL[c.referralType]}</td>
                    <td className="px-4 py-2">
                      <select className="form-input text-xs py-1" value={c.commissionType} onChange={(e) => saveConfig(c.id, { commissionType: e.target.value })}>
                        <option value="FLAT">Flat (RM)</option>
                        <option value="PERCENTAGE">Percentage (%)</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" step="0.01" className="form-input text-xs py-1 w-24" defaultValue={Number(c.rate)}
                        onBlur={(e) => saveConfig(c.id, { rate: parseFloat(e.target.value) })} />
                    </td>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={c.isActive} onChange={(e) => saveConfig(c.id, { isActive: e.target.checked })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Commission table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>
            {["Patient", "Type", "Referrer", "Comm. Type", "Rate", "Amount", "Invoice", "Status", "Actions"].map((h) => (
              <th key={h} className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No commissions found.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="table-row">
                <td className="px-3 py-2.5">{c.patient?.name}<span className="block text-xs text-slate-400">{c.patient?.patientRef}</span></td>
                <td className="px-3 py-2.5">{TYPE_LABEL[c.referralType]}</td>
                <td className="px-3 py-2.5">{referrerName(c)}</td>
                <td className="px-3 py-2.5 text-slate-500">{c.commissionType === "FLAT" ? "Flat" : "%"}</td>
                <td className="px-3 py-2.5">{c.commissionType === "FLAT" ? RM(Number(c.rate)) : `${Number(c.rate)}%`}</td>
                <td className="px-3 py-2.5 font-medium">{RM(Number(c.calculatedAmount))}</td>
                <td className="px-3 py-2.5 text-xs text-slate-400">{c.basedOnInvoice?.invoiceRef ?? "—"}</td>
                <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[c.status]}`}>{c.status}</span></td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-2 text-xs">
                    {c.status === "PENDING" && <button onClick={() => approve(c.id)} className="text-blue-600 hover:underline">Approve</button>}
                    {c.status === "APPROVED" && <button onClick={() => setPayModal(c)} className="text-green-600 hover:underline">Mark Paid</button>}
                    {c.status !== "VOIDED" && <button onClick={() => setVoidModal(c)} className="text-red-500 hover:underline">Void</button>}
                    <Link href={`/reports/referral-commissions/${c.id}`} className="text-slate-500 hover:underline">View</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pay modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setPayModal(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={pay} className="bg-white rounded-lg p-6 w-96 space-y-4">
            <h3 className="font-semibold">Mark Paid — {RM(Number(payModal.calculatedAmount))}</h3>
            <div><label className="form-label">Payment Reference</label><input name="paymentRef" className="form-input" placeholder="Cheque / TT ref" /></div>
            <div><label className="form-label">Payment Date</label><input name="paidAt" type="date" className="form-input" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="flex gap-2"><button className="btn-primary">Confirm Payment</button><button type="button" onClick={() => setPayModal(null)} className="btn-outline">Cancel</button></div>
          </form>
        </div>
      )}

      {/* Void modal */}
      {voidModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setVoidModal(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={voidC} className="bg-white rounded-lg p-6 w-96 space-y-4">
            <h3 className="font-semibold">Void Commission</h3>
            <div><label className="form-label">Reason *</label><textarea name="notes" required rows={3} className="form-input" /></div>
            <div className="flex gap-2"><button className="btn-primary bg-red-600">Void</button><button type="button" onClick={() => setVoidModal(null)} className="btn-outline">Cancel</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
