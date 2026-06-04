"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type LicenseType = { id: string; name: string; code: string | null; scope: string };
type Clinic      = { id: string; name: string };
type StaffOption = { id: string; name: string };

type UpcomingItem = {
  licenseId:     string;
  typeName:      string;
  scope:         string;
  entityName:    string;
  expiryDate:    string;
  daysRemaining: number;
  status:        string;
  licenseNo:     string | null;
};

type DashboardData = {
  total:        number;
  active:       number;
  expiringSoon: number;
  expired:      number;
  byScope:      { clinic: Record<string,number>; doctor: Record<string,number> };
  upcoming:     UpcomingItem[];
};

type LicenseRow = {
  id:             string;
  licenseTypeId:  string;
  scope:          string;
  clinicId:       string | null;
  staffProfileId: string | null;
  licenseNo:      string | null;
  issuedDate:     string | null;
  expiryDate:     string;
  status:         string;
  documentUrl:    string | null;
  documentName:   string | null;
  notes:          string | null;
  daysUntilExpiry:number;
  licenseType:    { name: string; code: string | null; issuingBody: string | null };
  clinic:         { name: string } | null;
  staffProfile:   { user: { name: string } } | null;
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:        "bg-green-100 text-green-700",
  EXPIRING_SOON: "bg-amber-100 text-amber-700",
  EXPIRED:       "bg-red-100 text-red-700",
  ARCHIVED:      "bg-slate-100 text-slate-500",
};

function daysBadge(days: number) {
  if (days < 0)   return <span className="font-bold text-red-600">EXPIRED</span>;
  if (days <= 7)   return <span className="font-bold text-red-600">{days}d</span>;
  if (days <= 30)  return <span className="font-semibold text-orange-600">{days}d</span>;
  if (days <= 90)  return <span className="font-semibold text-amber-600">{days}d</span>;
  return <span className="text-green-700">{days}d</span>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });
}

