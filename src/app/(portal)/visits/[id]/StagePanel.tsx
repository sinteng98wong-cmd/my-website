"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, PlayCircle, ClipboardList } from "lucide-react";

type Stage = {
  id: string; name: string; order: number; status: string; completedAt: string | null;
};
type Plan = {
  id: string; planRef: string; title: string; status: string;
  totalAmount: number; totalPaid: number;
  stages: Stage[];
};

interface Props {
  visitId: string;
  plans: Plan[];
  canComplete: boolean;
}

/**
 * Shows the patient's active treatment plans during a visit so the doctor can
 * mark the stage performed today as done — which releases the corresponding
 * payout percentage automatically.
 */
export function StagePanel({ visitId, plans, canComplete }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [notes,  setNotes]  = useState("");
  const [noteFor, setNoteFor] = useState("");
  const [err,    setErr]    = useState("");

  if (plans.length === 0) return null;

  async function complete(planId: string, stageId: string) {
    setBusyId(stageId); setErr("");
    const res = await fetch(`/api/treatment-plans/${planId}/stages/${stageId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId, clinicalNotes: noteFor === stageId ? notes || undefined : undefined }),
    });
    setBusyId("");
    if (!res.ok) { const d = await res.json(); setErr(d.error ?? "Failed to complete stage"); return; }
    setNotes(""); setNoteFor("");
    router.refresh();
  }

  return (
    <div className="card p-5 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="icon-box-sm bg-indigo-100 text-indigo-600"><ClipboardList size={15} /></div>
        <h2 className="font-semibold text-slate-900">Treatment Plan Progress</h2>
        <span className="text-xs text-slate-400">— mark today&apos;s stage as done to release the doctor&apos;s payout %</span>
      </div>

      <div className="space-y-5">
        {plans.map(plan => {
          const done  = plan.stages.filter(s => s.status === "COMPLETED" || s.status === "SKIPPED").length;
          const next  = plan.stages.find(s => s.status !== "COMPLETED" && s.status !== "SKIPPED");
          const paidPct = plan.totalAmount > 0 ? Math.round((plan.totalPaid / plan.totalAmount) * 100) : 0;

          return (
            <div key={plan.id} className="border border-slate-100 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Link href={`/treatment-plans/${plan.id}`} className="font-medium text-slate-800 text-sm hover:text-blue-700">
                  {plan.title}
                </Link>
                <span className="badge-slate text-[10px] font-mono">{plan.planRef}</span>
                <span className="text-xs text-slate-400">{done} / {plan.stages.length} stages · patient paid {paidPct}%</span>
              </div>

              <ol className="space-y-1.5">
                {plan.stages.map(s => {
                  const isDone = s.status === "COMPLETED" || s.status === "SKIPPED";
                  const isNext = next?.id === s.id;
                  return (
                    <li key={s.id} className="flex items-center gap-2.5">
                      {isDone
                        ? <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
                        : isNext
                          ? <PlayCircle size={15} className="text-blue-500 flex-shrink-0" />
                          : <Circle size={15} className="text-slate-200 flex-shrink-0" />}
                      <span className={`text-sm ${isDone ? "text-slate-400 line-through" : isNext ? "text-slate-800 font-medium" : "text-slate-400"}`}>
                        {s.order}. {s.name}
                      </span>
                      {isNext && canComplete && (
                        <span className="flex items-center gap-1.5 ml-auto">
                          {noteFor === s.id ? (
                            <>
                              <input
                                value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder="Clinical notes (optional)"
                                className="form-input text-xs py-1 w-48"
                              />
                              <button
                                onClick={() => complete(plan.id, s.id)}
                                disabled={busyId === s.id}
                                className="btn-primary text-xs py-1 px-2.5 disabled:opacity-40"
                              >
                                {busyId === s.id ? "Saving…" : "Confirm"}
                              </button>
                              <button onClick={() => setNoteFor("")} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                            </>
                          ) : (
                            <button
                              onClick={() => setNoteFor(s.id)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 font-medium transition-colors"
                            >
                              Done at this visit
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
      {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
    </div>
  );
}
