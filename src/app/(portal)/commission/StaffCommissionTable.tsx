"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

const PCT = (attended: number, total: number) =>
  total > 0 ? Math.round((attended / total) * 100) : 0;

type StaffRow = {
  id: string; staffName: string; attendedDays: number; totalWorkDays: number;
  grossCommission: number; proRatedComm: number;
  forfeited: boolean; forfeitReason: string | null; status: string;
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT:    "badge-slate",
  LOCKED:   "badge-green",
  REVERSED: "badge-red",
};

function Toast({ message, type, onClose }: {
  message: string; type: "success" | "error"; onClose: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium shadow-sm ${
      type === "success"
        ? "bg-green-50 border border-green-200 text-green-800"
        : "bg-red-50 border border-red-200 text-red-800"
    }`}>
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
          type === "success" ? "bg-green-500" : "bg-red-500"
        }`}>{type === "success" ? "✓" : "✕"}</span>
        {message}
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
    </div>
  );
}

export function StaffCommissionTable({ rows, clinicId, month, canRun, canLock }: {
  rows: StaffRow[]; clinicId: string; month: string; canRun: boolean; canLock: boolean;
}) {
  const router = useRouter();
  const [busy,  setBusy]  = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function runCalculation() {
    setBusy("run");
    const res = await fetch("/api/commission/staff/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId, month }),
    });
    setBusy(null);
    const d = await res.json();
    if (!res.ok) { showToast(d.error ?? "Calculation failed", "error"); return; }
    showToast(`Generated ${d.results?.length ?? 0} staff commission record(s).`, "success");
    router.refresh();
  }

  async function rowAction(id: string, action: "lock" | "reverse") {
    setBusy(id);
    const res = await fetch(`/api/commission/staff/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    const d = await res.json();
    if (!res.ok) { showToast(d.error ?? "Action failed", "error"); return; }
    showToast(action === "lock" ? "Commission locked." : "Commission reversed.", "success");
    router.refresh();
  }

  const draftCount  = rows.filter(r => r.status === "DRAFT").length;
  const lockedCount = rows.filter(r => r.status === "LOCKED").length;
  const forfeitCount = rows.filter(r => r.forfeited).length;

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-700">Staff Commission — {month}</h2>
            {rows.length > 0 && (
              <div className="flex items-center gap-2">
                {draftCount  > 0 && <span className="badge-slate">{draftCount} Draft</span>}
                {lockedCount > 0 && <span className="badge-green">{lockedCount} Locked</span>}
                {forfeitCount > 0 && <span className="badge-red">{forfeitCount} Forfeited</span>}
              </div>
            )}
          </div>
          {canRun && (
            <button onClick={runCalculation} disabled={!!busy}
              className="btn-primary text-xs gap-1.5">
              {busy === "run"
                ? <><Spinner /> Calculating…</>
                : <><span>⟳</span> Run calculation</>
              }
            </button>
          )}
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl">👥</div>
            <div>
              <p className="font-semibold text-slate-700">No records for {month}</p>
              {canRun && (
                <p className="text-sm text-slate-400 mt-1">
                  Click <strong>Run calculation</strong> to generate commission records for all active staff.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Attendance</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Gross Comm</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Pro-rated</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(c => {
                  const pct = PCT(c.attendedDays, c.totalWorkDays);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 text-xs font-semibold flex-shrink-0">
                            {c.staffName.split(" ").map(w => w[0]).slice(0, 2).join("")}
                          </div>
                          <span className="font-medium text-slate-900">{c.staffName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium text-slate-700">{c.attendedDays} / {c.totalWorkDays} days</span>
                          <div className="w-20 bg-slate-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-amber-500" : "bg-red-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums text-slate-600">{RM(c.grossCommission)}</td>
                      <td className="px-6 py-4 text-right tabular-nums">
                        {c.forfeited ? (
                          <span className="text-red-400 line-through text-sm">{RM(c.proRatedComm)}</span>
                        ) : (
                          <span className="font-semibold text-slate-900">{RM(c.proRatedComm)}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {c.forfeited ? (
                          <span
                            className="badge-red cursor-help"
                            title={c.forfeitReason ?? "Commission forfeited"}
                          >
                            Forfeited
                          </span>
                        ) : (
                          <span className={STATUS_BADGE[c.status] ?? "badge-slate"}>
                            {c.status}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canLock && !c.forfeited && c.status === "DRAFT" && (
                            <button onClick={() => rowAction(c.id, "lock")} disabled={!!busy}
                              className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors">
                              Lock
                            </button>
                          )}
                          {canLock && c.status === "LOCKED" && (
                            <button onClick={() => rowAction(c.id, "reverse")} disabled={!!busy}
                              className="px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors">
                              ↩ Reverse
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                    <td colSpan={3} className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total payable</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900 tabular-nums">
                      {RM(rows.filter(r => !r.forfeited).reduce((s, r) => s + r.proRatedComm, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
    </svg>
  );
}
