"use client";

import { useEffect, useState } from "react";

const RM = (n: number | string) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

const TYPE_BADGE: Record<string, string> = {
  TOPUP:       "bg-green-100 text-green-700",
  UTILIZATION: "bg-blue-100  text-blue-700",
  REFUND:      "bg-amber-100 text-amber-700",
};

const METHOD_LABELS: Record<string, string> = {
  CASH_CURRENT: "Cash (Current month)",
  CASH_NEXT:    "Cash (Next month)",
  CREDIT_CARD:  "Credit / Debit Card",
  FPX:          "FPX / Online Transfer",
  EWALLET:      "eWallet",
  ATOME:        "Atome",
};

const REFUND_CATEGORIES: { value: string; label: string; desc: string }[] = [
  { value: "TREATMENT_FAILURE", label: "Treatment Failure",  desc: "Defective or failed treatment — creates a Sales Return entry in the accounts" },
  { value: "PATIENT_REQUEST",   label: "Patient Request",    desc: "Patient voluntary withdrawal of deposit" },
  { value: "OVERPAYMENT",       label: "Overpayment",        desc: "Patient paid more than required" },
  { value: "OTHER",             label: "Other",              desc: "Describe in reason field" },
];

const TOPUP_METHODS = Object.keys(METHOD_LABELS);

type SalesReturn = { returnRef: string; originalInvoice: { invoiceRef: string; createdAt: string } | null };
type Transaction = {
  id: string; depositRef: string; type: string;
  amount: number; paymentMethod?: string | null;
  refundCategory?: string | null; reason?: string | null;
  notes?: string | null; invoiceId?: string | null;
  createdAt: string;
  clinic?:     { name: string };
  createdBy?:  { name: string };
  invoice?:    { invoiceRef: string } | null;
  salesReturn?: SalesReturn | null;
};
type Invoice = { id: string; invoiceRef: string; total: number; collectedAt: string | null; createdAt: string };

interface Props {
  patientId: string;
  clinicId:  string;
  clinics:   { id: string; name: string }[];
  canRefund: boolean;
}

