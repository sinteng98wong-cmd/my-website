"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LicenseType = { name: string; code: string | null; issuingBody: string | null; description: string | null };
type License = {
  id: string; scope: string; licenseNo: string | null; issuedDate: string | null; expiryDate: string;
  status: string; documentUrl: string | null; documentName: string | null; notes: string | null;
  alert90Sent: boolean; alert60Sent: boolean; alert30Sent: boolean; alert7Sent: boolean; expiredAlertSent: boolean;
  licenseType: LicenseType;
  clinic: { name: string } | null;
  staffProfile: { user: { name: string } } | null;
  createdBy: { name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:        "bg-green-100 text-green-700",
  EXPIRING_SOON: "bg-amber-100 text-amber-700",
  EXPIRED:       "bg-red-100 text-red-700",
  ARCHIVED:      "bg-slate-100 text-slate-500",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { dateStyle: "long" });
}

export function LicenseDetailClient({ license, history, daysUntilExpiry, role }: {
  license:         License;
  history:         License[];
  daysUntilExpiry: number;
  role:            string;
}) {
  const router = useRouter();
  const [showRenew, setShowRenew] = useState(false);
  const [renewExpiry,  setRenewExpiry]  = useState("");
  const [renewNo,      setRenewNo]      = useState(license.licenseNo ?? "");
  const [renewDocUrl,  setRenewDocUrl]  = useState("");
  const [renewSaving,  setRenewSaving]  = useState(false);

  const entityName = license.scope === "CLINIC" ? license.clinic?.name : license.staffProfile?.user.name;

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    setRenewSaving(true);
    const res = await fetch(`/api/licenses/${license.id}/renew`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newExpiryDate: renewExpiry, newLicenseNo: renewNo || undefined, newDocumentUrl: renewDocUrl || undefined }),
    });
    const data = await res.json();
    setRenewSaving(false);
    setShowRenew(false);
    router.push(`/licenses/${data.id}`);
  }

  const alerts = [
    { label: "90-day",  sent: license.alert90Sent },
    { label: "60-day",  sent: license.alert60Sent },
    { label: "30-day",  sent: license.alert30Sent },
    { label: "7-day",   sent: license.alert7Sent  },
    { label: "Expired", sent: license.expiredAlertSent },
  ];

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <Link href="/licenses" className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block">← Back to Licenses</Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="page-title">{license.licenseType.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 ${license.scope === "CLINIC" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
              {license.scope}
            </span>
            {entityName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLORS[license.status] ?? ""}`}>
            {license.status.replace("_", " ")}
          </span>
          {daysUntilExpiry >= 0
            ? <span className="text-sm text-slate-500">{daysUntilExpiry} days remaining</span>
            : <span className="text-sm text-red-600 font-semibold">Expired {Math.abs(daysUntilExpiry)} days ago</span>
          }
        </div>
      </div>

      {/* Details card */}
      <div className="card p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">License Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-slate-400">License No</dt><dd className="font-medium">{license.licenseNo ?? "—"}</dd></div>
          <div><dt className="text-slate-400">Issuing Body</dt><dd className="font-medium">{license.licenseType.issuingBody ?? "—"}</dd></div>
          <div><dt className="text-slate-400">Issued Date</dt><dd className="font-medium">{fmtDate(license.issuedDate)}</dd></div>
          <div><dt className="text-slate-400">Expiry Date</dt><dd className="font-medium">{fmtDate(license.expiryDate)}</dd></div>
          {license.notes && (
            <div className="col-span-2"><dt className="text-slate-400">Notes</dt><dd>{license.notes}</dd></div>
          )}
          {license.documentUrl && (
            <div className="col-span-2">
              <dt className="text-slate-400">Document</dt>
              <dd><a href={license.documentUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{license.documentName ?? "View document"}</a></dd>
            </div>
          )}
        </dl>
      </div>

      {/* Alert status */}
      <div className="card p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Alert Status</h2>
        <div className="flex gap-3 flex-wrap">
          {alerts.map(a => (
            <span key={a.label} className={`text-xs px-3 py-1 rounded-full font-medium ${a.sent ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
              {a.sent ? "✓" : "○"} {a.label}
            </span>
          ))}
        </div>
      </div>

      {/* Renewal history */}
      {history.length > 1 && (
        <div className="card p-5 mb-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Renewal History</h2>
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={h.id} className={`flex items-center justify-between text-sm p-3 rounded-lg ${i === 0 ? "bg-green-50" : "bg-slate-50"}`}>
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 ${STATUS_COLORS[h.status] ?? ""}`}>{h.status}</span>
                  <span className="text-slate-600">{h.licenseNo ?? "No number"}</span>
                </div>
                <div className="text-slate-500">
                  Expires {fmtDate(h.expiryDate)}
                  {h.documentUrl && (
                    <a href={h.documentUrl} target="_blank" rel="noreferrer" className="ml-3 text-blue-600 hover:underline">Doc</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {license.status !== "ARCHIVED" && (
        <button onClick={() => setShowRenew(true)} className="btn-primary">Renew License</button>
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
                <input className="input" value={renewNo} onChange={e => setRenewNo(e.target.value)} />
              </div>
              <div>
                <label className="label">New Document URL</label>
                <input className="input" value={renewDocUrl} onChange={e => setRenewDocUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRenew(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={renewSaving} className="btn-primary">{renewSaving ? "Renewing..." : "Renew"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
