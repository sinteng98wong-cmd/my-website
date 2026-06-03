"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const MY_STATES = [
  "Johor","Kedah","Kelantan","Melaka","Negeri Sembilan","Pahang",
  "Perak","Perlis","Pulau Pinang","Sabah","Sarawak","Selangor",
  "Terengganu","Kuala Lumpur","Labuan","Putrajaya",
];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function NewCompanyPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    legalName:              "",
    tradingName:            "",
    registrationNo:         "",
    address:                "",
    city:                   "",
    state:                  "",
    postcode:               "",
    country:                "Malaysia",
    phone:                  "",
    email:                  "",
    financialYearStartMonth: 1,
    sstRegistered:          false,
    eInvoiceEnabled:        false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.legalName.trim()) { setError("Legal name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      router.push(`/admin/companies/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/admin/companies" className="text-sm text-slate-400 hover:text-slate-600">Companies</Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-600">New Company</span>
      </div>
      <h1 className="page-title mb-6">Add Company</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="form-label">Legal Name (SSM) *</label>
          <input className="form-input" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
        </div>
        <div>
          <label className="form-label">Trading Name</label>
          <input className="form-input" value={form.tradingName} onChange={(e) => setForm({ ...form, tradingName: e.target.value })} />
        </div>
        <div>
          <label className="form-label">SSM Registration No</label>
          <input className="form-input" value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} />
        </div>
        <div>
          <label className="form-label">Address</label>
          <textarea className="form-input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="form-label">City</label>
            <input className="form-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <label className="form-label">State</label>
            <select className="form-input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
              <option value="">Select</option>
              {MY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Postcode</label>
            <input className="form-input" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Phone</label>
            <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="form-label">Financial Year Start Month</label>
          <select className="form-input w-56" value={form.financialYearStartMonth} onChange={(e) => setForm({ ...form, financialYearStartMonth: Number(e.target.value) })}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.sstRegistered} onChange={(e) => setForm({ ...form, sstRegistered: e.target.checked })} className="rounded border-slate-300" />
            <span className="text-sm text-slate-700">SST Registered</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.eInvoiceEnabled} onChange={(e) => setForm({ ...form, eInvoiceEnabled: e.target.checked })} className="rounded border-slate-300" />
            <span className="text-sm text-slate-700">e-Invoice Enabled</span>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary px-6 py-2 text-sm">
            {saving ? "Creating…" : "Create Company"}
          </button>
          <Link href="/admin/companies" className="btn-outline px-4 py-2 text-sm">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