export function LicensesClient({ clinics, licenseTypes, staffOptions, role }: {
  clinics:      Clinic[];
  licenseTypes: LicenseType[];
  staffOptions: StaffOption[];
  role:         string;
}) {
  const [tab,       setTab]       = useState<"all" | "clinic" | "doctor">("all");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [licenses,  setLicenses]  = useState<LicenseRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [showRenew, setShowRenew] = useState<string | null>(null);

  // Add form state
  const [addScope,   setAddScope]   = useState<"CLINIC" | "DOCTOR">("CLINIC");
  const [addClinic,  setAddClinic]  = useState("");
  const [addStaff,   setAddStaff]   = useState("");
  const [addTypeId,  setAddTypeId]  = useState("");
  const [addNo,      setAddNo]      = useState("");
  const [addIssued,  setAddIssued]  = useState("");
  const [addExpiry,  setAddExpiry]  = useState("");
  const [addDocUrl,  setAddDocUrl]  = useState("");
  const [addNotes,   setAddNotes]   = useState("");
  const [addSaving,  setAddSaving]  = useState(false);

  // Renew form state
  const [renewExpiry, setRenewExpiry] = useState("");
  const [renewNo,     setRenewNo]     = useState("");
  const [renewDocUrl, setRenewDocUrl] = useState("");
  const [renewSaving, setRenewSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [dash, lics] = await Promise.all([
      fetch("/api/licenses/dashboard").then(r => r.json()),
      fetch("/api/licenses").then(r => r.json()),
    ]);
    setDashboard(dash);
    setLicenses(lics);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filteredTypes = licenseTypes.filter(t =>
    tab === "all" ? true : tab === "clinic" ? t.scope === "CLINIC" : t.scope === "DOCTOR"
  );

  const filteredLicenses = licenses.filter(l =>
    tab === "all" ? true : tab === "clinic" ? l.scope === "CLINIC" : l.scope === "DOCTOR"
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true);
    await fetch("/api/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseTypeId:  addTypeId,
        scope:          addScope,
        clinicId:       addScope === "CLINIC" ? addClinic : null,
        staffProfileId: addScope === "DOCTOR" ? addStaff  : null,
        licenseNo:      addNo || null,
        issuedDate:     addIssued || null,
        expiryDate:     addExpiry,
        documentUrl:    addDocUrl || null,
        notes:          addNotes || null,
      }),
    });
    setShowAdd(false);
    setAddSaving(false);
    await load();
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!showRenew) return;
    setRenewSaving(true);
    await fetch(`/api/licenses/${showRenew}/renew`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newExpiryDate:  renewExpiry,
        newLicenseNo:   renewNo   || undefined,
        newDocumentUrl: renewDocUrl || undefined,
      }),
    });
    setShowRenew(null);
    setRenewSaving(false);
    await load();
  }

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Licenses &amp; Compliance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track clinic and doctor licenses, expiry alerts, and renewals</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add License</button>
      </div>

      {/* Alert banners */}
      {dashboard && dashboard.expired > 0 && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm font-medium">
          🔴 {dashboard.expired} license{dashboard.expired > 1 ? "s" : ""} expired — immediate action needed
        </div>
      )}
      {dashboard && dashboard.expiringSoon > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-700 text-sm font-medium">
          🟡 {dashboard.expiringSoon} license{dashboard.expiringSoon > 1 ? "s" : ""} expiring within 90 days
        </div>
      )}

      {/* Summary cards */}
      {dashboard && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total",         value: dashboard.total,        color: "text-slate-700" },
            { label: "Active",        value: dashboard.active,        color: "text-green-600" },
            { label: "Expiring Soon", value: dashboard.expiringSoon,  color: "text-amber-600" },
            { label: "Expired",       value: dashboard.expired,       color: "text-red-600"   },
          ].map(c => (
            <div key={c.label} className="card p-4">
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        {(["all","clinic","doctor"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t === "all" ? "All" : t === "clinic" ? "Clinic Licenses" : "Doctor Licenses"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Scope</th>
              <th className="px-4 py-3 text-left">Clinic / Doctor</th>
              <th className="px-4 py-3 text-left">License No</th>
              <th className="px-4 py-3 text-left">Expiry</th>
              <th className="px-4 py-3 text-left">Days Left</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLicenses.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No licenses found</td></tr>
            )}
            {filteredLicenses.map(l => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{l.licenseType.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.scope === "CLINIC" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                    {l.scope}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {l.scope === "CLINIC" ? l.clinic?.name : l.staffProfile?.user.name}
                  {l.scope === "DOCTOR" && l.licenseType.name.toLowerCase().includes("apc") && l.status === "EXPIRED" && (
                    <span className="ml-2 text-xs text-red-600 font-semibold">⚠ Cannot practise</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{l.licenseNo ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(l.expiryDate)}</td>
                <td className="px-4 py-3">{daysBadge(l.daysUntilExpiry)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[l.status] ?? ""}`}>
                    {l.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/licenses/${l.id}`} className="text-blue-600 hover:underline text-xs">View</Link>
                    <button onClick={() => { setShowRenew(l.id); setRenewExpiry(""); setRenewNo(l.licenseNo ?? ""); setRenewDocUrl(""); }}
                      className="text-green-600 hover:underline text-xs">Renew</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Add License</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="label">Scope</label>
                <div className="flex gap-4 mt-1">
                  {(["CLINIC","DOCTOR"] as const).map(s => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={addScope === s} onChange={() => setAddScope(s)} />
                      <span className="text-sm">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              {addScope === "CLINIC" ? (
                <div>
                  <label className="label">Clinic</label>
                  <select className="input" value={addClinic} onChange={e => setAddClinic(e.target.value)} required>
                    <option value="">Select clinic</option>
                    {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="label">Doctor</label>
                  <select className="input" value={addStaff} onChange={e => setAddStaff(e.target.value)} required>
                    <option value="">Select doctor</option>
                    {staffOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">License Type</label>
                <select className="input" value={addTypeId} onChange={e => setAddTypeId(e.target.value)} required>
                  <option value="">Select type</option>
                  {licenseTypes.filter(t => t.scope === addScope).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">License No</label>
                  <input className="input" value={addNo} onChange={e => setAddNo(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <label className="label">Issued Date</label>
                  <input className="input" type="date" value={addIssued} onChange={e => setAddIssued(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Expiry Date <span className="text-red-500">*</span></label>
                <input className="input" type="date" value={addExpiry} onChange={e => setAddExpiry(e.target.value)} required />
              </div>
              <div>
                <label className="label">Document URL</label>
                <input className="input" value={addDocUrl} onChange={e => setAddDocUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={addNotes} onChange={e => setAddNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={addSaving} className="btn-primary">{addSaving ? "Saving..." : "Add License"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renew modal */}
      {showRenew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Renew License</h2>
            <form onSubmit={handleRenew} className="space-y-3">
              <div>
                <label className="label">New Expiry Date <span className="text-red-500">*</span></label>
                <input className="input" type="date" value={renewExpiry} onChange={e => setRenewExpiry(e.target.value)} required />
              </div>
              <div>
                <label className="label">New License No</label>
                <input className="input" value={renewNo} onChange={e => setRenewNo(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="label">New Document URL</label>
                <input className="input" value={renewDocUrl} onChange={e => setRenewDocUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRenew(null)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={renewSaving} className="btn-primary">{renewSaving ? "Renewing..." : "Renew"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
