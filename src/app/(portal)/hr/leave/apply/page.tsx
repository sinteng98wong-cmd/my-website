"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Balance = { leaveType: string; balance: string; entitled: string };

const LEAVE_TYPES = [
  "ANNUAL", "MEDICAL", "EMERGENCY", "MATERNITY", "PATERNITY",
  "UNPAID", "REPLACEMENT", "HOSPITALISATION", "COMPASSIONATE",
];
const REASON_REQUIRED = ["EMERGENCY", "UNPAID"];
const NO_BALANCE = ["EMERGENCY", "MATERNITY", "PATERNITY"];

export default function ApplyLeavePage() {
  const router = useRouter();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [days, setDays] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/hr/leave-balances").then((r) => r.json()).then((d) => Array.isArray(d) && setBalances(d)).catch(() => {});
  }, []);

  // Live working-day estimate (client side, excludes Sundays only)
  useEffect(() => {
    if (!startDate || !endDate) { setDays(null); return; }
    const s = new Date(startDate), e = new Date(endDate);
    if (e < s) { setDays(null); return; }
    let n = 0; const cur = new Date(s);
    while (cur <= e) { if (cur.getDay() !== 0) n++; cur.setDate(cur.getDate() + 1); }
    setDays(n);
  }, [startDate, endDate]);

  const balOf = (t: string) => Number(balances.find((b) => b.leaveType === t)?.balance ?? 0);
  const currentBal = balOf(leaveType);
  const overBalance = !NO_BALANCE.includes(leaveType) && days !== null && days > currentBal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (REASON_REQUIRED.includes(leaveType) && !reason.trim()) { setError("Reason is required for this leave type."); return; }
    if (leaveType === "MEDICAL" && !attachmentUrl.trim()) { setError("An MC attachment URL is required for medical leave."); return; }
    setSaving(true);
    const res = await fetch("/api/hr/leave", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaveType, startDate, endDate, reason: reason || undefined, attachmentUrl: attachmentUrl || undefined }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error ?? "Failed to apply"); return; }
    router.push("/hr/leave");
    router.refresh();
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/hr/leave" className="text-sm text-slate-500 hover:text-slate-700">← Leave Dashboard</Link>
        <h1 className="page-title mt-2">Apply for Leave</h1>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

        <div>
          <label className="form-label">Leave Type</label>
          <select className="form-input" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
                {!NO_BALANCE.includes(t) ? ` — ${balOf(t)} day(s) left` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Start Date</label>
            <input type="date" required className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label">End Date</label>
            <input type="date" required className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {days !== null && (
          <div className={`text-sm rounded px-3 py-2 ${overBalance ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-50 text-slate-600"}`}>
            Working days (excl. Sundays): <strong>{days}</strong>
            {!NO_BALANCE.includes(leaveType) && <> · You have <strong>{currentBal}</strong> day(s) remaining.</>}
            {overBalance && <div className="text-xs mt-0.5">This request exceeds your balance.</div>}
          </div>
        )}

        <div>
          <label className="form-label">Reason {REASON_REQUIRED.includes(leaveType) && <span className="text-red-500">*</span>}</label>
          <textarea rows={3} className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {leaveType === "MEDICAL" && (
          <div>
            <label className="form-label">MC Attachment URL <span className="text-red-500">*</span></label>
            <input className="form-input" value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://…" />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Submitting…" : "Submit Application"}</button>
          <Link href="/hr/leave" className="btn-outline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
