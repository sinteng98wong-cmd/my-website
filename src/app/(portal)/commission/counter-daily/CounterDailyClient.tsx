"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Banknote, AlertCircle, Stethoscope } from "lucide-react";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

export type CounterRow = {
  id: string;
  lineIds:       string[];
  patientName:   string;
  patientRef:    string;
  doctorId:      string;
  doctorName:    string;
  treatmentName: string;
  billed:        number;
  collected:     number;
  hasLine:       boolean;
  counterVerified: boolean;
  paid:          boolean;
};

interface Props {
  day:      string;
  clinicId: string;
  rows:     CounterRow[];
}

/**
 * Counter's daily cash reconciliation. Shows billed vs collected per treatment
 * and lets the counter verify the day's cash (step ① on the payout lines).
 * Intentionally shows NO commission entitlement — that stays with the doctor
 * and finance.
 */
export function CounterDailyClient({ day, clinicId, rows }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [groupBusy, setGroupBusy] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const totalBilled    = rows.reduce((s, r) => s + r.billed, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const outstanding    = Math.round((totalBilled - totalCollected) * 100) / 100;

  const verifiable = rows.filter(r => r.hasLine && !r.counterVerified && !r.paid);
  const verifiedCount = rows.filter(r => r.hasLine && r.counterVerified).length;
  const withLine = rows.filter(r => r.hasLine).length;

  // Group rows by doctor, with per-doctor subtotals
  const doctorGroups = (() => {
    const map = new Map<string, {
      doctorId: string; doctorName: string; rows: CounterRow[];
      billed: number; collected: number; withLine: number; verified: number; pending: number;
    }>();
    for (const r of rows) {
      if (!map.has(r.doctorId)) {
        map.set(r.doctorId, { doctorId: r.doctorId, doctorName: r.doctorName, rows: [], billed: 0, collected: 0, withLine: 0, verified: 0, pending: 0 });
      }
      const g = map.get(r.doctorId)!;
      g.rows.push(r);
      g.billed += r.billed;
      g.collected += r.collected;
      if (r.hasLine) g.withLine++;
      if (r.hasLine && r.counterVerified) g.verified++;
      if (r.hasLine && !r.counterVerified && !r.paid) g.pending++;
    }
    return Array.from(map.values()).sort((a, b) => a.doctorName.localeCompare(b.doctorName));
  })();

  async function verifyRow(r: CounterRow) {
    setBusyId(r.id); setErr(""); setMsg("");
    try {
      for (const id of r.lineIds) {
        const res = await fetch(`/api/locum-payout/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "counter_verify" }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      }
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  }

  async function verifyGroup(groupRows: CounterRow[]) {
    const g = groupRows[0];
    setGroupBusy(g.doctorId); setErr(""); setMsg("");
    try {
      for (const r of groupRows) {
        if (!r.hasLine || r.counterVerified || r.paid) continue;
        for (const id of r.lineIds) {
          const res = await fetch(`/api/locum-payout/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "counter_verify" }),
          });
          if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
        }
      }
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setGroupBusy("");
    }
  }

  async function verifyAll() {
    setBulkBusy(true); setErr(""); setMsg("");
    const res = await fetch("/api/locum-payout/counter-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, clinicId }),
    });
    const d = await res.json();
    setBulkBusy(false);
    if (!res.ok) { setErr(d.error ?? "Failed to verify"); return; }
    setMsg(d.verified > 0 ? `${d.verified} treatment${d.verified === 1 ? "" : "s"} verified` : "Nothing new to verify");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Day picker + summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card flex items-start gap-3">
          <div className="icon-box-blue"><Banknote size={20} /></div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Billed</p>
            <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{RM(totalBilled)}</p>
          </div>
        </div>
        <div className="stat-card flex items-start gap-3">
          <div className="icon-box-emerald bg-green-100 text-green-600"><CheckCircle2 size={20} /></div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient Paid</p>
            <p className="text-xl font-bold text-green-700 mt-1 tabular-nums">{RM(totalCollected)}</p>
          </div>
        </div>
        <div className="stat-card flex items-start gap-3">
          <div className={`icon-box-sm ${outstanding > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"}`}><AlertCircle size={20} /></div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</p>
            <p className={`text-xl font-bold mt-1 tabular-nums ${outstanding > 0 ? "text-amber-600" : "text-slate-400"}`}>{RM(outstanding)}</p>
          </div>
        </div>
        <form className="stat-card flex flex-col justify-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Day</label>
          <div className="flex gap-2">
            <input type="date" name="day" defaultValue={day} className="form-input text-sm py-1.5 flex-1" />
            <button type="submit" className="btn-secondary text-xs">View</button>
          </div>
        </form>
      </div>

      {/* Verify-all bar */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-500">
          {verifiedCount}/{withLine} verified
          {verifiable.length > 0 && <span className="text-amber-600 font-medium"> · {verifiable.length} pending</span>}
        </p>
        {verifiable.length > 0 && (
          <button onClick={verifyAll} disabled={bulkBusy} className="btn-primary text-sm bg-green-600 hover:bg-green-700 focus:ring-green-500 ml-auto">
            {bulkBusy ? "Verifying…" : `Verify All Cash (${verifiable.length})`}
          </button>
        )}
        {msg && <span className="text-xs text-green-600">{msg}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {/* Grouped by doctor */}
      {rows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Banknote size={24} /></div>
            <p className="font-medium text-slate-700">No treatments on {day}</p>
            <p className="text-sm text-slate-400">Pick another day to reconcile</p>
          </div>
        </div>
      ) : (
        doctorGroups.map(g => (
          <div key={g.doctorId} className="card overflow-hidden">
            {/* Doctor header with subtotals */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-slate-50/70 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <div className="icon-box-sm bg-indigo-100 text-indigo-600 flex-shrink-0"><Stethoscope size={15} /></div>
                <p className="font-semibold text-slate-900 text-sm">{g.doctorName}</p>
                <span className="text-xs text-slate-400">
                  {g.rows.length} treatment{g.rows.length === 1 ? "" : "s"} · {g.verified}/{g.withLine} verified
                </span>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Billed</p>
                  <p className="text-sm font-semibold text-slate-800 tabular-nums">{RM(g.billed)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Patient Paid</p>
                  <p className="text-sm font-semibold text-green-700 tabular-nums">{RM(g.collected)}</p>
                </div>
                {g.pending > 0 && (
                  <button
                    onClick={() => verifyGroup(g.rows)}
                    disabled={groupBusy === g.doctorId}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 font-medium transition-colors disabled:opacity-40"
                  >
                    {groupBusy === g.doctorId ? "Verifying…" : `Verify ${g.pending}`}
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    {["Patient", "Treatment", "Billed", "Patient Paid", "Cash Verified", ""].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.patientName}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.patientRef}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.treatmentName}</td>
                      <td className="px-4 py-3 tabular-nums">{RM(r.billed)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={r.collected >= r.billed ? "text-green-700" : "text-amber-600"}>{RM(r.collected)}</span>
                        {r.collected < r.billed && <p className="text-[10px] text-amber-500">{RM(r.billed - r.collected)} short</p>}
                      </td>
                      <td className="px-4 py-3">
                        {!r.hasLine
                          ? <span className="text-xs text-slate-300">no payout line</span>
                          : r.counterVerified
                            ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle2 size={13} /> Verified</span>
                            : <span className="flex items-center gap-1 text-slate-400 text-xs"><Circle size={13} /> Pending</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.hasLine && !r.counterVerified && !r.paid && (
                          <button onClick={() => verifyRow(r)} disabled={busyId === r.id}
                            className="text-xs px-2.5 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 font-medium transition-colors disabled:opacity-40">
                            {busyId === r.id ? "…" : "Verify Cash"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={2} className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase">Subtotal — {g.doctorName}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-slate-800">{RM(g.billed)}</td>
                    <td className="px-4 py-2.5 tabular-nums font-bold text-green-700">{RM(g.collected)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
