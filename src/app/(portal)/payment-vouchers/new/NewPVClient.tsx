"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string; directorId: string | null; picId: string | null };
type Category = { id: string; name: string };

type InvoiceLine = {
  invoiceType: string;
  invoiceNo: string;
  invoiceDate: string;
  description: string;
  amount: string;
  categoryId: string;
  notes: string;
  labJobId: string;
  stockInvoiceId: string;
  poolOrderId: string;
  fromClinicId: string;
};

const INVOICE_TYPES = [
  { value: "GENERAL",     label: "General" },
  { value: "LAB",         label: "Lab Fee" },
  { value: "MATERIALS",   label: "Materials" },
  { value: "INTERBRANCH", label: "Inter-branch" },
];

const emptyLine = (): InvoiceLine => ({
  invoiceType: "GENERAL",
  invoiceNo: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  categoryId: "",
  notes: "",
  labJobId: "",
  stockInvoiceId: "",
  poolOrderId: "",
  fromClinicId: "",
});

export function NewPVClient({
  clinics,
  categories,
}: {
  clinics: Clinic[];
  categories: Category[];
}) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState("");
  const [pvDefaults, setPvDefaults] = useState<any>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [paymentTo, setPaymentTo] = useState<"supplier" | "interbranch">("supplier");
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [accountName, setAccountName] = useState("");
  const [notes, setNotes] = useState("");
  const [invoices, setInvoices] = useState<InvoiceLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedClinic = clinics.find((c) => c.id === clinicId);
  const noDirector = selectedClinic && !selectedClinic.directorId;
  const isGrouped = pvDefaults?.pvMode === "GROUPED";

  // Load defaults when clinic changes — auto-fills bank + shows grouped clinics
  const handleClinicChange = useCallback(async (id: string) => {
    setClinicId(id);
    setPvDefaults(null);
    setBankName("");
    setAccountNo("");
    setAccountName("");
    if (!id) return;
    setLoadingDefaults(true);
    try {
      const res = await fetch(`/api/payment-vouchers/defaults?clinicId=${id}`);
      if (res.ok) {
        const d = await res.json();
        setPvDefaults(d);
        // Auto-fill bank details from settings
        setBankName(d.bankName ?? "");
        setAccountNo(d.bankAccountNo ?? "");
        setAccountName(d.bankAccountName ?? "");
      }
    } catch {}
    setLoadingDefaults(false);
  }, []);

  const total = invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  async function searchSuppliers(q: string) {
    setSupplierSearch(q);
    if (q.length < 1) { setSuppliers([]); return; }
    const res = await fetch(`/api/suppliers?search=${encodeURIComponent(q)}`);
    if (res.ok) setSuppliers(await res.json());
  }

  function updateLine(idx: number, field: keyof InvoiceLine, value: string) {
    setInvoices((prev) => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line));
  }

  function addLine() { setInvoices((prev) => [...prev, emptyLine()]); }

  function removeLine(idx: number) {
    setInvoices((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save(submit: boolean) {
    setError("");
    if (!clinicId) { setError("Please select a clinic."); return; }
    const validInvoices = invoices.filter((i) => i.invoiceNo && i.amount);
    if (validInvoices.length === 0) { setError("Add at least one invoice with invoice number and amount."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/payment-vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicId,
          supplierId: paymentTo === "supplier" ? supplierId || null : null,
          bankName: bankName || null,
          accountNo: accountNo || null,
          accountName: accountName || null,
          notes: notes || null,
          invoices: validInvoices,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed to create PV");
        return;
      }
      const pv = await res.json();

      if (submit) {
        const submitRes = await fetch(`/api/payment-vouchers/${pv.id}/submit`, { method: "PATCH" });
        if (!submitRes.ok) {
          const err = await submitRes.json();
          setError(err.error ?? "PV saved but submit failed");
          router.push(`/payment-vouchers/${pv.id}`);
          return;
        }
      }

      router.push(`/payment-vouchers/${pv.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-sm">← Back</button>
        <h1 className="page-title">New Payment Voucher</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>
      )}

      {/* Section 1: Clinic & Supplier */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">1. Clinic & Payee</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Branch *</label>
            <select className="form-input" value={clinicId} onChange={(e) => handleClinicChange(e.target.value)}>
              <option value="">Select branch...</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {loadingDefaults && <p className="text-xs text-slate-400 mt-1">Loading settings…</p>}
            {noDirector && (
              <p className="text-amber-600 text-xs mt-1">⚠ No director configured for this branch. PV cannot be submitted.</p>
            )}
            {pvDefaults && isGrouped && pvDefaults.groupedClinics.length > 1 && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                <strong>Grouped mode:</strong> This PV will cover {pvDefaults.groupedClinics.length} branches sharing the same bank account:
                <ul className="mt-1 space-y-0.5">
                  {pvDefaults.groupedClinics.map((c: any) => (
                    <li key={c.id} className="ml-2">• {c.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {pvDefaults && !isGrouped && (
              <p className="text-xs text-slate-400 mt-1">Per-branch mode — bank details loaded from branch settings.</p>
            )}
          </div>
          <div>
            <label className="form-label">Payment To</label>
            <div className="flex gap-3 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={paymentTo === "supplier"} onChange={() => setPaymentTo("supplier")} />
                External Supplier
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={paymentTo === "interbranch"} onChange={() => setPaymentTo("interbranch")} />
                Inter-branch
              </label>
            </div>
          </div>
        </div>

        {paymentTo === "supplier" && (
          <div className="mt-4">
            <label className="form-label">Supplier</label>
            <input
              className="form-input"
              placeholder="Search supplier..."
              value={supplierSearch}
              onChange={(e) => searchSuppliers(e.target.value)}
            />
            {suppliers.length > 0 && (
              <div className="border border-slate-200 rounded-md mt-1 max-h-40 overflow-y-auto">
                {suppliers.map((s) => (
                  <div
                    key={s.id}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                    onClick={() => { setSupplierId(s.id); setSupplierSearch(s.name); setSuppliers([]); setBankName(s.bankName ?? ""); setAccountNo(s.accountNo ?? ""); setAccountName(s.accountName ?? ""); }}
                  >
                    {s.name}
                    {s.code && <span className="text-slate-400 ml-2">({s.code})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <label className="form-label">
              Bank Name
              {pvDefaults?.bankName && <span className="ml-1 text-xs text-green-600 font-normal">✓ from settings</span>}
            </label>
            <input className="form-input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Maybank" />
          </div>
          <div>
            <label className="form-label">
              Account No
              {pvDefaults?.bankAccountNo && <span className="ml-1 text-xs text-green-600 font-normal">✓ from settings</span>}
            </label>
            <input className="form-input" value={accountNo} onChange={(e) => setAccountNo(e.target.value)} />
          </div>
          <div>
            <label className="form-label">
              Account Name
              {pvDefaults?.bankAccountName && <span className="ml-1 text-xs text-green-600 font-normal">✓ from settings</span>}
            </label>
            <input className="form-input" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <label className="form-label">Notes</label>
          <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Section 2: Invoices */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">2. Supplier Invoices</h2>
          <button onClick={addLine} className="btn-outline text-xs">+ Add Invoice</button>
        </div>

        <div className="space-y-4">
          {invoices.map((line, idx) => (
            <div key={idx} className="border border-slate-200 rounded-md p-4 relative">
              {invoices.length > 1 && (
                <button
                  onClick={() => removeLine(idx)}
                  className="absolute top-2 right-2 text-red-400 hover:text-red-600 text-xs"
                >
                  Remove
                </button>
              )}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="form-label">Type</label>
                  <select className="form-input" value={line.invoiceType} onChange={(e) => updateLine(idx, "invoiceType", e.target.value)}>
                    {INVOICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-input" value={line.categoryId} onChange={(e) => updateLine(idx, "categoryId", e.target.value)}>
                    <option value="">Select category...</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="form-label">Invoice No *</label>
                  <input className="form-input" value={line.invoiceNo} onChange={(e) => updateLine(idx, "invoiceNo", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Invoice Date</label>
                  <input type="date" className="form-input" value={line.invoiceDate} onChange={(e) => updateLine(idx, "invoiceDate", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Amount (RM) *</label>
                  <input type="number" step="0.01" className="form-input" value={line.amount} onChange={(e) => updateLine(idx, "amount", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Description *</label>
                <input className="form-input" value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} />
              </div>
              <div className="mt-2">
                <label className="form-label">Notes</label>
                <input className="form-input" value={line.notes} onChange={(e) => updateLine(idx, "notes", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: Summary */}
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">3. Summary</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-sm">{invoices.filter(i => i.invoiceNo && i.amount).length} invoice(s)</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Total Amount</p>
            <p className="text-2xl font-bold text-slate-900">RM {total.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => save(false)} disabled={saving} className="btn-outline">
          {saving ? "Saving..." : "Save as Draft"}
        </button>
        <button onClick={() => save(true)} disabled={saving || !!noDirector} className="btn-primary">
          {saving ? "Submitting..." : "Submit for Approval"}
        </button>
      </div>
    </div>
  );
}