export function PatientDepositTab({ patientId, clinicId, clinics, canRefund }: Props) {
  const [balance,      setBalance]      = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [allInvoices,  setAllInvoices]  = useState<Invoice[]>([]); // for original invoice lookup (treatment failure)
  const [modal,        setModal]        = useState<"topup" | "utilize" | "refund" | null>(null);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState("");

  const [form, setForm] = useState({
    amount:            "",
    clinicId:          clinicId,
    paymentMethod:     "CASH_CURRENT",
    invoiceId:         "",
    refundCategory:    "PATIENT_REQUEST",
    originalInvoiceId: "",
    reason:            "",
    visitId:           "",
    notes:             "",
  });

  async function load() {
    const d = await fetch(`/api/patients/${patientId}/deposits`).then(r => r.json()).catch(() => null);
    if (d) { setBalance(d.balance ?? 0); setTransactions(d.deposits ?? []); }
  }

  async function loadInvoices() {
    const d = await fetch(`/api/invoices?patientId=${patientId}&unpaid=1`).then(r => r.json()).catch(() => []);
    setInvoices(Array.isArray(d) ? d : []);
  }

  async function loadAllInvoices() {
    const d = await fetch(`/api/invoices?patientId=${patientId}`).then(r => r.json()).catch(() => []);
    setAllInvoices(Array.isArray(d) ? d : []);
  }

  useEffect(() => { load(); }, [patientId]);

  function openModal(type: "topup" | "utilize" | "refund") {
    setError(""); setSuccess("");
    setForm(f => ({ ...f, amount: "", clinicId, invoiceId: "", originalInvoiceId: "",
      refundCategory: "PATIENT_REQUEST", reason: "", visitId: "", notes: "" }));
    if (type === "utilize") loadInvoices();
    if (type === "refund")  loadAllInvoices();
    setModal(type);
  }

  const isTreatmentFailure = form.refundCategory === "TREATMENT_FAILURE";

  async function submit() {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0)                               { setError("Enter a valid amount"); return; }
    if (modal === "utilize" && !form.invoiceId)               { setError("Select an invoice"); return; }
    if (modal === "refund"  && !form.reason.trim())           { setError("Reason is required"); return; }
    if (modal === "refund"  && isTreatmentFailure && !form.originalInvoiceId) {
      setError("Select the original invoice for this treatment failure"); return;
    }

    setBusy(true); setError("");
    const res = await fetch(`/api/patients/${patientId}/deposits`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:              modal === "topup"   ? "TOPUP"
                         : modal === "utilize" ? "UTILIZATION"
                         :                      "REFUND",
        amount,
        clinicId:          form.clinicId,
        paymentMethod:     modal === "topup"  ? form.paymentMethod     : undefined,
        refundCategory:    modal === "refund" ? form.refundCategory     : undefined,
        reason:            modal === "refund" ? form.reason             : undefined,
        originalInvoiceId: modal === "refund" && isTreatmentFailure ? form.originalInvoiceId : undefined,
        invoiceId:         form.invoiceId          || undefined,
        visitId:           form.visitId            || undefined,
        notes:             form.notes              || undefined,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }

    setBalance(d.balance);
    if (d.salesReturnId) setSuccess(`Sales Return created: ${d.salesReturnId}`);
    await load();
    setModal(null);
  }

  const selectedInvoice = invoices.find(i => i.id === form.invoiceId);
  const maxUtilize      = selectedInvoice ? Math.min(balance, Number(selectedInvoice.total)) : balance;

  const catInfo = REFUND_CATEGORIES.find(c => c.value === form.refundCategory);

  return (
    <div className="space-y-5">

      {/* Balance + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Deposit Balance</p>
          <p className={`text-3xl font-bold ${balance > 0 ? "text-green-700" : "text-slate-400"}`}>{RM(balance)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => openModal("topup")}   className="btn-primary text-sm">+ Top Up</button>
          <button onClick={() => openModal("utilize")} disabled={balance <= 0} className="btn-secondary text-sm">Use for Invoice</button>
          {canRefund && (
            <button onClick={() => openModal("refund")} disabled={balance <= 0}
              className="btn-secondary text-sm text-amber-700 border-amber-200 hover:bg-amber-50">
              Refund
            </button>
          )}
        </div>
      </div>

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{success}</div>
      )}

      {/* Modal */}
      {modal && (
        <div className="card p-5 space-y-4 border-2 border-blue-200 bg-blue-50/20">
          <h3 className="font-semibold text-slate-800">
            {modal === "topup"   ? "Top Up Deposit"
           : modal === "utilize" ? "Apply Deposit to Invoice"
           :                      "Process Refund"}
          </h3>

          {/* Clinic */}
          <div>
            <label className="form-label">Clinic</label>
            <select className="form-input" value={form.clinicId}
              onChange={e => setForm(f => ({ ...f, clinicId: e.target.value }))}>
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* ── TOPUP: payment method ── */}
          {modal === "topup" && (
            <div>
              <label className="form-label">Payment Method <span className="text-red-500">*</span></label>
              <select className="form-input" value={form.paymentMethod}
                onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                {TOPUP_METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Recorded in today's payment ledger under <strong>{METHOD_LABELS[form.paymentMethod]}</strong>.
              </p>
            </div>
          )}

          {/* ── REFUND: category ── */}
          {modal === "refund" && (
            <div className="space-y-3">
              <div>
                <label className="form-label">Refund Reason Category <span className="text-red-500">*</span></label>
                <div className="space-y-2 mt-1">
                  {REFUND_CATEGORIES.map(cat => (
                    <label key={cat.value} className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${form.refundCategory === cat.value ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input type="radio" name="refundCategory" value={cat.value}
                        checked={form.refundCategory === cat.value}
                        onChange={e => setForm(f => ({ ...f, refundCategory: e.target.value }))}
                        className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{cat.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{cat.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Treatment failure: original invoice selector */}
              {isTreatmentFailure && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded space-y-3">
                  <p className="text-xs font-medium text-amber-800">
                    A <strong>Sales Return</strong> (RTN-XXXXXX) will be created and posted to the accounts in the <em>current</em> period as a revenue reversal against the original invoice.
                  </p>
                  <div>
                    <label className="form-label">Original Invoice <span className="text-red-500">*</span></label>
                    <select className="form-input" value={form.originalInvoiceId}
                      onChange={e => setForm(f => ({ ...f, originalInvoiceId: e.target.value }))}>
                      <option value="">— select invoice —</option>
                      {allInvoices.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.invoiceRef} · {RM(i.total)} · {new Date(i.createdAt).toLocaleDateString("en-MY")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">Reason / Description <span className="text-red-500">*</span></label>
                <textarea rows={3} className="form-input" value={form.reason}
                  placeholder={isTreatmentFailure
                    ? "Describe the treatment failure (e.g. 'Crown debonded after 2 weeks — patient requesting full refund')…"
                    : "Describe the reason for this refund…"}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>
          )}

          {/* ── UTILIZATION: invoice selector ── */}
          {modal === "utilize" && (
            <div>
              <label className="form-label">Invoice <span className="text-red-500">*</span></label>
              <select className="form-input" value={form.invoiceId}
                onChange={e => setForm(f => ({ ...f, invoiceId: e.target.value }))}>
                <option value="">— select unpaid invoice —</option>
                {invoices.map(i => <option key={i.id} value={i.id}>{i.invoiceRef} · {RM(i.total)}</option>)}
              </select>
              {selectedInvoice && (
                <p className="text-xs text-slate-500 mt-1">
                  Max applicable: <strong>{RM(maxUtilize)}</strong>
                  {balance < Number(selectedInvoice.total) && (
                    <span className="text-amber-600 ml-1">(partial — patient pays remaining balance separately)</span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="form-label">Amount (RM) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" min="0.01"
              max={modal !== "topup" ? maxUtilize : undefined}
              className="form-input" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            {modal !== "topup" && balance > 0 && (
              <button type="button" className="text-xs text-blue-600 mt-1"
                onClick={() => setForm(f => ({ ...f, amount: maxUtilize.toFixed(2) }))}>
                Use full amount ({RM(maxUtilize)})
              </button>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Notes (optional)</label>
            <input className="form-input" placeholder="Receipt no., remarks…"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="btn-primary text-sm">
              {busy ? "Processing…" : "Confirm"}
            </button>
            <button onClick={() => setModal(null)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">Transaction History</h3>
          <span className="text-xs text-slate-400">{transactions.length} record{transactions.length !== 1 ? "s" : ""}</span>
        </div>
        {transactions.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-sm">No deposit transactions yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Ref","Type","Amount","Method / Category","Invoice","Sales Return","By","Date","Notes"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{t.depositRef}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded ${TYPE_BADGE[t.type] ?? ""}`}>{t.type}</span>
                  </td>
                  <td className={`px-3 py-2.5 font-semibold tabular-nums ${t.type === "TOPUP" ? "text-green-700" : "text-slate-700"}`}>
                    {t.type === "TOPUP" ? "+" : "−"}{RM(t.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {t.type === "TOPUP"
                      ? (t.paymentMethod ? METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod : "—")
                      : t.type === "REFUND"
                        ? <span className={`font-medium ${t.refundCategory === "TREATMENT_FAILURE" ? "text-red-600" : "text-amber-600"}`}>
                            {REFUND_CATEGORIES.find(c => c.value === t.refundCategory)?.label ?? t.refundCategory ?? "—"}
                          </span>
                        : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-blue-600">
                    {t.invoice
                      ? <a href={`/invoices/${t.invoiceId}`} className="hover:underline">{t.invoice.invoiceRef}</a>
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {t.salesReturn
                      ? <div>
                          <span className="font-mono text-red-600">{t.salesReturn.returnRef}</span>
                          {t.salesReturn.originalInvoice && (
                            <p className="text-slate-400 text-xs">{t.salesReturn.originalInvoice.invoiceRef}</p>
                          )}
                        </div>
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{t.createdBy?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400 max-w-[120px]">
                    <span title={[t.reason, t.notes].filter(Boolean).join(" | ")} className="truncate block">
                      {t.reason ?? t.notes ?? ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td colSpan={2} className="px-3 py-2.5 text-sm font-semibold text-slate-700">Current balance</td>
                <td className={`px-3 py-2.5 text-sm font-bold ${balance > 0 ? "text-green-700" : "text-slate-400"}`}>{RM(balance)}</td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
