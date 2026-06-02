"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdjustSplitRate({
  id,
  currentSplitRate,
  currentStatus,
}: {
  id: string;
  currentSplitRate: number;
  currentStatus: string;
}) {
  const router  = useRouter();
  const [open,  setOpen]  = useState(false);
  const [rate,  setRate]  = useState(String(currentSplitRate));
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  const rateN   = parseFloat(rate) || 0;
  const changed = rateN !== currentSplitRate;

  if (!["DRAFT", "APPROVED"].includes(currentStatus)) return null;

  async function save() {
    if (!changed) { setOpen(false); return; }
    if (rateN <= 0 || rateN > 100) { setError("Rate must be between 1 and 100"); return; }
    setBusy(true); setError("");
    const res = await fetch(`/api/commission/locum-statement/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "adjust_split", splitRate: rateN }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to update");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 hover:text-blue-600 underline decoration-dashed underline-offset-2 transition-colors"
      >
        Adjust split rate
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900">Adjust Split Rate</h3>
              <p className="text-sm text-slate-500 mt-1">
                Changing the split rate will regenerate the entire statement with the new rate applied to all buckets.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Split Rate (%)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                <input
                  type="number"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  min={1} max={100} step={0.5}
                  className="form-input pl-8"
                  autoFocus
                />
              </div>
            </div>

            {changed && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                Statement will be regenerated at <strong>{rateN}%</strong> (was {currentSplitRate}%).
                All bucket totals and the final payout will update automatically.
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setOpen(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
                {busy ? "Regenerating…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
