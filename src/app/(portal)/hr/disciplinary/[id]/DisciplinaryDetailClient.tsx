"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_BADGE: Record<string, string> = { OPEN:"bg-red-100 text-red-700", RESPONDED:"bg-amber-100 text-amber-700", RESOLVED:"bg-green-100 text-green-700", CLOSED:"bg-slate-100 text-slate-500", APPEALED:"bg-purple-100 text-purple-700" };

export function DisciplinaryDetailClient({ id, userId, isManager, isSuperAdmin }: { id: string; userId: string; isManager: boolean; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [rec, setRec] = useState<any>(null);
  const [responseText, setResponseText] = useState("");
  const [resolveText, setResolveText] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch(`/api/hr/disciplinary/${id}`).then((r) => r.json());
    setRec(d);
  }
  useEffect(() => { load(); }, [id]);

  const isOwnStaff = rec?.staffProfile?.user?.id === userId;

  async function doAction(url: string, body: object) {
    setBusy(true); setError("");
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    load();
  }

  if (!rec) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button onClick={() => router.push("/hr/disciplinary")} className="text-sm text-slate-500 hover:text-slate-700">← Records</button>

      <div className="card p-6 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{rec.discRef}</h1>
            <p className="text-slate-500 text-sm">{rec.staffProfile?.user?.name} · {rec.clinic?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {rec.isConfidential && <span className="text-xs text-slate-500">🔒 Confidential</span>}
            <span className={`text-xs px-2 py-1 rounded ${STATUS_BADGE[rec.status]}`}>{rec.status}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-slate-400">Type:</span> <span className="font-medium">{rec.type?.replace("_"," ")}</span></div>
          <div><span className="text-slate-400">Incident Date:</span> {new Date(rec.incidentDate).toLocaleDateString("en-MY")}</div>
          {rec.responseDeadline && <div><span className="text-slate-400">Response Deadline:</span> {new Date(rec.responseDeadline).toLocaleDateString("en-MY")}</div>}
          {rec.resolvedAt && <div><span className="text-slate-400">Resolved:</span> {new Date(rec.resolvedAt).toLocaleDateString("en-MY")} by {rec.resolvedBy?.name}</div>}
        </div>

        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Incident Description</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded p-3">{rec.incidentDesc}</p>
        </div>

        {rec.actionTaken && (
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Action Taken</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded p-3">{rec.actionTaken}</p>
          </div>
        )}

        {rec.staffResponse && (
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Staff Response</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded p-3">{rec.staffResponse}</p>
          </div>
        )}
      </div>

      {/* Staff response */}
      {isOwnStaff && rec.status === "OPEN" && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Submit Response</h2>
          <textarea rows={4} className="form-input" placeholder="Your response…" value={responseText} onChange={(e) => setResponseText(e.target.value)} />
          <button onClick={() => doAction(`/api/hr/disciplinary/${id}/respond`, { staffResponse: responseText })} disabled={busy} className="btn-primary text-sm">{busy ? "Submitting…" : "Submit Response"}</button>
        </div>
      )}

      {/* Manager: Resolve */}
      {isManager && ["OPEN","RESPONDED"].includes(rec.status) && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Resolve</h2>
          <textarea rows={3} className="form-input" placeholder="Action taken / resolution notes…" value={resolveText} onChange={(e) => setResolveText(e.target.value)} />
          <button onClick={() => doAction(`/api/hr/disciplinary/${id}/resolve`, { actionTaken: resolveText })} disabled={busy} className="btn-primary text-sm">{busy ? "Resolving…" : "Resolve"}</button>
        </div>
      )}

      {/* Super admin: Close */}
      {isSuperAdmin && rec.status !== "CLOSED" && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Close Record</h2>
          <input className="form-input text-sm" placeholder="Closing notes (optional)" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
          <button onClick={() => doAction(`/api/hr/disciplinary/${id}/close`, { notes: closeNotes })} disabled={busy} className="btn-secondary text-sm">{busy ? "Closing…" : "Close Record"}</button>
        </div>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}
    </div>
  );
}
