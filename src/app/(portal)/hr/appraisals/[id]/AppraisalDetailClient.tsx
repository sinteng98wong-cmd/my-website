"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["DRAFT","SELF_REVIEW","MANAGER_REVIEW","COMPLETED","ACKNOWLEDGED"];
const STATUS_COLOR: Record<string, string> = { DRAFT:"bg-slate-100 text-slate-600", SELF_REVIEW:"bg-amber-100 text-amber-700", MANAGER_REVIEW:"bg-blue-100 text-blue-700", COMPLETED:"bg-purple-100 text-purple-700", ACKNOWLEDGED:"bg-green-100 text-green-700" };

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`text-2xl ${n <= value ? "text-amber-400" : "text-slate-200"}`}>★</button>
      ))}
      <span className="text-sm text-slate-500 ml-2 self-center">{value > 0 ? value.toFixed(1) : "—"}</span>
    </div>
  );
}

export function AppraisalDetailClient({ id, userId, isManager }: { id: string; userId: string; isManager: boolean }) {
  const router = useRouter();
  const [apr, setApr] = useState<any>(null);
  const [selfForm, setSelfForm] = useState({ selfRating: 0, selfComments: "" });
  const [mgrForm, setMgrForm] = useState({ managerRating: 0, managerComments: "", finalRating: 0, strengths: "", improvements: "", goals: "" });
  const [ackComment, setAckComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiff, setConfirmDiff] = useState(false);

  async function load() {
    const d = await fetch(`/api/hr/appraisals/${id}`).then((r) => r.json());
    setApr(d);
    setSelfForm({ selfRating: Number(d.selfRating ?? 0), selfComments: d.selfComments ?? "" });
    setMgrForm({ managerRating: Number(d.managerRating ?? 0), managerComments: d.managerComments ?? "", finalRating: Number(d.finalRating ?? 0), strengths: d.strengths ?? "", improvements: d.improvements ?? "", goals: d.goals ?? "" });
  }
  useEffect(() => { load(); }, [id]);

  const isOwnStaff = apr?.staffProfile?.user?.id === userId;
  const isReviewer = apr?.reviewer?.id === userId;

  async function submitSelf() {
    setBusy(true); setError("");
    const res = await fetch(`/api/hr/appraisals/${id}/self-review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selfForm) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    load();
  }

  async function submitManager(confirmed = false) {
    setBusy(true); setError("");
    const res = await fetch(`/api/hr/appraisals/${id}/manager-review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...mgrForm, confirmed }) });
    const d = await res.json();
    setBusy(false);
    if (d.requiresConfirmation) { setConfirmDiff(true); return; }
    if (!res.ok) { setError(d.error); return; }
    setConfirmDiff(false);
    load();
  }

  async function complete() {
    setBusy(true);
    const res = await fetch(`/api/hr/appraisals/${id}/complete`, { method: "PATCH" });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setError(d.error); return; }
    load();
  }

  async function acknowledge() {
    setBusy(true); setError("");
    const res = await fetch(`/api/hr/appraisals/${id}/acknowledge`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: ackComment || undefined }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    load();
  }

  if (!apr) return <div className="p-8 text-slate-400">Loading…</div>;

  const stepIdx = STATUSES.indexOf(apr.status);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push("/hr/appraisals")} className="text-sm text-slate-500 hover:text-slate-700">← Appraisals</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Staff info */}
        <div className="md:col-span-2 space-y-5">
          <div className="card p-5">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold text-slate-800">{apr.staffProfile?.user?.name}</h1>
                <p className="text-slate-500 text-sm">{apr.appraisalRef} · {apr.period}</p>
                <p className="text-slate-400 text-xs mt-1">Reviewer: {apr.reviewer?.name}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${STATUS_COLOR[apr.status]}`}>{apr.status.replace("_"," ")}</span>
            </div>
          </div>

          {/* Self Review */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-slate-800">Self Review</h2>
            {(isOwnStaff && ["DRAFT","SELF_REVIEW"].includes(apr.status)) ? (
              <>
                <div>
                  <label className="form-label">Self Rating</label>
                  <StarPicker value={selfForm.selfRating} onChange={(v) => setSelfForm((f) => ({ ...f, selfRating: v }))} />
                </div>
                <div>
                  <label className="form-label">Self Comments / Achievements / Challenges</label>
                  <textarea rows={5} className="form-input" value={selfForm.selfComments} onChange={(e) => setSelfForm((f) => ({ ...f, selfComments: e.target.value }))} />
                </div>
                <button onClick={submitSelf} disabled={busy} className="btn-primary text-sm">{busy ? "Submitting…" : "Submit Self Review"}</button>
              </>
            ) : (
              <div className="space-y-2 text-sm text-slate-600">
                <p><span className="font-medium">Rating:</span> {apr.selfRating ?? "—"}</p>
                <p className="whitespace-pre-wrap">{apr.selfComments ?? "Not yet submitted."}</p>
              </div>
            )}
          </div>

          {/* Manager Review */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-slate-800">Manager Review</h2>
            {((isReviewer || isManager) && apr.status === "SELF_REVIEW") ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Manager Rating</label>
                    <StarPicker value={mgrForm.managerRating} onChange={(v) => setMgrForm((f) => ({ ...f, managerRating: v }))} />
                  </div>
                  <div>
                    <label className="form-label">Final Rating</label>
                    <StarPicker value={mgrForm.finalRating} onChange={(v) => setMgrForm((f) => ({ ...f, finalRating: v }))} />
                  </div>
                </div>
                {["managerComments","strengths","improvements","goals"].map((field) => (
                  <div key={field}>
                    <label className="form-label capitalize">{field.replace(/([A-Z])/g, " $1")}</label>
                    <textarea rows={3} className="form-input" value={(mgrForm as any)[field]} onChange={(e) => setMgrForm((f) => ({ ...f, [field]: e.target.value }))} />
                  </div>
                ))}
                {confirmDiff && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                    Final rating differs significantly from manager rating. Confirm?
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => submitManager(true)} className="btn-primary text-xs">Confirm</button>
                      <button onClick={() => setConfirmDiff(false)} className="btn-secondary text-xs">Cancel</button>
                    </div>
                  </div>
                )}
                {!confirmDiff && <button onClick={() => submitManager(false)} disabled={busy} className="btn-primary text-sm">{busy ? "Saving…" : "Complete Manager Review"}</button>}
              </>
            ) : (
              <div className="space-y-2 text-sm text-slate-600">
                {apr.managerRating ? (
                  <>
                    <p><span className="font-medium">Manager Rating:</span> {apr.managerRating} · <span className="font-medium">Final:</span> {apr.finalRating}</p>
                    <p><span className="font-medium">Comments:</span> {apr.managerComments}</p>
                    <p><span className="font-medium">Strengths:</span> {apr.strengths}</p>
                    <p><span className="font-medium">Improvements:</span> {apr.improvements}</p>
                    <p><span className="font-medium">Goals:</span> {apr.goals}</p>
                  </>
                ) : <p>Not yet completed.</p>}
              </div>
            )}
          </div>

          {/* Acknowledgement */}
          {apr.status === "COMPLETED" && isOwnStaff && (
            <div className="card p-5 space-y-3">
              <h2 className="font-semibold text-slate-800">Acknowledge Appraisal</h2>
              <textarea rows={3} className="form-input text-sm" placeholder="Optional comment…" value={ackComment} onChange={(e) => setAckComment(e.target.value)} />
              <button onClick={acknowledge} disabled={busy} className="btn-primary text-sm">{busy ? "Acknowledging…" : "Acknowledge Appraisal"}</button>
            </div>
          )}
          {apr.acknowledgedAt && (
            <div className="card p-4 bg-green-50 text-sm text-green-700">
              Acknowledged on {new Date(apr.acknowledgedAt).toLocaleDateString("en-MY")}
            </div>
          )}
        </div>

        {/* Right: Status timeline */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Status Timeline</h2>
            <ol className="relative border-l border-slate-200 space-y-4 ml-3">
              {STATUSES.map((s, i) => (
                <li key={s} className={`ml-4 ${i <= stepIdx ? "text-slate-800" : "text-slate-400"}`}>
                  <span className={`absolute -left-1.5 mt-0.5 w-3 h-3 rounded-full border-2 ${i < stepIdx ? "bg-green-500 border-green-500" : i === stepIdx ? "bg-blue-500 border-blue-500" : "bg-white border-slate-300"}`} />
                  <p className="text-sm font-medium">{s.replace("_"," ")}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Rating comparison */}
          {apr.selfRating && (
            <div className="card p-5 space-y-3">
              <h2 className="font-semibold text-slate-800 text-sm">Rating Comparison</h2>
              {[["Self",apr.selfRating],["Manager",apr.managerRating],["Final",apr.finalRating]].map(([label, val]) => val && (
                <div key={label as string}>
                  <div className="flex justify-between text-xs text-slate-500 mb-1"><span>{label}</span><span>{val}</span></div>
                  <div className="w-full h-2 bg-slate-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(Number(val) / 5) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}

          {isManager && apr.status === "MANAGER_REVIEW" && (
            <button onClick={complete} disabled={busy} className="btn-primary text-sm w-full">{busy ? "…" : "Mark as Completed"}</button>
          )}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}
    </div>
  );
}
